-- VeryHevy — social V1 : amis (à exécuter APRÈS supabase/schema.sql).
-- Dashboard Supabase → SQL Editor → collez → Run.
--
-- Principe : privé par défaut. Seuls deux utilisateurs en amitié « accepted »
-- peuvent voir leurs profils (pseudo/avatar) et lire leurs séances/exercices/
-- programmes. L'ajout se fait par email exact (aucun annuaire public).

-- Amitiés (demande requester → addressee, puis accepted)
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
create index if not exists friendships_requester_idx on public.friendships (requester, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee, status);

alter table public.friendships enable row level security;

drop policy if exists "own friendships" on public.friendships;
-- Voir : seulement les lignes où je suis impliqué (demandeur ou destinataire).
create policy "own friendships" on public.friendships
  for select using (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "request friendship" on public.friendships;
-- Demander : uniquement en tant que demandeur.
create policy "request friendship" on public.friendships
  for insert with check (auth.uid() = requester);

drop policy if exists "answer friendship" on public.friendships;
-- Accepter : le destinataire passe en accepted ; l'annulation se fait en DELETE.
create policy "answer friendship" on public.friendships
  for update using (auth.uid() = requester or auth.uid() = addressee)
  with check (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "end friendship" on public.friendships;
-- Refuser / annuler / retirer : suppression par un des deux.
create policy "end friendship" on public.friendships
  for delete using (auth.uid() = requester or auth.uid() = addressee);

-- Profils publics (pseudo + avatar uniquement, jamais l'email).
-- Vue en SECURITY DEFINER (contourne la RLS) mais qui n'expose que 4 colonnes sûres.
create or replace view public.public_profiles as
  select id, display_name, avatar_url, updated_at from public.profiles;

-- La vue contourne la RLS (défini par) : on la donne en lecture aux connectés,
-- elle n'expose de toute façon que des colonnes non sensibles.
grant select on public.public_profiles to authenticated;

drop policy if exists "friends read profiles" on public.profiles;
-- Lire un profil complet : moi, ou un ami accepté (dans les deux sens).
create policy "friends read profiles" on public.profiles
  for select using (
    auth.uid() = id or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.addressee = profiles.id)
          or (f.addressee = auth.uid() and f.requester = profiles.id))
    )
  );

-- Recherche d'un utilisateur par email exact (pour l'ajout en ami).
-- RPC SECURITY DEFINER : ne renvoie que pseudo/avatar, jamais l'email.
create or replace function public.find_user_by_email(search_email text)
returns table (id uuid, display_name text, avatar_url text)
language sql security definer set search_path = public as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where lower(p.email) = lower(nullif(trim(search_email), ''))
  limit 1;
$$;
grant execute on function public.find_user_by_email(text) to authenticated;

-- Lecture des données d'un ami accepté (séances, programmes, exercices).
-- S'ajoute aux politiques existantes « own … » (permissives : un OU suffit).
drop policy if exists "friend workouts" on public.workouts;
create policy "friend workouts" on public.workouts
  for select using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = workouts.user_id)
        or (f.addressee = auth.uid() and f.requester = workouts.user_id))
  ));

drop policy if exists "friend routines" on public.routines;
create policy "friend routines" on public.routines
  for select using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = routines.user_id)
        or (f.addressee = auth.uid() and f.requester = routines.user_id))
  ));

drop policy if exists "friend exercises" on public.exercises;
create policy "friend exercises" on public.exercises
  for select using (exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = exercises.user_id)
        or (f.addressee = auth.uid() and f.requester = exercises.user_id))
  ));
