-- VeryHevy — profil consultable : séances + programmes d'un profil public ou suivi.
-- À exécuter APRÈS schema_followers_access.sql (étape 13). Idempotent.
--
-- L'app montre « tout » un profil consulté (stats, historique, programmes)
-- comme s'il s'agissait du sien quand :
--   • c'est mon propre profil, ou
--   • je suis abonné au propriétaire, ou
--   • le profil est public (`profiles.visibility = 'public'`),
-- et qu'aucun blocage n'existe dans les deux sens.
--
-- Les tables `workouts` / `routines` restent strictement privées
-- (RLS « own workouts » / « own routines ») : seules ces fonctions
-- SECURITY DEFINER ouvrent la lecture, jamais les tables.

-- 1. Séances partagées : étend l'étape 13 aux profils publics --------------
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
      or exists (
        select 1 from public.profiles p
        where p.id = target and p.visibility = 'public'
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

-- 2. Programmes partagés : copiables en un tap (mêmes règles d'accès) ------
create or replace function public.shared_routines(target uuid)
returns setof public.routines
language sql stable security definer set search_path = public as $$
  select r.*
  from public.routines r
  where r.user_id = target
    and (
      target = auth.uid()
      or exists (
        select 1 from public.follows f
        where f.follower = auth.uid() and f.followed = target
      )
      or exists (
        select 1 from public.profiles p
        where p.id = target and p.visibility = 'public'
      )
    )
    and not public.is_blocked_by(target)
    and not exists (
      select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = target
    )
  order by r.updated_at desc
  limit 500;
$$;
grant execute on function public.shared_routines(uuid) to authenticated;