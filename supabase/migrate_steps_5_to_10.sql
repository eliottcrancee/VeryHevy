-- =====================================================================
-- VeryHevy — MIGRATION UNIQUE étapes 5 → 10 (tout le reste du social).
-- À coller en UNE fois dans Supabase Dashboard → SQL Editor → Run.
-- Idempotent : ré-exécutable sans risque, ne supprime aucune donnée
-- (une ancienne séance 'private' devient 'open', rien n'est effacé).
-- Contenu, dans l'ordre : fix récursion RLS → demandes d'amis/notifs →
-- blocage → snapshot posts → 3 types de séances → DM par paire.
-- =====================================================================

-- VeryHevy — FIX récursion infinie RLS sessions/joins/requests/messages.
-- À exécuter APRÈS schema_chat.sql. Idempotent.
--
-- ⚠️ OBSOLÈTE après l'étape 9 (schema_session_types.sql) : ce fichier
-- recrée "sessions readable" avec l'ancien modèle ('public' + invited[]).
-- NE PAS le ré-exécuter après session_types — ça casserait la carte.
-- Cause : « sessions readable » lisait session_joins, dont la policy
-- (« joins readable ») relisait sessions (et session_joins elle-même)
-- → « infinite recursion detected in policy for relation sessions ».
-- Solution : helpers SECURITY DEFINER (bypass RLS) pour les tests
-- hôte/inscrit, utilisés par toutes les policies. Comportement inchangé :
-- anonymat des inscrits (hôte + membres) préservé.
--
-- Corrige aussi au passage l'acceptation d'une candidature : l'hôte
-- insère désormais le membre dans session_joins (avant : RLS refusait
-- car auth.uid() <> user_id).

-- Helpers (bypass RLS, pas de récursion possible) ---------------------
create or replace function public.is_session_host(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions where id = sid and host = auth.uid());
$$;

create or replace function public.is_session_joiner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_joins where session_id = sid and user_id = auth.uid());
$$;

grant execute on function public.is_session_host(uuid) to authenticated;
grant execute on function public.is_session_joiner(uuid) to authenticated;

-- Sessions : publiques, hôte, invités, inscrits ------------------------
drop policy if exists "sessions readable" on public.sessions;
create policy "sessions readable" on public.sessions
  for select using (
    visibility = 'public'
    or auth.uid() = host
    or auth.uid() = any (invited)
    or public.is_session_joiner(id)
  );

-- Inscrits : hôte, soi-même, co-inscrits -------------------------------
drop policy if exists "joins readable" on public.session_joins;
create policy "joins readable" on public.session_joins
  for select using (
    public.is_session_host(session_id)
    or auth.uid() = user_id
    or public.is_session_joiner(session_id)
  );

-- Inscription : soi-même, ou l'hôte qui accepte une candidature --------
drop policy if exists "join insert" on public.session_joins;
create policy "join insert" on public.session_joins
  for insert with check (
    auth.uid() = user_id
    or public.is_session_host(session_id)
  );

drop policy if exists "leave" on public.session_joins;
create policy "leave" on public.session_joins for delete using (
  auth.uid() = user_id or public.is_session_host(session_id)
);

-- Candidatures ----------------------------------------------------------
drop policy if exists "requests readable" on public.session_requests;
create policy "requests readable" on public.session_requests
  for select using (
    auth.uid() = user_id or public.is_session_host(session_id)
  );

drop policy if exists "request decide" on public.session_requests;
create policy "request decide" on public.session_requests
  for update using (public.is_session_host(session_id))
  with check (public.is_session_host(session_id));

drop policy if exists "request withdraw" on public.session_requests;
create policy "request withdraw" on public.session_requests
  for delete using (
    auth.uid() = user_id or public.is_session_host(session_id)
  );

-- Chat 1-1 ---------------------------------------------------------------
drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages
  for select using (
    (auth.uid() = from_id or auth.uid() = to_id)
    and (public.is_session_host(session_id) or public.is_session_joiner(session_id))
  );

drop policy if exists "message send" on public.messages;
create policy "message send" on public.messages
  for insert with check (
    auth.uid() = from_id
    and (public.is_session_host(session_id) or public.is_session_joiner(session_id))
  );
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
  values (req, 'follow_accepted', jsonb_build_object('from_username', coalesce(rname, '')));
end; $$;
grant execute on function public.accept_follow_request(uuid) to authenticated;

-- 2. Notifications : un connecté peut notifier un autre utilisateur -----
-- (demande d'ami, candidature…). Lecture / RAZ : soi-même uniquement
-- (policy "own notifications" de schema_social.sql, inchangée).
drop policy if exists "send notification" on public.notifications;
create policy "send notification" on public.notifications
  for insert with check (auth.role() = 'authenticated');
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
-- VeryHevy — snapshot de séance dans les posts.
-- À exécuter après schema_blocks.sql. Idempotent.
--
-- Pourquoi : le détail d'une séance publiée était relu depuis la table
-- `workouts` (RLS strictement privée) → les abonnés voyaient le post
-- mais obtenaient « Séance non partagée en détail ». Le snapshot fige
-- le résumé au moment de la publication : visible inline par tous ceux
-- qui voient le post, sans lecture inter-comptes, même hors ligne.
alter table public.posts add column if not exists workout_snapshot jsonb;
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
-- VeryHevy — DM par paire d'utilisateurs (session = simple contexte).
-- À exécuter après schema_session_types.sql. Idempotent.
--
--   • messages.session_id devient NULLABLE + ON DELETE SET NULL :
--     supprimer une session ne supprime plus la discussion.
--   • Écrire à un ami : lien follow (abonné ou abonnement) OU
--     conversation déjà existante, sans blocage dans un sens ou l'autre.
--   • Depuis une session, les membres/hôte peuvent toujours s'écrire
--     (même sans lien follow : le match_prime).

-- La discussion survit à la suppression de la session ------------------
alter table public.messages drop constraint if exists messages_session_id_fkey;
alter table public.messages alter column session_id drop not null;
alter table public.messages
  add constraint messages_session_id_fkey
  foreign key (session_id) references public.sessions (id) on delete set null;

-- Puis-je écrire à uid ? (bypass RLS : pas de récursion possible) -------
create or replace function public.can_dm(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    not public.is_blocked_by(uid)
    and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = uid)
    and (
      exists (
        select 1 from public.follows
        where (follower = auth.uid() and followed = uid)
           or (follower = uid and followed = auth.uid())
      )
      or exists (
        select 1 from public.messages m
        where (m.from_id = auth.uid() and m.to_id = uid)
           or (m.from_id = uid and m.to_id = auth.uid())
      )
    );
$$;
grant execute on function public.can_dm(uuid) to authenticated;

-- Lecture : mes messages, session existante ou non ----------------------
drop policy if exists "messages readable" on public.messages;
create policy "messages readable" on public.messages
  for select using (
    (auth.uid() = from_id or auth.uid() = to_id)
    and (
      session_id is null
      or public.is_session_host(session_id)
      or public.is_session_joiner(session_id)
    )
  );

-- Envoi : DM (ami ou conversation existante) ou cadre d'une session -----
drop policy if exists "message send" on public.messages;
create policy "message send" on public.messages
  for insert with check (
    auth.uid() = from_id
    and (
      (session_id is null and public.can_dm(to_id))
      or (
        session_id is not null
        and (public.is_session_host(session_id) or public.is_session_joiner(session_id))
        and not public.is_blocked_by(to_id)
        and not exists (select 1 from public.blocks where blocker = auth.uid() and blocked = to_id)
      )
    )
  );
