/**
 * VeryHevy — serveur de synchro maison.
 *
 * Zéro dépendance (Node 20+), stockage JSON local, protocole minimal :
 *   GET  /v1/health                -> { ok, time }            (sans auth)
 *   GET  /v1/pull?since=<ISO>      -> { time, workouts, routines, exercises, deleted }
 *   POST /v1/push                  -> { time }                (fusion dernier-écrit-gagne)
 *   POST /v1/reset                 -> { time }                (vide tout, usage : reset usine)
 *
 * Auth : `Authorization: Bearer <SYNC_TOKEN>` sur /v1/* (sauf /health).
 * Les suppressions sont conservées comme tombstones (anti-résurrection),
 * élaguées au-delà d'un an.
 *
 *   SYNC_TOKEN=changez-moi DATA_DIR=./data PORT=8443 node server.mjs
 */
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'

const ROOT = dirname(fileURLToPath(import.meta.url))

// Charge server/.env si présent (pratique en lancement direct sans Docker).
try {
  const envText = readFileSync(join(ROOT, '.env'), 'utf8')
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
} catch {
  /* pas de .env : variables d'environnement classiques */
}

const PORT = Number(process.env.PORT ?? 8443)
const DATA_DIR = process.env.DATA_DIR ?? join(ROOT, 'data')
const DATA_FILE = join(DATA_DIR, 'veryhevy-sync.json')
const TOKEN = process.env.SYNC_TOKEN ?? ''
const TOMBSTONE_TTL_DAYS = 365

if (!TOKEN) {
  console.error('ERREUR : définissez SYNC_TOKEN (jeton long, ex. `openssl rand -hex 32`).')
  process.exit(1)
}

/* ------------------------------- stockage ------------------------------- */

function blank() {
  return { workouts: {}, routines: {}, exercises: {}, deleted: {} }
}

function load() {
  try {
    const raw = readFileSync(DATA_FILE, 'utf8')
    const data = { ...blank(), ...JSON.parse(raw) }
    for (const k of ['workouts', 'routines', 'exercises', 'deleted']) {
      if (!data[k] || typeof data[k] !== 'object') data[k] = {}
    }
    return data
  } catch {
    return blank()
  }
}

function save(data) {
  mkdirSync(DATA_DIR, { recursive: true })
  const tmp = `${DATA_FILE}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data))
  renameSync(tmp, DATA_FILE) // écriture atomique
}

/* --------------------------------- logique -------------------------------- */

const tsOf = (e) => e?.updatedAt ?? e?.createdAt ?? ''
const after = (ts, since) => ts > since

function mergeCollection(current, incoming) {
  let applied = 0
  for (const item of incoming ?? []) {
    if (!item || typeof item.id !== 'string') continue
    const prev = current[item.id]
    if (!prev || tsOf(item) >= tsOf(prev)) {
      current[item.id] = item
      applied += 1
    }
  }
  return applied
}

function applyPush(data, body) {
  const now = new Date().toISOString()
  let applied = 0
  applied += mergeCollection(data.workouts, body.workouts)
  applied += mergeCollection(data.routines, body.routines)
  applied += mergeCollection(data.exercises, body.exercises)
  // Tombstones : on ne garde que la plus récente par id.
  for (const t of body.deleted ?? []) {
    if (!t || typeof t.id !== 'string' || !t.deletedAt) continue
    const key = `${t.kind}:${t.id}`
    const prev = data.deleted[key]
    if (!prev || t.deletedAt >= prev.deletedAt) {
      data.deleted[key] = { kind: t.kind, id: t.id, deletedAt: t.deletedAt }
      applied += 1
    }
    // La suppression gagne sur la donnée si elle est plus récente.
    const col = t.kind === 'workout' ? data.workouts : t.kind === 'routine' ? data.routines : data.exercises
    const rec = col?.[t.id]
    if (rec && t.deletedAt > tsOf(rec)) delete col[t.id]
  }
  // Élagage des vieilles tombstones.
  const limit = new Date(Date.now() - TOMBSTONE_TTL_DAYS * 86400000).toISOString()
  for (const [key, t] of Object.entries(data.deleted)) {
    if (t.deletedAt < limit) delete data.deleted[key]
  }
  save(data)
  return { applied, time: now }
}

function applyPull(data, since) {
  const changed = (col) => Object.values(col).filter((e) => after(tsOf(e), since))
  return {
    time: new Date().toISOString(),
    workouts: changed(data.workouts),
    routines: changed(data.routines),
    exercises: changed(data.exercises),
    deleted: Object.values(data.deleted).filter((t) => after(t.deletedAt, since)),
  }
}

/* --------------------------------- HTTP ----------------------------------- */

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  })
  res.end(payload)
}

function authorized(req) {
  const header = req.headers.authorization ?? ''
  const [scheme, value] = header.split(' ')
  if (scheme !== 'Bearer' || !value) return false
  const a = Buffer.from(value)
  const b = Buffer.from(TOKEN)
  return a.length === b.length && timingSafeEqual(a, b)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => {
      chunks.push(c)
      if (Buffer.concat(chunks).length > 50 * 1024 * 1024) {
        reject(new Error('Corps trop volumineux (50 Mo max)'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {})
      } catch {
        reject(new Error('JSON invalide'))
      }
    })
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'OPTIONS') {
      send(res, 204, {})
      return
    }
    if (url.pathname === '/v1/health' && req.method === 'GET') {
      send(res, 200, { ok: true, time: new Date().toISOString() })
      return
    }
    if (!url.pathname.startsWith('/v1/')) {
      send(res, 404, { error: 'inconnu' })
      return
    }
    if (!authorized(req)) {
      send(res, 401, { error: 'jeton manquant ou invalide' })
      return
    }
    if (url.pathname === '/v1/pull' && req.method === 'GET') {
      send(res, 200, applyPull(load(), url.searchParams.get('since') ?? ''))
      return
    }
    if (url.pathname === '/v1/push' && req.method === 'POST') {
      send(res, 200, applyPush(load(), await readBody(req)))
      return
    }
    if (url.pathname === '/v1/reset' && req.method === 'POST') {
      save(blank())
      send(res, 200, { time: new Date().toISOString() })
      return
    }
    send(res, 404, { error: 'inconnu' })
  } catch (err) {
    send(res, 400, { error: err instanceof Error ? err.message : 'requête invalide' })
  }
})

server.listen(PORT, () => {
  console.log(`VeryHevy sync prêt sur http://localhost:${PORT} (données : ${DATA_DIR})`)
})
