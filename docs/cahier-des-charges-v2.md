# VeryHevy V2 — Cahier des charges (v0.2 — 25/09/2026)

> Décisions figées avec toi : **4 onglets exactement**, modèle **follow / follow-back type Instagram** (pas ami bidirectionnel seul), **profil unique** (pas de pseudo GymBro séparé), **photo + description dans le post**, **serveur maison déprécié/supprimé**, **simplification maximale** (pas de défis, pas de groupes, pas de coach compliqué pour l'instant).
> Nettoyage effectué le 25/09 : `server/`, `src/lib/sync.ts`, `src/lib/gymbro.ts`, `src/store/gymbro.ts`, `src/pages/GymBro.tsx`, `scripts/check-sync.mjs`, `scripts/check-mcp.mjs` supprimés. `package.json`, `main.tsx`, `App.tsx`, `AppShell.tsx`, `Home.tsx`, `Settings.tsx` nettoyés. Typecheck vert.

---

## 1. Structure cible — 4 onglets

```
[Accueil]   [Explorer]   [Programmes]   [Profil]
  (feed)     (carte)      (muscu)       (moi + réglages)
```

| # | Onglet | Route | Contenu |
|---|--------|-------|---------|
| 1 | **Accueil** | `/` | Feed vertical type Instagram : posts de mes follows + mes posts. V1 : follows uniquement. V1.1 : + publics / personnalités. Carte post = photo séance (optionnelle) + description + résumé workout auto (durée/volume/séries/PR) + likes + commentaires + « Faire cette séance ». |
| 2 | **Explorer (Social carte)** | `/explorer` | **Carte plein écran** (pas une liste). Pins = séances programmées proposées par des gens. Clic pin → fiche + Rejoindre / Demander à rejoindre. Bouton + : « Proposer une séance » (titre, salle/lieu, date/heure, places, niveau, visibilité public/privé + invite follows). Privé = invisible sur carte, accessible sur invitation uniquement. |
| 3 | **Programmes** | `/programmes` | Existant conservé : 7 programmes, éditeur, dossiers/couleurs, « Enregistrer séance comme programme ». + bouton Partager (copie via post) / Cloner depuis feed. Bibliothèque exercices accessible depuis ici ou via fiche. |
| 4 | **Profil** | `/profil` | **Tout « moi » regroupé** : avatar/nom/pseudo/bio/stats, onglets Mes posts / Historique / Stats / Calendrier, bouton Réglages (thème, unités, objectif, confidentialité défaut, compte/déconnexion/suppression). Plus de page Réglages séparée dans la nav (route `/reglages` conservée techniquement mais liée depuis Profil). |

Routes techniques conservées (mais non visibles en nav) : `/seance` (live), `/historique/:id`, `/exercices`, `/exercices/:id`, `/programmes/:id`, `/login`, `/profil/:username`.

Anciennes routes supprimées : `/amis` (follow + feed), `/gymbro` (remplacé par `/explorer`). `/stats`, `/calendrier`, `/historique` embarqués en onglets du Profil (routes directes conservées).

## 2. Social — follow, profil unique, posts

### 2.1 Follow (remplace Amis V1)
- Table `follows (follower uuid, followed uuid, created_at, PK(follower,followed))`, RLS : chacun voit ses follows, insert si `follower=auth.uid()`, delete si impliqué.
- Follow en 1 clic, pas de demande. Follow-back = amitié implicite (les 2 se suivent) → débloque invitations privées + visibilité « follows » réciproque si besoin.
- Recherche par pseudo exact + suggestions (follows de mes follows). Pas d'annuaire public, pas de recherche email (l'email reste privé, l'ancien `schema_friends.sql` / `find_user_by_email` est abandonné).
- Compteurs `followers_count / following_count` sur profil (vue ou trigger).

### 2.2 Profil unique
- `profiles (id, username unique, display_name, avatar_url, bio, city, visibility, weekly_goal, followers_count, following_count, updated_at)`.
- Un seul profil pour feed + carte + programmes. Pas de profil GymBro séparé.
- Visibilité post par post : `public | followers | private`. Défaut réglable dans Profil → Réglages. Bodyweight jamais public par défaut.
- Page `/profil/:username` : posts grille + stats + boutons Suivre/Ne plus suivre, Message (V2 ultérieure).

### 2.3 Posts (séance partagée)
- `posts (id, user_id, workout_id nullable, photo_url nullable, caption text 500c, visibility, likes_count, comments_count, created_at)`.
- Création : à la fin d'une séance → écran « Partager ? » : photo (upload Supabase Storage, 1 photo V1, compression client max 1600px), description, visibilité. Postable aussi depuis Historique (« Partager » sur vieille séance).
- `post_likes (post_id, user_id)`, `post_comments (id, post_id, user_id, text 280c, created_at)`. RLS : lecture si post visible (public, ou followers si follow, ou auteur), écriture si visible.
- Feed `/` : `posts de mes follows + miens`, ordre chrono, pagination 20, Realtime ou refetch 30s. Like optimiste, commentaires inline.

## 3. Explorer — carte des séances (remplace GymBro liste)

**Principe simple :** je veux m'entraîner à plusieurs dans MA salle → j'ouvre la carte, je vois les séances proposées autour, je rejoins.

### 3.1 Choix carto — simple et self-hostable
- **Leaflet + react-leaflet + OpenStreetMap** (tuiles OSM, pas de clé API, pas de facturation Google Maps). Paquet ~50ko, PWA-friendly, tactile OK.
- Géocodage : **Nominatim OSM** pour chercher « Basic-Fit Lyon Part-Dieu » (1 req/s, attribution OSM obligatoire) + saisie libre du nom de salle. Pas de GPS précis stocké : on stocke `lat/lng` **de la salle** (lieu public), jamais la position live de l'utilisateur. Bouton « Autour de moi » = geolocation navigateur éphémère (centrage carte uniquement, rien envoyé sans proposer de séance).
- Alternative écartée : Google Maps (payant, clés), Mapbox (token, quota). On reste OSM pour V1.
- Table `sessions (id, host uuid, title, gym_name, address_text, lat double, lng double, starts_at, spots_total 2-8, spots_taken, level, description, visibility public|private, invited uuid[] , created_at)`.
- `session_joins (session_id, user_id)` : rejoindre = +1 place, quitter = -1. Host peut retirer. Complet = bouton désactivé.
- Privé : `visibility=private` → **absent de la carte et de la recherche**, visible uniquement via invitation (notif in-app + lien `/explorer/s/:id`). Inviter = choisir parmi mes followers/followings.

### 3.2 UX carte (minimal)
- Plein écran, header recherche (ville/salle) + filtre date (Aujourd'hui/Demain/Ce week-end) + bouton 📍 recentrer.
- Pins clusterisés (react-leaflet-markercluster ou simple si <100). Couleur pin = complet / dispo / mienne.
- Bottom-sheet au tap : titre, salle + distance approx, date, places X/Y, host (avatar+pseudo), description, bouton Rejoindre / Demander (si privé sur invitation, bouton « Inviter » pour host).
- Création en 1 écran : titre auto (« Push — pecs/épaules »), salle (recherche Nominatim + « ma salle habituelle » en favori), date/heure (aujourd'hui/demain/J+2), places 2-6, visibilité Public/Privé + invités si privé, description courte. Validation → pin immédiat + post optionnel dans feed (« Qui vient ? »).

### 3.3 Sécurité / anti-scraping
- Pas de scraping de salles : base vide au départ, les lieux sont créés par les users (nom + adresse + lat/lng via recherche). Doublons fusionnés par proximité (100m + nom similaire → propose existant).
- Lieu précis d'une session privée jamais exposé (adresse masquée tant que non invité/accepté).
- Limites : 5 sessions actives/host, 20 joins/jour, signalement session/user (`reports`), blocage (`blocks`).

## 4. Programmes & Tracking (sanctuarisé)
- Inchangé : séance live, supersets, chrono, 1RM, bibliothèque 151+876, import JSON, rapports, records.
- Ajouts sociaux minimaux : « Partager » (→ post), « Proposer sur la carte » (→ session pré-remplie depuis programme), « Faire » (depuis feed → activeWorkout clonée).
- Historique/Stats/Calendrier : déplacés en sous-onglets du Profil, code existant réutilisé (`History.tsx`, `Stats.tsx`, `Calendar.tsx` gardés mais routés depuis Profil).

## 5. Technique — Supabase seul

- **Backend unique Supabase** (EU) : Auth Google (Apple/Email plus tard), Postgres, Storage (`post-photos`, `avatars`), Realtime (Phase 2 pour feed/chat, polling d'abord).
- Serveur maison **supprimé** (dossier + `lib/sync.ts` + scripts). `lib/cloudSync.ts` conservé et renommé conceptuellement « sync Supabase » (tracking data). Feed/posts/sessions/follows = lectures directes Supabase (online-first, cache lecture simple).
- Offline : tracking (workouts/routines/exercises) reste offline-first IndexedDB + sync auto. Social (feed/carte) = online requis, message clair si offline.
- Photos : Storage public read, write authentifié, RLS par `user_id`, compression client, max 5Mo, 1 photo/post V1.
- Schéma `supabase/schema_social.sql` (idempotent, après `schema.sql`) : `profiles` étendu (username/bio/city/visibility/counts), `follows`, `posts`, `post_likes`, `post_comments`, `sessions`, `session_joins`, `notifications`, `blocks`, `reports`.
- Dépendances à ajouter : `leaflet`, `react-leaflet` (+ `@types/leaflet` dev). Rien d'autre.
- Tests : `test:all` = build + smoke + audit + regress + pages (sync/mcp retirés). Nouveau `test:social` à créer : follow → post avec photo → feed → like → comment → créer session → join.

## 6. Ce qu'on ne fait PAS (simplification validée)
- Pas de défis, pas de groupes/salles-communautés, pas de leaderboard, pas de chat (juste Rejoindre + notif), pas de coach IA pour l'instant, pas de notifications push (in-app simple `notifications` table + cloche), pas de multi-photo/vidéo, pas de stories, pas de modération auto.

## 7. Roadmap resserrée

**Étape A — Fondations (en cours)** : ✅ nettoyage fait. Reste : `schema_v2.sql` + Storage buckets + `username` unique + visibilité défaut.
**Étape B — Profil 4e onglet** : regrouper Profil + Historique/Stats/Calendrier/Réglages, route `/profil/:username`, follow/unfollow, compteurs.
**Étape C — Posts + Feed (Accueil)** : création post fin de séance (photo+description), feed follows, likes/commentaires, « Faire cette séance ».
**Étape D — Explorer carte** : Leaflet OSM + `sessions` + créer/rejoindre + privé sur invitation + signalement.
**Étape E — Polish** : Realtime, notifs in-app, PWA icons, CGU/RGPD, `test:social`.

Critère DoD global : `npm run build && npm run test:all` verts, RLS vérifiée (privé invisible, followers OK, public OK), séance offline loggable + sync sans doublon, 0 fail audit.

---
*Prochaine action proposée : Étape A → écrire `supabase/schema_v2.sql` + MAJ `App.tsx`/`AppShell.tsx` vers les 4 onglets (Accueil/Explorer/Programmes/Profil). Dis-moi si je lance.*
