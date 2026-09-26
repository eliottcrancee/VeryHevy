-- VeryHevy — étape 15 : les permissions que le client attendait sans les avoir.
-- À exécuter APRÈS schema_shared_profile.sql (étape 14). Idempotent.
--
-- Symptômes corrigés :
--   • « permission denied for table posts » dès qu'on changeait la PHOTO d'un
--     post : l'étape 11 avait révoqué `update` sur `posts` puis ne l'avait
--     regranté que pour (caption, visibility) — photo_url manquait ;
--   • suppression de compte incomplète : les signalements déposés
--     (`reports`) n'avaient aucune policy de suppression, et un GRANT
--     `delete` manquant fait échouer tout le nettoyage.
--
-- Le client n'est pas une frontière de sécurité, mais chaque GRANT et chaque
-- policy de suppression reste indispensable pour que l'utilisateur puisse
-- effacer SES propres lignes.

-- 1. Posts : l'auteur doit pouvoir modifier sa photo ------------------------
revoke update on public.posts from public, anon, authenticated;
grant update (caption, visibility, photo_url) on public.posts to authenticated;

-- 2. Photos des posts : suppression dans son propre dossier -----------------
drop policy if exists "post photos deletable" on storage.objects;
create policy "post photos deletable" on storage.objects for delete using (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "post photos writable" on storage.objects;
create policy "post photos writable" on storage.objects for insert with check (
  bucket_id = 'post-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "post photos readable" on storage.objects;
create policy "post photos readable" on storage.objects for select using (
  bucket_id = 'post-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.posts p
      where (p.photo_url = name or p.photo_url like '%/post-photos/' || name)
        and (
          p.user_id = auth.uid()
          or p.visibility = 'public'
          or exists (
            select 1 from public.follows f
            where f.follower = auth.uid() and f.followed = p.user_id
          )
        )
    )
  )
);

-- Avatars : même chose dans son dossier (lecture publique à part).
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

-- 3. Signalements : je peux retirer les miens (suppression de compte) -------
alter table public.reports enable row level security;
drop policy if exists "report insert" on public.reports;
create policy "report insert" on public.reports
  for insert with check (auth.uid() = reporter);
drop policy if exists "report delete own" on public.reports;
create policy "report delete own" on public.reports
  for delete using (auth.uid() = reporter);

-- 4. Follows / demandes : couper le suivi dans les deux sens ---------------
drop policy if exists "unfollow" on public.follows;
create policy "unfollow" on public.follows
  for delete using (auth.uid() = follower or auth.uid() = followed);
drop policy if exists "follow request cancel" on public.follow_requests;
create policy "follow request cancel" on public.follow_requests
  for delete using (auth.uid() = requester or auth.uid() = target);

-- 5. Likes / commentaires : je retire les miens (ou ceux de mon post) ------
drop policy if exists "unlike" on public.post_likes;
create policy "unlike" on public.post_likes
  for delete using (auth.uid() = user_id);
drop policy if exists "comment delete" on public.post_comments;
create policy "comment delete" on public.post_comments
  for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.posts p
      where p.id = post_comments.post_id and p.user_id = auth.uid())
  );

-- 6. Sorties : inscriptions, candidatures, invitations ---------------------
drop policy if exists "leave" on public.session_joins;
create policy "leave" on public.session_joins
  for delete using (auth.uid() = user_id or public.is_session_host(session_id));
drop policy if exists "request withdraw" on public.session_requests;
create policy "request withdraw" on public.session_requests
  for delete using (auth.uid() = user_id or public.is_session_host(session_id));
drop policy if exists "invite withdraw" on public.session_invites;
create policy "invite withdraw" on public.session_invites
  for delete using (auth.uid() = user_id or public.is_session_host(session_id));

-- 7. GRANTs explicites -------------------------------------------------------
-- Un projet qui aurait tout révoqué reste utilisable : on n'accorde que ce
-- dont l'app a besoin, en gardant les restrictions de colonnes des étapes
-- 11/13 (sessions : hôte/adresse masqués ; profiles : email inaccessible).

-- Tables strictement personnelles : lecture/écriture complètes.
grant select, insert, update, delete on
  public.workouts, public.routines, public.exercises, public.deleted_items
  to authenticated;

-- Suppression seule (les GRANTs de colonnes restent la référence).
grant delete on
  public.posts, public.post_likes, public.post_comments,
  public.follows, public.follow_requests, public.blocks, public.reports,
  public.notifications, public.messages,
  public.sessions, public.session_joins, public.session_requests,
  public.session_invites
  to authenticated;
grant delete on public.profiles to authenticated;