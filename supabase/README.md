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
- Un compte par appareil recommandé : le store local n'est pas namespacé par utilisateur.

## Tables

| Table | Clé | Contenu |
|---|---|---|
| `profiles` | `id` (= auth.uid) | email, nom, avatar Google |
| `workouts` / `routines` / `exercises` | `(user_id, id)` | document complet en `data` jsonb + `updated_at` |
| `deleted_items` | `(user_id, kind, item_id)` | anti-résurrection |
