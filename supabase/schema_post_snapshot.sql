-- VeryHevy — snapshot de séance dans les posts.
-- À exécuter après schema_blocks.sql. Idempotent.
--
-- Pourquoi : le détail d'une séance publiée était relu depuis la table
-- `workouts` (RLS strictement privée) → les abonnés voyaient le post
-- mais obtenaient « Séance non partagée en détail ». Le snapshot fige
-- le résumé au moment de la publication : visible inline par tous ceux
-- qui voient le post, sans lecture inter-comptes, même hors ligne.
alter table public.posts add column if not exists workout_snapshot jsonb;
