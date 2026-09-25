-- VeryHevy — match + chat (après schema_social.sql).
-- Idempotent : ré-exécutable sans casser.
--
-- Modèle : sessions PUBLIQUES = inscription directe ; sessions PRIVÉES =
-- candidature (request) → l'hôte accepte → match → chat privé 1-1.
-- Anonymat : la liste des inscrits n'est lisible que par l'hôte et les
-- membres (le compteur spots_taken reste public). Les participants au
-- profil 'public' restent visibles de tous via la RPC dédiée.

-- 1. Candidatures ---------------------------------------------------------
create table if not exists public.session_requests (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  message text not null default '' check (char_length(message) <= 280),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists session_requests_session_idx on public.session_requests (session_id, status);
alter table public.session_requests enable row level security;

-- Candidater : soi-même, en pending (pas sur sa propre session).
drop policy if exists "request insert" on public.session_requests;
create policy "request insert" on public.session_requests
  for insert with check (
    auth.uid() = user_id and status = 'pending'
    and not exists (select 1 from public.sessions s where s.id = session_id and s.host = auth.uid())
  );

-- Lecture : mes candidatures, ou celles de mes sessions (hôte).
drop policy if exists "requests readable" on public.session_requests;
create policy "requests readable" on public.session_requests
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.sessions s where s.id = session_requests.session_id and s.host = auth.uid())
  );

-- Décision : l'hôte uniquement.
drop policy if exists "request decide" on public.session_requests;
create policy "request decide" on public.session_requests
  for update using (
    exists (select 1 from public.sessions s where s.id = session_requests.session_id and s.host = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s where s.id = session_requests.session_id and s.host = auth.uid())
  );

-- Retirer sa candidature : soi-même ou l'hôte.
drop policy if exists "request withdraw" on public.session_requests;
create policy "request withdraw" on public.session_requests
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.sessions s where s.id = session_requests.session_id and s.host = auth.uid())
  );

-- 2. Inscrits : restreindre la lecture (anonymat) ---------------------------
-- Avant : tout connecté lisait les joins. Maintenant : hôte + membres.
drop policy if exists "joins readable" on public.session_joins;
create policy "joins readable" on public.session_joins
  for select using (
    exists (select 1 from public.sessions s where s.id = session_joins.session_id and s.host = auth.uid())
    or auth.uid() = user_id
    or exists (
      select 1 from public.session_joins m
      where m.session_id = session_joins.session_id and m.user_id = auth.uid()
    )
  );

-- Participants au profil 'public' : visibles de tous (teaser).
create or replace function public.session_public_participants(sid uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text)
language sql security definer set search_path = public as $$
  select j.user_id, p.username, p.display_name, p.avatar_url
  from public.session_joins j
  join public.profiles p on p.id = j.user_id
  where j.session_id = sid and p.visibility = 'public';
$$;
grant execute on function public.session_public_participants(uuid) to authenticated;

-- 3. Chat 1-1 (hôte ↔ membre, dans le cadre d'une session) ------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
create index if not exists messages_thread_idx on public.messages (session_id, from_id, to_id, created_at);
create index if not exists messages_mine_idx on public.messages (from_id, to_id, created_at desc);
alter table public.messages enable row level security;

-- Membre d'une session = hôte ou inscrit (join).
-- Lecture : je suis expéditeur/destinataire ET membre de la session.
drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages
  for select using (
    (auth.uid() = from_id or auth.uid() = to_id)
    and (
      exists (select 1 from public.sessions s where s.id = messages.session_id and s.host = auth.uid())
      or exists (select 1 from public.session_joins j where j.session_id = messages.session_id and j.user_id = auth.uid())
    )
  );

-- Envoi : je suis l'expéditeur ET membre de la session.
drop policy if exists "message send" on public.messages;
create policy "message send" on public.messages
  for insert with check (
    auth.uid() = from_id
    and (
      exists (select 1 from public.sessions s where s.id = messages.session_id and s.host = auth.uid())
      or exists (select 1 from public.session_joins j where j.session_id = messages.session_id and j.user_id = auth.uid())
    )
  );
