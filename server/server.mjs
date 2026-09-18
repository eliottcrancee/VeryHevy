/**
 * VeryHevy — serveur de synchro maison.
 *
 * Zéro dépendance (Node 20+), stockage JSON local, protocole minimal :
 *   GET  /v1/health                -> { ok, time }            (sans auth)
 *   GET  /v1/pull?since=<ISO>      -> { time, workouts, routines, exercises, deleted }
 *   POST /v1/push                  -> { time }                (fusion dernier-écrit-gagne)
 *   POST /v1/reset                 -> { time }                (vide tout, usage : reset usine)
 *   POST /mcp                      -> JSON-RPC 2.0 (agent IA local, voir plus bas)
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
import { randomUUID, timingSafeEqual } from 'node:crypto'

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

/* Écritures sérialisées (push REST et tools MCP concurrents). */
let writeChain = Promise.resolve()
function save(data) {
  writeChain = writeChain.then(() => {
    mkdirSync(DATA_DIR, { recursive: true })
    const tmp = `${DATA_FILE}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(data))
    renameSync(tmp, DATA_FILE) // écriture atomique
  })
  return writeChain
}
const flushWrites = () => writeChain

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

async function applyPush(data, body) {
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
  await save(data)
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

/* ------------------------------ MCP (agent IA) ------------------------------ *
 * Endpoint local : POST /mcp (JSON-RPC 2.0, transport « streamable HTTP »).
 * Même auth Bearer que la synchro. Lecture de l'historique + création de
 * programmes : l'agent analyse l'entraînement et propose des séances que le
 * téléphone récupère à la synchro suivante.                                */

const MCP_VERSIONS = ['2025-06-18', '2025-03-26']
const mcpSessions = new Map() // sessionId -> createdAt

const shortId = (prefix) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`

function setVolumeOf(sets) {
  return (sets ?? []).reduce((n, s) => {
    if (!s?.completed) return n
    const w = s.weight ?? 0
    const r = s.reps ?? 0
    return n + (w > 0 && r > 0 ? w * r : 0)
  }, 0)
}

function workoutDuration(w) {
  const a = new Date(w.startedAt).getTime()
  const b = w.finishedAt ? new Date(w.finishedAt).getTime() : Date.now()
  return Math.max(0, Math.round((b - a) / 1000))
}

function summarizeWorkout(w) {
  const done = (sets) => (sets ?? []).filter((s) => s.completed).length
  return {
    id: w.id,
    name: w.name,
    startedAt: w.startedAt,
    finishedAt: w.finishedAt ?? null,
    status: w.status,
    templateName: w.templateName ?? null,
    exercises: (w.exercises ?? []).map((we) => ({
      exerciseId: we.exerciseId,
      exerciseName: we.exerciseName ?? null,
      sets: (we.sets ?? []).map((s) => ({
        type: s.type,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        duration: s.duration ?? null,
        distance: s.distance ?? null,
        rpe: s.rpe ?? null,
        completed: Boolean(s.completed),
      })),
    })),
    setsDone: (w.exercises ?? []).reduce((n, we) => n + done(we.sets), 0),
    volumeKg: Math.round(setVolumeOf((w.exercises ?? []).flatMap((we) => we.sets ?? []))),
    durationSeconds: workoutDuration(w),
  }
}

function findExercise(data, { exercise_id, exercise_name }) {
  const list = Object.values(data.exercises)
  if (exercise_id) {
    const ex = data.exercises[exercise_id]
    if (!ex) throw new Error(`Exercice introuvable : ${exercise_id}`)
    return ex
  }
  const q = String(exercise_name ?? '').trim().toLowerCase()
  if (!q) throw new Error('Précisez exercise_id ou exercise_name')
  const exact = list.filter((e) => e.name.toLowerCase() === q)
  if (exact.length === 1) return exact[0]
  const partial = list.filter((e) => e.name.toLowerCase().includes(q))
  if (partial.length === 1) return partial[0]
  if (partial.length === 0) throw new Error(`Aucun exercice trouvé pour « ${exercise_name} »`)
  throw new Error(
    `Nom ambigu : ${partial.slice(0, 5).map((e) => `« ${e.name} » (${e.id})`).join(', ')} — précisez exercise_id`,
  )
}

const MCP_TOOLS = [
  {
    name: 'sync_pull',
    description: "Lit tout ce qui a changé depuis une date ISO (vide = tout) : séances, programmes, exercices, suppressions. Point d'entrée pour analyser l'entraînement.",
    inputSchema: {
      type: 'object',
      properties: { since: { type: 'string', description: 'Date ISO, ex. 2026-09-01T00:00:00.000Z' } },
    },
  },
  {
    name: 'list_workouts',
    description: 'Liste les séances, plus récentes d’abord, avec volume et séries validées.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Défaut 20' },
        offset: { type: 'number', description: 'Défaut 0' },
      },
    },
  },
  {
    name: 'workout_detail',
    description: 'Détail complet d’une séance (toutes les séries).',
    inputSchema: {
      type: 'object',
      properties: { workout_id: { type: 'string' } },
      required: ['workout_id'],
    },
  },
  {
    name: 'stats_summary',
    description: 'Agrégats sur les N derniers jours : séances, séries, volume, temps, par muscle.',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Défaut 30' } },
    },
  },
  {
    name: 'list_exercises',
    description: 'Recherche dans la bibliothèque d’exercices.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nom, muscle ou matériel' },
        category: { type: 'string' },
        limit: { type: 'number', description: 'Défaut 50' },
      },
    },
  },
  {
    name: 'exercise_detail',
    description: 'Fiche complète d’un exercice.',
    inputSchema: {
      type: 'object',
      properties: { exercise_id: { type: 'string' } },
      required: ['exercise_id'],
    },
  },
  {
    name: 'create_program',
    description: 'Crée un programme (récupéré par le téléphone à la prochaine synchro). Les exercices se désignent par id ou par nom.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        color: { type: 'string' },
        exercises: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              exercise_id: { type: 'string' },
              exercise_name: { type: 'string' },
              restSeconds: { type: 'number' },
              sets: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', description: 'normal, echauffement, degressive ou echec' },
                    weight: { type: 'number' },
                    reps: { type: 'number' },
                    duration: { type: 'number', description: 'Secondes' },
                    distance: { type: 'number', description: 'Mètres' },
                  },
                },
              },
            },
          },
        },
      },
      required: ['name', 'exercises'],
    },
  },
  {
    name: 'delete_program',
    description: 'Supprime un programme (propagé aux téléphones à la synchro suivante).',
    inputSchema: {
      type: 'object',
      properties: { routine_id: { type: 'string' } },
      required: ['routine_id'],
    },
  },
]

async function mcpCallTool(data, name, args) {
  const a = args && typeof args === 'object' ? args : {}
  switch (name) {
    case 'sync_pull': {
      return applyPull(data, typeof a.since === 'string' ? a.since : '')
    }
    case 'list_workouts': {
      const all = Object.values(data.workouts)
        .filter((w) => w.status === 'completed')
        .sort((x, y) => (y.startedAt ?? '').localeCompare(x.startedAt ?? ''))
      const limit = Math.min(100, Math.max(1, Number(a.limit) || 20))
      const offset = Math.max(0, Number(a.offset) || 0)
      return {
        total: all.length,
        workouts: all.slice(offset, offset + limit).map(summarizeWorkout),
      }
    }
    case 'workout_detail': {
      if (typeof a.workout_id !== 'string') throw new Error('workout_id requis')
      const w = data.workouts[a.workout_id]
      if (!w) throw new Error(`Séance introuvable : ${a.workout_id}`)
      return summarizeWorkout(w)
    }
    case 'stats_summary': {
      const days = Math.min(365, Math.max(1, Number(a.days) || 30))
      const cutoff = new Date(Date.now() - days * 86400000).toISOString()
      const list = Object.values(data.workouts).filter(
        (w) => w.status === 'completed' && (w.startedAt ?? '') >= cutoff,
      )
      const byMuscle = new Map()
      let sets = 0
      let volumeKg = 0
      let timeSeconds = 0
      for (const w of list) {
        timeSeconds += workoutDuration(w)
        for (const we of w.exercises ?? []) {
          const ex = data.exercises[we.exerciseId]
          const muscle = ex?.primaryMuscles?.[0] ?? 'autre'
          for (const s of we.sets ?? []) {
            if (!s.completed) continue
            sets += 1
            volumeKg += s.weight && s.reps ? s.weight * s.reps : 0
            byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + 1)
          }
        }
      }
      return {
        days,
        workouts: list.length,
        sets,
        volumeKg: Math.round(volumeKg),
        timeSeconds,
        byMuscle: [...byMuscle.entries()]
          .map(([muscle, n]) => ({ muscle, sets: n }))
          .sort((x, y) => y.sets - x.sets),
      }
    }
    case 'list_exercises': {
      const q = String(a.query ?? '').trim().toLowerCase()
      const limit = Math.min(200, Math.max(1, Number(a.limit) || 50))
      const out = Object.values(data.exercises)
        .filter((e) => {
          if (a.category && e.category !== a.category) return false
          if (!q) return true
          return (
            e.name.toLowerCase().includes(q) ||
            (e.primaryMuscles ?? []).some((m) => String(m).toLowerCase().includes(q)) ||
            String(e.equipment ?? '').toLowerCase().includes(q)
          )
        })
        .slice(0, limit)
        .map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          tracking: e.tracking,
          equipment: e.equipment,
          primaryMuscles: e.primaryMuscles ?? [],
        }))
      return { total: out.length, exercises: out }
    }
    case 'exercise_detail': {
      if (typeof a.exercise_id !== 'string') throw new Error('exercise_id requis')
      const e = data.exercises[a.exercise_id]
      if (!e) throw new Error(`Exercice introuvable : ${a.exercise_id}`)
      return e
    }
    case 'create_program': {
      if (typeof a.name !== 'string' || !a.name.trim()) throw new Error('name requis')
      if (!Array.isArray(a.exercises) || !a.exercises.length) throw new Error('exercises non vide requis')
      const now = new Date().toISOString()
      const validTypes = new Set(['normal', 'echauffement', 'degressive', 'echec'])
      const exercises = a.exercises.map((item, i) => {
        if (!item || typeof item !== 'object') throw new Error(`exercises[${i}] invalide`)
        const ex = findExercise(data, item)
        const sets = (Array.isArray(item.sets) && item.sets.length ? item.sets : [{}]).map((s, j) => {
          const t = { type: 'normal' }
          if (s && typeof s === 'object') {
            if (s.type !== undefined) {
              if (!validTypes.has(s.type)) throw new Error(`exercises[${i}].sets[${j}].type invalide`)
              t.type = s.type
            }
            for (const k of ['weight', 'reps', 'duration', 'distance']) {
              if (s[k] !== undefined) {
                if (typeof s[k] !== 'number' || !(s[k] >= 0)) throw new Error(`exercises[${i}].sets[${j}].${k} invalide`)
                t[k] = s[k]
              }
            }
          }
          return t
        })
        return {
          id: shortId('re'),
          exerciseId: ex.id,
          exerciseName: ex.name,
          sets,
          restSeconds: typeof item.restSeconds === 'number' && item.restSeconds >= 0 ? Math.round(item.restSeconds) : 90,
          supersetId: null,
        }
      })
      const routine = {
        id: shortId('rt'),
        name: a.name.trim(),
        description: typeof a.description === 'string' ? a.description : undefined,
        color: typeof a.color === 'string' ? a.color : '#4f83ff',
        exercises,
        timesPerformed: 0,
        createdAt: now,
        updatedAt: now,
      }
      data.routines[routine.id] = routine
      await save(data)
      return { routine_id: routine.id, name: routine.name, exercises: exercises.length }
    }
    case 'delete_program': {
      if (typeof a.routine_id !== 'string') throw new Error('routine_id requis')
      const now = new Date().toISOString()
      delete data.routines[a.routine_id]
      data.deleted[`routine:${a.routine_id}`] = { kind: 'routine', id: a.routine_id, deletedAt: now }
      await save(data)
      return { deleted: true }
    }
    default:
      throw new Error(`Outil inconnu : ${name}`, { cause: 'method-not-found' })
  }
}

function mcpResult(id, result, sessionId) {
  return { status: 200, headers: sessionId ? { 'Mcp-Session-Id': sessionId } : {}, body: { jsonrpc: '2.0', id, result } }
}

function mcpError(id, code, message, sessionId) {
  const status = code === -32001 ? 401 : 200
  return { status, headers: sessionId ? { 'Mcp-Session-Id': sessionId } : {}, body: { jsonrpc: '2.0', id, error: { code, message } } }
}

async function handleMcp(req, body) {
  const msg = body && typeof body === 'object' ? body : {}
  const { id = null, method, params = {} } = msg
  // Notifications : accusé sans corps.
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return { status: 202, headers: {}, body: null }
  }
  let sessionId = req.headers['mcp-session-id']
  if (typeof sessionId !== 'string' || !mcpSessions.has(sessionId)) sessionId = undefined

  if (method === 'initialize') {
    const asked = params?.protocolVersion
    const version = MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0]
    sessionId = shortId('sess')
    mcpSessions.set(sessionId, Date.now())
    return mcpResult(id, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: 'veryhevy-sync', version: '1.0.0' },
    }, sessionId)
  }
  if (method === 'ping') return mcpResult(id, {}, sessionId)
  if (method === 'tools/list') {
    return mcpResult(id, { tools: MCP_TOOLS }, sessionId)
  }
  if (method === 'tools/call') {
    await flushWrites()
    const data = load()
    try {
      const result = await mcpCallTool(data, params?.name, params?.arguments)
      return mcpResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }, sessionId)
    } catch (err) {
      const notFound = err?.cause === 'method-not-found'
      return mcpError(id, notFound ? -32601 : -32602, err instanceof Error ? err.message : 'appel invalide', sessionId)
    }
  }
  return mcpError(id, -32601, `Méthode inconnue : ${method}`, sessionId)
}

/* --------------------------------- HTTP ----------------------------------- */

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
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
    // MCP local (agent IA) avant le garde /v1/ (même auth Bearer).
    if (url.pathname === '/mcp') {
      if (req.method !== 'POST') {
        const payload = JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Utilisez POST (JSON-RPC)' } })
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) })
        res.end(payload)
        return
      }
      if (!authorized(req)) {
        send(res, 401, { error: 'jeton manquant ou invalide' })
        return
      }
      const out = await handleMcp(req, await readBody(req))
      if (out.body === null) {
        res.writeHead(out.status, { 'Access-Control-Allow-Origin': '*' })
        res.end()
        return
      }
      const payload = JSON.stringify(out.body)
      res.writeHead(out.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Mcp-Session-Id',
        ...(out.headers['Mcp-Session-Id'] ? { 'Mcp-Session-Id': out.headers['Mcp-Session-Id'] } : {}),
      })
      res.end(payload)
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
      await flushWrites()
      send(res, 200, applyPull(load(), url.searchParams.get('since') ?? ''))
      return
    }
    if (url.pathname === '/v1/push' && req.method === 'POST') {
      send(res, 200, await applyPush(load(), await readBody(req)))
      return
    }
    if (url.pathname === '/v1/reset' && req.method === 'POST') {
      await save(blank())
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
