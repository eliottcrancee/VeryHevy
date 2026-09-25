-- VeryHevy — schéma multi-utilisateurs (Supabase + Auth Google).
-- À exécuter dans Supabase Dashboard → SQL Editor (ou `supabase db push`).
--
-- Modèle : chaque ligne appartient à un utilisateur (user_id = auth.uid()).
-- La logique de fusion reste "dernier écrit gagne" côté client
-- (réutilise lastSyncAt + applyPulledData du store Zustand).

-- Profils (1 ligne par compte Google)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

-- Entités synchronisées : le document complet est stocké en jsonb,
-- la clé métier `id` reste celle du client (ex. wo_xxx).
create table if not exists public.workouts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists workouts_user_updated_idx on public.workouts (user_id, updated_at);

create table if not exists public.routines (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists routines_user_updated_idx on public.routines (user_id, updated_at);

create table if not exists public.exercises (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists exercises_user_updated_idx on public.exercises (user_id, updated_at);

-- Tombstones anti-résurrection (propagent les suppressions)
create table if not exists public.deleted_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('workout', 'routine', 'exercise')),
  item_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, kind, item_id)
);
create index if not exists deleted_user_at_idx on public.deleted_items (user_id, deleted_at);

-- RLS : chaque utilisateur ne voit que ses lignes
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.routines enable row level security;
alter table public.exercises enable row level security;
alter table public.deleted_items enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own workouts" on public.workouts;
create policy "own workouts" on public.workouts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own routines" on public.routines;
create policy "own routines" on public.routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own exercises" on public.exercises;
create policy "own exercises" on public.exercises
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own deleted" on public.deleted_items;
create policy "own deleted" on public.deleted_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Création auto du profil à l'inscription Google
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();
