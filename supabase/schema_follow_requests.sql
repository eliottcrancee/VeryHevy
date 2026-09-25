-- VeryHevy — demandes d'amis (comptes privés) + notifications.
-- À exécuter après schema_fix_policies.sql. Idempotent.
--
-- Compte privé (profiles.visibility = 'private') : « Suivre » crée une
-- demande → le destinataire accepte/refuse depuis ses notifications
-- (point rouge sur la cloche). Sinon : suivi direct comme avant.

-- 1. Demandes d'amis ----------------------------------------------------
create table if not exists public.follow_requests (
  requester uuid not null references auth.users (id) on delete cascade,
  target uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (requester, target),
  check (requester <> target)
);
create index if not exists follow_requests_target_idx on public.follow_requests (target);
alter table public.follow_requests enable row level security;

drop policy if exists "follow request insert" on public.follow_requests;
create policy "follow request insert" on public.follow_requests
  for insert with check (auth.uid() = requester);

drop policy if exists "follow requests readable" on public.follow_requests;
create policy "follow requests readable" on public.follow_requests
  for select using (auth.uid() = requester or auth.uid() = target);

drop policy if exists "follow request cancel" on public.follow_requests;
create policy "follow request cancel" on public.follow_requests
  for delete using (auth.uid() = requester or auth.uid() = target);

-- Accepter (destinataire) : crée le follow + notifie le demandeur.
-- En SECURITY DEFINER car le follow a follower = le demandeur.
create or replace function public.accept_follow_request(req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  rname text;
begin
  if not exists (
    select 1 from public.follow_requests where requester = req and target = auth.uid()
  ) then
    raise exception 'Demande introuvable';
  end if;
  insert into public.follows (follower, followed)
  values (req, auth.uid())
  on conflict do nothing;
  delete from public.follow_requests where requester = req and target = auth.uid();
  select username into rname from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, payload)
  values (req, 'follow_accepted', jsonb_build_object('username', coalesce(rname, '')));
end; $$;
grant execute on function public.accept_follow_request(uuid) to authenticated;

-- 2. Notifications : un connecté peut notifier un autre utilisateur -----
-- (demande d'ami, candidature…). Lecture / RAZ : soi-même uniquement
-- (policy "own notifications" de schema_social.sql, inchangée).
drop policy if exists "send notification" on public.notifications;
create policy "send notification" on public.notifications
  for insert with check (auth.role() = 'authenticated');
