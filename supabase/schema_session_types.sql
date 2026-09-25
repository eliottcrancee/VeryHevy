-- VeryHevy — 3 types de séances : invite / open / public.
-- À exécuter après schema_post_snapshot.sql. Idempotent.
--
--   • invite (🔒 Privée) : visible hôte + invités uniquement.
--     Invitation → notif → Accepter (join direct, déjà validé entre
--     amis) / Refuser. Hôte connu des invités.
--   • open (✨ Sur proposition) : visible par tous, HÔTE ANONYME.
--     Candidature → accept → match + chat. Pour rencontrer.
--   • public (🌍 Publique) : visible par tous, hôte affiché, mais
--     demande + validation obligatoire (fini l'inscription directe).
--
-- Migration données : 'private' → 'open' (même flux candidature),
-- 'public' reste 'public' (rejoint désormais sur validation).
-- La colonne sessions.invited[] est remplacée par session_invites.

-- Anciennes privées → sur proposition ---------------------------------
-- Ordre impératif : DROP l'ancien check AVANT l'UPDATE, sinon
-- 'open' est rejeté par l'ancien check ('public','private') → 23514.
do $$ begin
  alter table public.sessions drop constraint sessions_visibility_check;
exception when undefined_object then null; end $$;

update public.sessions set visibility = 'open' where visibility = 'private';

do $$ begin
  alter table public.sessions
    add constraint sessions_visibility_check
    check (visibility in ('invite', 'open', 'public'));
exception when duplicate_object then null; end $$;

-- Invitations avec statut ----------------------------------------------
create table if not exists public.session_invites (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists session_invites_user_idx on public.session_invites (user_id, status);
alter table public.session_invites enable row level security;

-- Inviter : l'hôte uniquement.
drop policy if exists "invite send" on public.session_invites;
create policy "invite send" on public.session_invites
  for insert with check (public.is_session_host(session_id) and status = 'pending');

-- Lecture : hôte ou invité.
drop policy if exists "invites readable" on public.session_invites;
create policy "invites readable" on public.session_invites
  for select using (auth.uid() = user_id or public.is_session_host(session_id));

-- Statut : l'invité accepte/refuse, l'hôte gère.
drop policy if exists "invite decide" on public.session_invites;
create policy "invite decide" on public.session_invites
  for update using (auth.uid() = user_id or public.is_session_host(session_id))
  with check (auth.uid() = user_id or public.is_session_host(session_id));

-- Retirer une invitation : hôte ou invité.
drop policy if exists "invite withdraw" on public.session_invites;
create policy "invite withdraw" on public.session_invites
  for delete using (auth.uid() = user_id or public.is_session_host(session_id));

-- Helper : suis-je invité (pending/accepted) ? --------------------------
create or replace function public.is_session_invited(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.session_invites
    where session_id = sid and user_id = auth.uid() and status in ('pending', 'accepted')
  );
$$;
grant execute on function public.is_session_invited(uuid) to authenticated;

-- Lecture sessions : open/public pour tous, invite pour hôte/invités/membres.
drop policy if exists "sessions readable" on public.sessions;
create policy "sessions readable" on public.sessions
  for select using (
    not public.is_blocked_by(sessions.host)
    and (
      visibility in ('open', 'public')
      or auth.uid() = host
      or public.is_session_joiner(id)
      or public.is_session_invited(id)
    )
  );

-- Remplace invited[] (usage migré vers session_invites). ----------------
alter table public.sessions drop column if exists invited;
