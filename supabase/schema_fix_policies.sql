-- VeryHevy — FIX récursion infinie RLS sessions/joins/requests/messages.
-- À exécuter APRÈS schema_chat.sql. Idempotent.
--
-- Cause : « sessions readable » lisait session_joins, dont la policy
-- (« joins readable ») relisait sessions (et session_joins elle-même)
-- → « infinite recursion detected in policy for relation sessions ».
-- Solution : helpers SECURITY DEFINER (bypass RLS) pour les tests
-- hôte/inscrit, utilisés par toutes les policies. Comportement inchangé :
-- anonymat des inscrits (hôte + membres) préservé.
--
-- Corrige aussi au passage l'acceptation d'une candidature : l'hôte
-- insère désormais le membre dans session_joins (avant : RLS refusait
-- car auth.uid() <> user_id).

-- Helpers (bypass RLS, pas de récursion possible) ---------------------
create or replace function public.is_session_host(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions where id = sid and host = auth.uid());
$$;

create or replace function public.is_session_joiner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_joins where session_id = sid and user_id = auth.uid());
$$;

grant execute on function public.is_session_host(uuid) to authenticated;
grant execute on function public.is_session_joiner(uuid) to authenticated;

-- Sessions : publiques, hôte, invités, inscrits ------------------------
drop policy if exists "sessions readable" on public.sessions;
create policy "sessions readable" on public.sessions
  for select using (
    visibility = 'public'
    or auth.uid() = host
    or auth.uid() = any (invited)
    or public.is_session_joiner(id)
  );

-- Inscrits : hôte, soi-même, co-inscrits -------------------------------
drop policy if exists "joins readable" on public.session_joins;
create policy "joins readable" on public.session_joins
  for select using (
    public.is_session_host(session_id)
    or auth.uid() = user_id
    or public.is_session_joiner(session_id)
  );

-- Inscription : soi-même, ou l'hôte qui accepte une candidature --------
drop policy if exists "join insert" on public.session_joins;
create policy "join insert" on public.session_joins
  for insert with check (
    auth.uid() = user_id
    or public.is_session_host(session_id)
  );

drop policy if exists "leave" on public.session_joins;
create policy "leave" on public.session_joins for delete using (
  auth.uid() = user_id or public.is_session_host(session_id)
);

-- Candidatures ----------------------------------------------------------
drop policy if exists "requests readable" on public.session_requests;
create policy "requests readable" on public.session_requests
  for select using (
    auth.uid() = user_id or public.is_session_host(session_id)
  );

drop policy if exists "request decide" on public.session_requests;
create policy "request decide" on public.session_requests
  for update using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

drop policy if exists "request withdraw" on public.session_requests;
create policy "request withdraw" on public.session_requests
  for delete using (
    auth.uid() = user_id or public.is_session_host(session_id)
  );

-- Chat 1-1 ---------------------------------------------------------------
drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages
  for select using (
    (auth.uid() = from_id or auth.uid() = to_id)
    and (public.is_session_host(session_id) or public.is_session_joiner(session_id))
  );

drop policy if exists "message send" on public.messages;
create policy "message send" on public.messages
  for insert with check (
    auth.uid() = from_id
    and (public.is_session_host(session_id) or public.is_session_joiner(session_id))
  );
