-- VeryHevy — social : follow + posts + carte (après supabase/schema.sql).
-- Idempotent : ré-exécutable sans casser.
--
-- NOTE : visibilités sessions ('public'/'private' + invited[]) et policies
-- d'origine : voir schema_session_types.sql (étape 9) pour le modèle actuel
-- (invite / open / public + session_invites).
-- Pseudo choisi à l'inscription (onboarding /bienvenue),
-- visibilité post par défaut 'followers', sessions publiques par défaut
-- (visibles carte) ou privées sur invitation.

-- 1. Profils étendus -----------------------------------------------------
alter table public.profiles
  add column if not exists username text,
  add column if not exists bio text,
  add column if not exists city text,
  add column if not exists visibility text not null default 'followers',
  add column if not exists followers_count int not null default 0,
  add column if not exists following_count int not null default 0;

-- Format pseudo : 3-20 chars, minuscules/chiffres/._ (vérifié aussi côté app)
do $$ begin
  alter table public.profiles
    add constraint profiles_username_fmt
    check (username is null or username ~ '^[a-z0-9_.]{3,20}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_visibility_chk
    check (visibility in ('private', 'followers', 'public'));
exception when duplicate_object then null; end $$;

create unique index if not exists profiles_username_uidx
  on public.profiles (lower(username)) where username is not null;

-- 2. Follows --------------------------------------------------------------
create table if not exists public.follows (
  follower uuid not null references auth.users (id) on delete cascade,
  followed uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followed),
  check (follower <> followed)
);
create index if not exists follows_followed_idx on public.follows (followed);
create index if not exists follows_follower_idx on public.follows (follower);

alter table public.follows enable row level security;

drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows
  for select using (true);

drop policy if exists "follow insert" on public.follows;
create policy "follow insert" on public.follows
  for insert with check (auth.uid() = follower);

drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows
  for delete using (auth.uid() = follower);

-- Compteurs followers/following (trigger)
create or replace function public.refresh_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    update public.profiles set following_count = (select count(*) from public.follows where follower = new.follower) where id = new.follower;
    update public.profiles set followers_count = (select count(*) from public.follows where followed = new.followed) where id = new.followed;
    return new;
  else
    update public.profiles set following_count = (select count(*) from public.follows where follower = old.follower) where id = old.follower;
    update public.profiles set followers_count = (select count(*) from public.follows where followed = old.followed) where id = old.followed;
    return old;
  end if;
end; $$;

drop trigger if exists follows_counts on public.follows;
create trigger follows_counts after insert or delete on public.follows
  for each row execute function public.refresh_follow_counts();

-- 3. Posts ----------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id text,
  photo_url text,
  caption text not null default '' check (char_length(caption) <= 500),
  visibility text not null default 'followers' check (visibility in ('public', 'followers', 'private')),
  likes_count int not null default 0,
  comments_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Lecture : public → tous connectés ; followers → auteur ou follower ; private → auteur seul.
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts
  for select using (
    visibility = 'public'
    or auth.uid() = user_id
    or (visibility = 'followers' and exists (
      select 1 from public.follows f where f.follower = auth.uid() and f.followed = posts.user_id
    ))
  );

drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts update own" on public.posts;
create policy "posts update own" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts
  for delete using (auth.uid() = user_id);

-- Likes
create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;

drop policy if exists "likes readable" on public.post_likes;
create policy "likes readable" on public.post_likes for select using (true);
drop policy if exists "like insert" on public.post_likes;
create policy "like insert" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "unlike" on public.post_likes;
create policy "unlike" on public.post_likes for delete using (auth.uid() = user_id);

-- Commentaires
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;

drop policy if exists "comments readable" on public.post_comments;
create policy "comments readable" on public.post_comments for select using (true);
drop policy if exists "comment insert" on public.post_comments;
create policy "comment insert" on public.post_comments for insert with check (auth.uid() = user_id);
drop policy if exists "comment delete" on public.post_comments;
create policy "comment delete" on public.post_comments
  for delete using (auth.uid() = user_id or exists (
    select 1 from public.posts p where p.id = post_comments.post_id and p.user_id = auth.uid()
  ));

-- Compteurs likes/comments
create or replace function public.refresh_post_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid; begin
  pid := coalesce(new.post_id, old.post_id);
  update public.posts set
    likes_count = (select count(*) from public.post_likes where post_id = pid),
    comments_count = (select count(*) from public.post_comments where post_id = pid)
  where id = pid;
  return coalesce(new, old);
end; $$;

drop trigger if exists post_likes_counts on public.post_likes;
create trigger post_likes_counts after insert or delete on public.post_likes
  for each row execute function public.refresh_post_counts();
drop trigger if exists post_comments_counts on public.post_comments;
create trigger post_comments_counts after insert or delete on public.post_comments
  for each row execute function public.refresh_post_counts();

-- 4. Sessions carto -------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  gym_name text not null default '' check (char_length(gym_name) <= 120),
  address_text text not null default '',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  starts_at timestamptz not null,
  spots_total int not null check (spots_total between 2 and 8),
  spots_taken int not null default 1 check (spots_taken >= 1),
  level text not null default 'tous',
  description text not null default '' check (char_length(description) <= 500),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  invited uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists sessions_geo_idx on public.sessions (lat, lng);
create index if not exists sessions_starts_idx on public.sessions (starts_at);
create index if not exists sessions_host_idx on public.sessions (host);

alter table public.sessions enable row level security;

-- session_joins AVANT les policies sessions (la policy readable s'y réfère).
create table if not exists public.session_joins (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
alter table public.session_joins enable row level security;

-- Publiques : tous connectés. Privées : host, invités, participants.
drop policy if exists "sessions readable" on public.sessions;
create policy "sessions readable" on public.sessions
  for select using (
    visibility = 'public'
    or auth.uid() = host
    or auth.uid() = any (invited)
    or exists (select 1 from public.session_joins j where j.session_id = sessions.id and j.user_id = auth.uid())
  );

drop policy if exists "sessions insert own" on public.sessions;
create policy "sessions insert own" on public.sessions
  for insert with check (auth.uid() = host);

drop policy if exists "sessions update host" on public.sessions;
create policy "sessions update host" on public.sessions
  for update using (auth.uid() = host) with check (auth.uid() = host);

drop policy if exists "sessions delete host" on public.sessions;
create policy "sessions delete host" on public.sessions
  for delete using (auth.uid() = host);

drop policy if exists "joins readable" on public.session_joins;
create policy "joins readable" on public.session_joins for select using (true);
drop policy if exists "join insert" on public.session_joins;
create policy "join insert" on public.session_joins for insert with check (auth.uid() = user_id);
drop policy if exists "leave" on public.session_joins;
create policy "leave" on public.session_joins for delete using (
  auth.uid() = user_id or exists (select 1 from public.sessions s where s.id = session_joins.session_id and s.host = auth.uid())
);

-- Compteur de places : 1 (host) + inscrits. Évite les writes concurrents côté client.
create or replace function public.refresh_session_spots()
returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid; begin
  sid := coalesce(new.session_id, old.session_id);
  update public.sessions set
    spots_taken = 1 + (select count(*) from public.session_joins where session_id = sid)
  where id = sid;
  return coalesce(new, old);
end; $$;

drop trigger if exists session_joins_spots on public.session_joins;
create trigger session_joins_spots after insert or delete on public.session_joins
  for each row execute function public.refresh_session_spots();

-- 5. Divers : notifs, blocs, signalements ---------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "own blocks" on public.blocks;
create policy "own blocks" on public.blocks
  for all using (auth.uid() = blocker) with check (auth.uid() = blocker);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users (id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "report insert" on public.reports;
create policy "report insert" on public.reports for insert with check (auth.uid() = reporter);

-- 6. Pseudo : dispo + trigger profil --------------------------------------
-- Vérifie la dispo d'un pseudo (insensible à la casse). À appeler avant upsert.
create or replace function public.is_username_available(wanted text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(nullif(trim(wanted), '')));
$$;
grant execute on function public.is_username_available(text) to authenticated;

-- Profils lisibles : moi + tout connecté pour pseudo/avatar (jamais l'email).
-- L'email reste exposé uniquement via la policy "own profile" de schema.sql.
drop policy if exists "profiles discoverable" on public.profiles;
create policy "profiles discoverable" on public.profiles
  for select using (true);

-- 7. Storage : avatars + photos de séance ----------------------------------
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('post-photos', 'post-photos', true)
  on conflict (id) do nothing;

drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "avatars writable" on storage.objects;
create policy "avatars writable" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
drop policy if exists "avatars updatable" on storage.objects;
create policy "avatars updatable" on storage.objects
  for update using (bucket_id = 'avatars' and auth.role() = 'authenticated');
drop policy if exists "avatars deletable" on storage.objects;
create policy "avatars deletable" on storage.objects
  for delete using (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "post photos readable" on storage.objects;
create policy "post photos readable" on storage.objects for select using (bucket_id = 'post-photos');
drop policy if exists "post photos writable" on storage.objects;
create policy "post photos writable" on storage.objects
  for insert with check (bucket_id = 'post-photos' and auth.role() = 'authenticated');
drop policy if exists "post photos deletable" on storage.objects;
create policy "post photos deletable" on storage.objects
  for delete using (bucket_id = 'post-photos' and auth.role() = 'authenticated');
