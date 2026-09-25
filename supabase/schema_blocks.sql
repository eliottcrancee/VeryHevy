-- VeryHevy — blocage à sens unique + retirer un abonné.
-- À exécuter après schema_follow_requests.sql. Idempotent.
--
-- NOTE : les policies "sessions readable" / "posts readable" de ce fichier
-- datent d'avant session_types (visibilités public/private + invited[]).
-- L'état final est fixé par schema_session_types.sql (étape 9).
-- Règles : quand B bloque X —
--   • X ne voit plus B : profil, recherche, listes follows, posts, sessions ;
--   • X ne peut plus suivre B (ni lui envoyer de demande) ;
--   • B continue de voir X (pour pouvoir le débloquer) ;
--   • les follows/demandes existants sont coupés côté app au moment du blocage.
--
-- Le test « uid m'a bloqué ? » passe par le helper SECURITY DEFINER
-- is_blocked_by (pas de fuite de la table blocks, pas de récursion).

create or replace function public.is_blocked_by(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where blocker = uid and blocked = auth.uid());
$$;
grant execute on function public.is_blocked_by(uuid) to authenticated;

-- Retirer un abonné : le suivi peut aussi être coupé côté suivi ---------
drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows
  for delete using (auth.uid() = follower or auth.uid() = followed);

-- Suivre : refusé si un blocage existe dans un sens ou l'autre -----------
drop policy if exists "follow insert" on public.follows;
create policy "follow insert" on public.follows
  for insert with check (
    auth.uid() = follower
    and not public.is_blocked_by(followed)
    and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = followed)
  );

-- Demandes d'amis : mêmes garde-fous ------------------------------------
drop policy if exists "follow request insert" on public.follow_requests;
create policy "follow request insert" on public.follow_requests
  for insert with check (
    auth.uid() = requester
    and not public.is_blocked_by(target)
    and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = target)
  );

-- Listes follows : le bloqué ne voit plus le bloqueur nulle part --------
drop policy if exists "follows readable" on public.follows;
create policy "follows readable" on public.follows
  for select using (
    not public.is_blocked_by(follower)
    and not public.is_blocked_by(followed)
  );

-- Profils : invisibles pour la personne que j'ai bloquée -----------------
-- (sens unique : je continue de voir son profil pour pouvoir débloquer).
drop policy if exists "profiles discoverable" on public.profiles;
create policy "profiles discoverable" on public.profiles
  for select using (not public.is_blocked_by(profiles.id));

-- Posts : le bloqué ne voit plus mes posts --------------------------------
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts
  for select using (
    not public.is_blocked_by(posts.user_id)
    and (
      visibility = 'public'
      or auth.uid() = user_id
      or (visibility = 'followers' and exists (
        select 1 from public.follows f where f.follower = auth.uid() and f.followed = posts.user_id
      ))
    )
  );

-- Sessions : le bloqué ne voit plus mes séances ---------------------------
drop policy if exists "sessions readable" on public.sessions;
create policy "sessions readable" on public.sessions
  for select using (
    not public.is_blocked_by(sessions.host)
    and (
      visibility = 'public'
      or auth.uid() = host
      or auth.uid() = any (invited)
      or public.is_session_joiner(id)
    )
  );
