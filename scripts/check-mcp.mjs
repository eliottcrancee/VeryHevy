/**
 * MCP local de bout en bout : handshake, tools, lecture, création puis
 * suppression d'un programme (avec tombstone), 401.
 *   node scripts/check-mcp.mjs
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = 8453
const TOKEN = 'test-token-mcp'
const BASE = `http://localhost:${PORT}`
const MCP = `${BASE}/mcp`

let failures = 0
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures += 1
}

async function waitFor(url, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`injoignable : ${url}`)
}

const rpc = (method, params, id = 1, token = TOKEN, extraHeaders = {}) =>
  fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), 'veryhevy-mcp-'))
  const server = spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: String(PORT), SYNC_TOKEN: TOKEN, DATA_DIR: dataDir },
    stdio: 'ignore',
  })
  try {
    await waitFor(`${BASE}/v1/health`)

    // 1. Handshake
    let res = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    const session = res.headers.get('mcp-session-id')
    let body = await res.json()
    check('handshake initialize', res.ok && body.result?.serverInfo?.name === 'veryhevy-sync' && Boolean(session), body.result?.protocolVersion)
    const H = { 'Mcp-Session-Id': session }
    res = await rpc('notifications/initialized', {}, 0, TOKEN, H)
    check('initialized -> 202', res.status === 202)

    // 2. Tools
    res = await rpc('tools/list', {}, 2, TOKEN, H)
    body = await res.json()
    const names = (body.result?.tools ?? []).map((t) => t.name)
    check('8 outils exposés', names.length === 8, names.join(', '))
    for (const must of ['sync_pull', 'list_workouts', 'stats_summary', 'create_program']) {
      check(`outil ${must}`, names.includes(must))
    }

    // 3. Données de test via REST (simule un téléphone synchronisé)
    const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }
    await fetch(`${BASE}/v1/push`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        workouts: [{ id: 'wo_test', name: 'Test MCP', startedAt: '2026-09-10T10:00:00.000Z', finishedAt: '2026-09-10T11:00:00.000Z', status: 'completed', exercises: [{ id: 'we_1', exerciseId: 'ex_dc', exerciseName: 'Développé couché', sets: [{ id: 's1', type: 'normal', weight: 60, reps: 10, completed: true }], restSeconds: 90 }], createdAt: '2026-09-10T10:00:00.000Z', updatedAt: '2026-09-10T11:00:00.000Z' }],
        routines: [],
        exercises: [{ id: 'ex_dc', name: 'Développé couché', category: 'muscu', tracking: 'weight_reps', primaryMuscles: ['pectoraux'], secondaryMuscles: [], equipment: 'barre', level: 'intermédiaire', instructions: [], images: [], isCustom: false, isFavorite: false, createdAt: '2026-09-10T10:00:00.000Z' }],
        deleted: [],
      }),
    })

    // 4. Lecture agent
    res = await rpc('tools/call', { name: 'list_workouts', arguments: { limit: 5 } }, 3, TOKEN, H)
    body = await res.json()
    const listed = JSON.parse(body.result.content[0].text)
    check('list_workouts voit la séance', listed.workouts.some((w) => w.id === 'wo_test' && w.setsDone === 1 && w.volumeKg === 600))

    res = await rpc('tools/call', { name: 'stats_summary', arguments: { days: 365 } }, 4, TOKEN, H)
    body = await res.json()
    const stats = JSON.parse(body.result.content[0].text)
    check('stats_summary cohérent', stats.workouts === 1 && stats.sets === 1 && stats.volumeKg === 600, JSON.stringify(stats))

    // 5. Création de programme par nom d'exercice
    res = await rpc('tools/call', {
      name: 'create_program',
      arguments: { name: 'Prog Agent', exercises: [{ exercise_name: 'développé couché', restSeconds: 120, sets: [{ reps: 8 }, { reps: 8 }] }] },
    }, 5, TOKEN, H)
    body = await res.json()
    const created = JSON.parse(body.result.content[0].text)
    check('create_program (résolution par nom)', Boolean(created.routine_id) && created.exercises === 1, JSON.stringify(created))

    // 6. Nom ambigu / inconnu -> erreur claire
    res = await rpc('tools/call', { name: 'create_program', arguments: { name: 'X', exercises: [{ exercise_name: 'zzz inexistant' }] } }, 6, TOKEN, H)
    body = await res.json()
    check('exercice inconnu -> erreur claire', Boolean(body.error) && /Aucun exercice/i.test(body.error.message), body.error?.message)

    // 7. Suppression + tombstone (le téléphone ne la ressuscitera pas)
    res = await rpc('tools/call', { name: 'delete_program', arguments: { routine_id: created.routine_id } }, 7, TOKEN, H)
    body = await res.json()
    check('delete_program', JSON.parse(body.result.content[0].text).deleted === true)
    const pull = await (await fetch(`${BASE}/v1/pull?since=`, { headers: auth })).json()
    check('tombstone propagée au pull', pull.deleted.some((t) => t.id === created.routine_id))

    // 8. Méthode inconnue + sans auth
    res = await rpc('tools/call', { name: 'nope', arguments: {} }, 8, TOKEN, H)
    body = await res.json()
    check('outil inconnu -> -32601', body.error?.code === -32601)
    res = await rpc('tools/list', {}, 9, 'mauvais')
    check('sans jeton -> 401', res.status === 401)

    if (failures) throw new Error(`${failures} échec(s)`)
    console.log('\n✅ MCP local OK')
  } finally {
    server.kill()
  }
}

main().catch((err) => {
  console.error('ECHEC:', err.stack ?? err.message)
  process.exit(1)
})
