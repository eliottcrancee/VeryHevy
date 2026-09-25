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
