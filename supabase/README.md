# VeryHevy Cloud — Supabase + Auth Google (multi-utilisateurs)

Chaque utilisateur se connecte avec son compte Google et ne voit que ses
données (isolation `user_id = auth.uid()` via RLS). Sans cette config,
l'app reste 100 % locale et aucune page de login n'est exigée.

## 1. Créer le projet Supabase

1. https://supabase.com/dashboard → New project.
2. SQL Editor → collez et exécutez `supabase/schema.sql`
   (tables `profiles`, `workouts`, `routines`, `exercises`, `deleted_items` + RLS + trigger profil auto).
3. Puis exécutez `supabase/schema_social.sql` (pseudo unique, follows,
   posts/likes/comments, sessions carte, notifs/blocks/reports + buckets Storage).
4. Puis exécutez `supabase/schema_chat.sql` (match : candidatures,
   chat 1-1, anonymat des inscrits + RPC participants publics).
5. Puis exécutez `supabase/schema_fix_policies.sql` (OBLIGATOIRE :
   corrige « infinite recursion in policy for relation sessions » qui
   bloque la carte + la création de séance, et permet à l'hôte
   d'accepter les candidatures).
6. Puis exécutez `supabase/schema_follow_requests.sql` (demandes d'amis
   pour comptes privés + notifications entre utilisateurs).
7. Puis exécutez `supabase/schema_blocks.sql` (blocage à sens unique +
   retirer un abonné : masquage profil/recherche/listes/posts/séances
   pour la personne bloquée).
8. Puis exécutez `supabase/schema_post_snapshot.sql` (détail des séances
   publiées visible par les abonnés, sans lecture inter-comptes).
9. Puis exécutez `supabase/schema_session_types.sql` (3 types de séances
   invite/open/public + table session_invites ; 'private' → 'open').
10. Puis exécutez `supabase/schema_dm.sql` (DM par paire : la discussion
    survit à la suppression de la séance + messages directs entre amis).
11. Enfin exécutez `supabase/schema_prod_hardening.sql` (contrôles des suivis,
    inscriptions et capacités en base, notifications automatiques, photos
    privées, masquage de l'adresse et de l'hôte anonyme). Cette étape est
    nécessaire avant de publier le nouveau client.
12. Puis exécutez `supabase/schema_account.sql` (suppression de compte :
    les participants peuvent effacer leurs messages).
13. Puis exécutez `supabase/schema_followers_access.sql` (accès abonnés :
    historique et stats complets d'un profil suivi + lecture des photos
    de posts par les abonnés).
14. Enfin exécutez `supabase/schema_shared_profile.sql` (profil consultable
    de bout en bout : les profils publics comme les abonnements ouvrent
    l'historique et les programmes, copiables depuis le profil).

Pour un projet déjà installé jusqu'à l'étape 10, exécutez uniquement les
étapes 11 à 14. Vérifiez ensuite dans Supabase que le bucket `post-photos`
est privé.

## 2. Activer Google

1. Supabase → Authentication → Providers → Google → Enable.
2. Google Cloud Console (https://console.cloud.google.com) :
   - APIs & Services → Credentials → Create Credentials → OAuth client ID (Web).
   - Authorized redirect URI : `https://<votre-projet>.supabase.co/auth/v1/callback`
   - Copiez Client ID + Client Secret dans le provider Supabase.
3. Supabase → Authentication → URL Configuration :
   - Site URL : l'URL de l'app (ex. `https://<compte>.github.io/VeryHevy/` ou `http://localhost:5173` en dev).
   - Redirect URLs : ajoutez les deux (dev + prod).

Aucune config Facebook : seul Google est branché (`signInWithOAuth({ provider: 'google' })`).

## 3. Brancher l'app

```bash
cp .env.example .env
# renseignez VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
# (Project Settings → API)
npm run dev
```

- Avec les vars : `/login` (bouton Google) garde les routes privées, `/profil`
  affiche avatar/nom/email + stats + synchro + déconnexion.
- Sans les vars : comportement d'avant, 100 % local, pas de login.

## 4. Synchro

- Auto après chaque modification (débounce 4 s), toutes les 5 min, au retour online.
- Dernier écrit gagne (ISO), suppressions via tombstones (`deleted_items`).
- Premier login sur un nouvel appareil : pull complet puis fusion locale.
- Le carnet local est séparé par compte sur un appareil partagé. Lors de la
  première connexion, l'ancien carnet local est attribué au compte déjà connu
  sur cet appareil, ou au premier compte utilisé.
- L'option « Supprimer mes entraînements du cloud » met la synchronisation en
  pause pour éviter que la copie locale ne soit aussitôt renvoyée. Réactiver
  la synchronisation renvoie la copie locale.

## Tables

| Table | Clé | Contenu |
|---|---|---|
| `profiles` | `id` (= auth.uid) | pseudo, nom, avatar, ville, visibilité ; l'email historique est inaccessible au client |
| `workouts` / `routines` / `exercises` | `(user_id, id)` | document complet en `data` jsonb + `updated_at` |
| `deleted_items` | `(user_id, kind, item_id)` | anti-résurrection |
