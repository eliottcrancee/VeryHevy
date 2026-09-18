# VeryHevy Sync — serveur maison

Zéro dépendance (Node 20+), stockage JSON local (`./data/veryhevy-sync.json`).
L'app pousse ses modifs puis tire celles du serveur quand internet est
disponible ; en conflit, le **dernier écrit gagne** (horodatages ISO).
Les suppressions sont des *tombstones* : rien ne ressuscite tout seul.

## Démarrage (Docker, recommandé)

```bash
cd server
echo "SYNC_TOKEN=$(openssl rand -hex 32)" > .env
docker compose up -d --build
curl http://localhost:8443/v1/health
```

Sans Docker : `SYNC_TOKEN=… node server.mjs` (Node 20+).

## Accès depuis le téléphone

L'app est servie en HTTPS : le navigateur n'accepte de parler qu'en HTTPS
(sauf `localhost`). Le plus simple en usage maison :

1. **Tailscale** sur le serveur et le téléphone (aucun port à ouvrir) ;
2. `tailscale cert <serveur>` pour un certificat HTTPS local ;
3. servez ce Node derrière ce certificat (ou via `tailscale serve https`),
   puis renseignez l'URL `https://…` + le jeton dans
   l'app (Réglages → Synchronisation).

Sans VPN : Caddy/Nginx + Let's Encrypt + DDNS devant le port 8443.

## API (aussi utilisable par un agent IA)

- `GET /v1/health` → `{ ok, time }` (sans auth, pour les sondes).
- `GET /v1/pull?since=<ISO>` → `{ time, workouts, routines, exercises, deleted }`.
- `POST /v1/push` `{ workouts, routines, exercises, deleted }` → `{ applied, time }`.
- `POST /v1/reset` → vide tout (reset usine).

Auth : `Authorization: Bearer <SYNC_TOKEN>` sur `/v1/*` (sauf `/health`).
Toutes les entités portent `id`, `createdAt`, `updatedAt` : un agent peut
donc lire l'historique (`pull?since=…`) pour analyser l'entraînement, ou
même proposer des programmes (les routines poussées apparaîtront dans
l'app à la prochaine synchro).
