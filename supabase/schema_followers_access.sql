-- VeryHevy — accès des abonnés : historique et stats complets du profil.
-- À exécuter APRÈS schema_prod_hardening.sql (étape 11) et
-- schema_account.sql (étape 12). Idempotent.
--
-- Les séances restent strictement privées (RLS « own workouts »).
-- Cette fonction SECURITY DEFINER n'ouvre la lecture QUE si :
--   • je consulte mon propre profil, ou
--   • je suis abonné au propriétaire du profil,
-- et qu'aucun blocage n'existe dans les deux sens.

create or replace function public.shared_workouts(target uuid, p_limit integer default 500)
returns setof public.workouts
language sql stable security definer set search_path = public as $$
  select w.*
  from public.workouts w
  where w.user_id = target
    and (
      target = auth.uid()
      or exists (
        select 1 from public.follows f
        where f.follower = auth.uid() and f.followed = target
      )
    )
    and not public.is_blocked_by(target)
    and not exists (
      select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = target
    )
  order by w.updated_at desc
  limit greatest(1, least(p_limit, 2000));
$$;
grant execute on function public.shared_workouts(uuid, integer) to authenticated;

-- Photos des posts : lecture EXPLICITE pour les abonnés (l'auteur, le
-- public, ou tout abonné quand le post est réservé aux abonnés).
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
