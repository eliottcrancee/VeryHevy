-- VeryHevy — suppression de compte : les participants peuvent effacer
-- leurs messages (condition de la fonction deleteAccountEverywhere).
-- À exécuter après schema_dm.sql. Idempotent.
--
-- Sémantique "supprimer pour tout le monde" : chaque participant peut
-- effacer un message de la conversation (nécessaire pour effacer tout
-- l'historique d'un compte qui se supprime).
drop policy if exists "message delete participant" on public.messages;
create policy "message delete participant" on public.messages
  for delete using (auth.uid() = from_id or auth.uid() = to_id);
