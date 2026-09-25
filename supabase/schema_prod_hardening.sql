-- Étape 11, après migrate_steps_5_to_10.sql. Réexécutable.
-- Les contrôles ci-dessous doivent rester en base : le client n'est pas une frontière de sécurité.

-- Un profil privé ne peut être suivi qu'après acceptation de sa demande.
drop policy if exists "follow insert" on public.follows;
create policy "follow insert" on public.follows for insert with check (
  follower = auth.uid() and follower <> followed
  and not public.is_blocked_by(followed)
  and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = followed)
  and exists (select 1 from public.profiles p where p.id = followed and p.visibility <> 'private')
);
drop policy if exists "follow request insert" on public.follow_requests;
create policy "follow request insert" on public.follow_requests for insert with check (
  requester = auth.uid() and requester <> target
  and not public.is_blocked_by(target)
  and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = target)
  and exists (select 1 from public.profiles p where p.id = target and p.visibility = 'private')
);

-- La RPC d'acceptation contourne RLS : elle valide donc les mêmes invariants.
create or replace function public.accept_follow_request(req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rname text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.follow_requests where requester = req and target = auth.uid()
  ) then raise exception 'Demande introuvable'; end if;
  if public.is_blocked_by(req) or exists (
    select 1 from public.blocks where blocker = auth.uid() and blocked = req
  ) then raise exception 'Utilisateur bloqué'; end if;
  insert into public.follows (follower, followed) values (req, auth.uid()) on conflict do nothing;
  delete from public.follow_requests where requester = req and target = auth.uid();
  select username into rname from public.profiles where id = auth.uid();
  insert into public.notifications (user_id, type, payload)
    values (req, 'follow_accepted', jsonb_build_object('from_id', auth.uid(), 'from_username', coalesce(rname, '')));
end; $$;
revoke all on function public.accept_follow_request(uuid) from public, anon;
grant execute on function public.accept_follow_request(uuid) to authenticated;

-- Likes et commentaires suivent exactement la visibilité du post.
drop policy if exists "likes readable" on public.post_likes;
create policy "likes readable" on public.post_likes for select using (
  exists (select 1 from public.posts p where p.id = post_id)
);
drop policy if exists "like insert" on public.post_likes;
create policy "like insert" on public.post_likes for insert with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id)
);
drop policy if exists "comments readable" on public.post_comments;
create policy "comments readable" on public.post_comments for select using (
  exists (select 1 from public.posts p where p.id = post_id)
);
drop policy if exists "comment insert" on public.post_comments;
create policy "comment insert" on public.post_comments for insert with check (
  user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id)
);

-- L'email reste dans Auth et dans les anciennes lignes, mais n'est jamais
-- projeté par le client social. Une restriction de colonne évite toute perte.
revoke select on public.profiles from public, anon, authenticated;
grant select (id, username, display_name, avatar_url, bio, city,
  visibility, followers_count, following_count, updated_at)
  on public.profiles to authenticated;
revoke insert on public.profiles from public, anon, authenticated;
grant insert (id, username, display_name, avatar_url, bio, city, visibility, updated_at)
  on public.profiles to authenticated;
-- Certains projets ont une ancienne vue créée à la main. En mode invoker,
-- elle respecte enfin le blocage et les privilèges du lecteur.
do $$ begin
  if to_regclass('public.public_profiles') is not null then
    execute 'alter view public.public_profiles set (security_invoker = true)';
    execute 'revoke select on public.public_profiles from public, anon';
    execute 'grant select on public.public_profiles to authenticated';
  end if;
end $$;
revoke update on public.profiles from public, anon, authenticated;
grant update (username, display_name, avatar_url, bio, city, visibility, updated_at)
  on public.profiles to authenticated;
create or replace function public.initialize_profile_counts()
returns trigger language plpgsql set search_path = public as $$
begin new.followers_count := 0; new.following_count := 0; return new; end; $$;
drop trigger if exists profile_initial_counts on public.profiles;
create trigger profile_initial_counts before insert on public.profiles
  for each row execute function public.initialize_profile_counts();
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;

-- Une inscription exige une invitation acceptée ou une candidature en attente
-- acceptée par l'hôte. Le verrou sur la session sérialise les dernières places.
drop policy if exists "join insert" on public.session_joins;
create policy "join insert" on public.session_joins for insert with check (
  auth.uid() = user_id or public.is_session_host(session_id)
);
create or replace function public.can_request_session(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions s where s.id = sid
    and s.host <> auth.uid() and s.visibility in ('open', 'public')
    and s.starts_at >= now() - interval '3 hours' and s.spots_taken < s.spots_total
    and not public.is_blocked_by(s.host)
    and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = s.host));
$$;
revoke all on function public.can_request_session(uuid) from public, anon;
grant execute on function public.can_request_session(uuid) to authenticated;
drop policy if exists "request insert" on public.session_requests;
create policy "request insert" on public.session_requests for insert with check (
  auth.uid() = user_id and status = 'pending'
  and public.can_request_session(session_id)
);
revoke update on public.session_requests from public, anon, authenticated;
grant update (status) on public.session_requests to authenticated;
revoke update on public.session_invites from public, anon, authenticated;
grant update (status) on public.session_invites to authenticated;
create or replace function public.check_session_join()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = new.session_id for update;
  if not found then raise exception 'Session introuvable'; end if;
  if s.host = new.user_id then raise exception 'L’hôte occupe déjà une place'; end if;
  if s.starts_at < now() - interval '3 hours' then raise exception 'Session passée'; end if;
  if s.spots_taken >= s.spots_total then raise exception 'Session complète'; end if;
  if exists (
    select 1 from public.blocks where (blocker = s.host and blocked = new.user_id)
      or (blocker = new.user_id and blocked = s.host)
  ) then raise exception 'Utilisateur bloqué'; end if;
  if auth.uid() = s.host then
    if s.visibility = 'invite' then raise exception 'Invitation requise'; end if;
    if not exists (select 1 from public.session_requests r where r.session_id = new.session_id
      and r.user_id = new.user_id and r.status = 'pending') then
      raise exception 'Aucune candidature en attente';
    end if;
  elsif auth.uid() = new.user_id then
    if s.visibility <> 'invite' or not exists (
      select 1 from public.session_invites i where i.session_id = new.session_id
        and i.user_id = new.user_id and i.status = 'accepted'
    ) then raise exception 'Invitation acceptée requise'; end if;
  else raise exception 'Inscription non autorisée'; end if;
  return new;
end; $$;
drop trigger if exists session_join_guard on public.session_joins;
create trigger session_join_guard before insert on public.session_joins
  for each row execute function public.check_session_join();

-- Le client ne peut modifier ni l'hôte ni le compteur de places.
revoke update on public.sessions from public, anon, authenticated;
grant update (title, gym_name, address_text, lat, lng, starts_at,
  spots_total, level, description, visibility) on public.sessions to authenticated;
create or replace function public.initialize_session_spots()
returns trigger language plpgsql set search_path = public as $$
begin new.spots_taken := 1; return new; end; $$;
drop trigger if exists session_initial_spots on public.sessions;
create trigger session_initial_spots before insert on public.sessions
  for each row execute function public.initialize_session_spots();
create or replace function public.check_session_capacity_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.spots_total < old.spots_taken then raise exception 'Capacité inférieure aux inscrits'; end if;
  return new;
end; $$;
drop trigger if exists session_capacity_update on public.sessions;
create trigger session_capacity_update before update of spots_total on public.sessions
  for each row execute function public.check_session_capacity_update();

revoke update on public.posts from public, anon, authenticated;
grant update (caption, visibility) on public.posts to authenticated;
create or replace function public.initialize_post_counts()
returns trigger language plpgsql set search_path = public as $$
begin new.likes_count := 0; new.comments_count := 0; return new; end; $$;
drop trigger if exists post_initial_counts on public.posts;
create trigger post_initial_counts before insert on public.posts
  for each row execute function public.initialize_post_counts();

-- Les photos sont privées dans Storage. Leur lecture suit la policy des posts.
update storage.buckets set public = false where id = 'post-photos';
drop policy if exists "avatars writable" on storage.objects;
create policy "avatars writable" on storage.objects for insert with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "avatars updatable" on storage.objects;
create policy "avatars updatable" on storage.objects for update using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars deletable" on storage.objects;
create policy "avatars deletable" on storage.objects for delete using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "post photos readable" on storage.objects;
create policy "post photos readable" on storage.objects for select using (
  bucket_id = 'post-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.posts p where p.photo_url = name
      or p.photo_url like '%/post-photos/' || name)
  )
);
drop policy if exists "post photos writable" on storage.objects;
create policy "post photos writable" on storage.objects for insert with check (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "post photos deletable" on storage.objects;
create policy "post photos deletable" on storage.objects for delete using (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Les notifications sont créées par des triggers, jamais par un client libre.
drop policy if exists "own notifications" on public.notifications;
drop policy if exists "send notification" on public.notifications;
create policy "notifications read" on public.notifications for select using (user_id = auth.uid());
create policy "notifications mark" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications delete" on public.notifications for delete using (user_id = auth.uid());
revoke insert on public.notifications from anon, authenticated;
revoke update on public.notifications from public, anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify_social_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare recipient uuid; event_type text; actor uuid; sid uuid; title text; uname text;
begin
  if tg_table_name = 'follows' then
    -- L'acceptation d'une demande a sa notification spécifique.
    if exists (select 1 from public.follow_requests where requester = new.follower and target = new.followed) then return new; end if;
    recipient := new.followed; actor := new.follower; event_type := 'new_follower';
  elsif tg_table_name = 'follow_requests' then
    recipient := new.target; actor := new.requester; event_type := 'follow_request';
  elsif tg_table_name = 'session_requests' then
    if tg_op = 'INSERT' then
      select host, sessions.title into recipient, title from public.sessions where id = new.session_id;
      actor := new.user_id; event_type := 'session_request'; sid := new.session_id;
    elsif old.status <> 'accepted' and new.status = 'accepted' then
      recipient := new.user_id; sid := new.session_id; event_type := 'session_accepted';
      select host, sessions.title into actor, title from public.sessions where id = sid;
    end if;
  elsif tg_table_name = 'session_invites' then
    sid := new.session_id;
    if tg_op = 'INSERT' then
      recipient := new.user_id; event_type := 'session_invite';
      select host, sessions.title into actor, title from public.sessions where id = sid;
    elsif old.status <> 'declined' and new.status = 'declined' then
      actor := new.user_id; event_type := 'session_invite_declined';
      select host, sessions.title into recipient, title from public.sessions where id = sid;
    end if;
  elsif tg_table_name = 'messages' then
    recipient := new.to_id; actor := new.from_id; sid := new.session_id; event_type := 'message';
  end if;
  if recipient is not null and actor is not null and recipient <> actor and event_type is not null then
    select username into uname from public.profiles where id = actor;
    insert into public.notifications (user_id, type, payload) values
      (recipient, event_type, jsonb_build_object('from_id', actor,
        'from_username', coalesce(uname, ''), 'session_id', sid,
        'session_title', coalesce(title, '')));
  end if;
  return new;
end; $$;
drop trigger if exists notify_follow on public.follows;
create trigger notify_follow after insert on public.follows for each row execute function public.notify_social_event();
drop trigger if exists notify_follow_request on public.follow_requests;
create trigger notify_follow_request after insert on public.follow_requests for each row execute function public.notify_social_event();
drop trigger if exists notify_session_request on public.session_requests;
create trigger notify_session_request after insert or update of status on public.session_requests
  for each row execute function public.notify_social_event();
drop trigger if exists notify_session_invite on public.session_invites;
create trigger notify_session_invite after insert or update of status on public.session_invites
  for each row execute function public.notify_social_event();
drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages for each row execute function public.notify_social_event();

-- Une session ne donne pas le droit d'écrire à un utilisateur extérieur.
create or replace function public.is_session_member(sid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions where id = sid and host = uid)
    or exists (select 1 from public.session_joins where session_id = sid and user_id = uid);
$$;
revoke all on function public.is_session_member(uuid, uuid) from public, anon;
grant execute on function public.is_session_member(uuid, uuid) to authenticated;
drop policy if exists "message send" on public.messages;
create policy "message send" on public.messages for insert with check (
  auth.uid() = from_id and from_id <> to_id
  and not public.is_blocked_by(to_id)
  and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = to_id)
  and ((session_id is null and public.can_dm(to_id)) or
    (session_id is not null and public.is_session_member(session_id, auth.uid())
      and public.is_session_member(session_id, to_id)))
);

-- La RPC de teaser respecte la visibilité de la session et les blocages.
create or replace function public.session_public_participants(sid uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text)
language sql security definer set search_path = public as $$
  select j.user_id, p.username, p.display_name, p.avatar_url
  from public.session_joins j
  join public.profiles p on p.id = j.user_id
  join public.sessions s on s.id = j.session_id
  where j.session_id = sid and p.visibility = 'public'
    and not public.is_blocked_by(s.host) and not public.is_blocked_by(j.user_id)
    and (s.visibility in ('open', 'public') or s.host = auth.uid()
      or public.is_session_joiner(sid) or public.is_session_invited(sid));
$$;

-- RLS protège les lignes, pas les colonnes. L'hôte des sessions « open » et
-- l'adresse exacte passent donc par une vue RPC qui les masque avant l'envoi.
create or replace function public.visible_sessions(
  p_past boolean default false,
  p_limit integer default 200,
  p_offset integer default 0,
  p_session_id uuid default null
)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', s.id, 'host', case when s.visibility <> 'open' or s.host = auth.uid()
      or public.is_session_joiner(s.id) then s.host::text else '' end,
    'title', s.title, 'gym_name', s.gym_name,
    'address_text', case when s.host = auth.uid() or public.is_session_joiner(s.id)
      then s.address_text else '' end,
    'lat', s.lat, 'lng', s.lng, 'starts_at', s.starts_at,
    'spots_total', s.spots_total, 'spots_taken', s.spots_taken,
    'level', s.level, 'description', s.description,
    'visibility', s.visibility, 'created_at', s.created_at
  )
  from public.sessions s
  where auth.uid() is not null
    and not public.is_blocked_by(s.host)
    and (s.visibility in ('open', 'public') or s.host = auth.uid()
      or public.is_session_joiner(s.id) or public.is_session_invited(s.id))
    and (p_session_id is null or s.id = p_session_id)
    and ((not p_past and s.starts_at >= now() - interval '3 hours')
      or (p_past and s.starts_at < now() - interval '3 hours'
        and (s.host = auth.uid() or public.is_session_joiner(s.id))))
  order by case when p_past then null else s.starts_at end asc,
    case when p_past then s.starts_at else null end desc, s.id
  limit least(greatest(p_limit, 1), 500) offset greatest(p_offset, 0);
$$;
revoke all on function public.visible_sessions(boolean, integer, integer, uuid) from public, anon;
grant execute on function public.visible_sessions(boolean, integer, integer, uuid) to authenticated;
revoke select on public.sessions from public, anon, authenticated;
grant select (id, title, gym_name, lat, lng, starts_at, spots_total,
  spots_taken, level, description, visibility, created_at) on public.sessions to authenticated;
