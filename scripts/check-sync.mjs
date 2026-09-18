/**
 * Synchro maison de bout en bout : serveur réel + vraie app.
 *   node scripts/check-sync.mjs
 * Scénarios : premier push, pull distant, conflit (LWW des 2 côtés),
 * suppression (tombstone), hors-ligne puis rattrapage, 401.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const SPORT = 8451
const PPORT = 8452
const TOKEN = 'test-token-sync'
const SBASE = `http://localhost:${SPORT}`
const BASE = `http://localhost:${PPORT}`

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

const api = (path, init) =>
  fetch(`${SBASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...(init?.headers ?? {}) },
  })

function startServer(dataDir) {
  return spawn(process.execPath, ['server/server.mjs'], {
    env: { ...process.env, PORT: String(SPORT), SYNC_TOKEN: TOKEN, DATA_DIR: dataDir },
    stdio: 'ignore',
  })
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: node scripts/check-sync.mjs')
    return
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'veryhevy-sync-'))
  let server = startServer(dataDir)
  const preview = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PPORT), '--strictPort'],
    { stdio: 'ignore', env: process.env },
  )
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  try {
    await waitFor(`${SBASE}/v1/health`)
    await waitFor(BASE)
    const page = await browser.newPage()
    await page.goto(`${BASE}/#/reglages`, { waitUntil: 'networkidle2' })
    await page.waitForFunction(() => window.__veryhevy?.getState()?.hydrated, { timeout: 15000, polling: 300 })

    const syncNow = () => page.evaluate(async () => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Synchroniser maintenant'))
      btn?.click()
      await new Promise((r) => setTimeout(r, 1500))
      const s = window.__veryhevy.getState().settings
      return { at: s.lastSyncAt, err: s.lastSyncError ?? null }
    })

    // 1. Configuration + premier sync (push initial)
    await page.evaluate((cfg) => {
      window.__veryhevy.getState().updateSettings({ sync: { url: cfg.url, token: cfg.token, enabled: true } })
    }, { url: SBASE, token: TOKEN })
    let r = await syncNow()
    check('premier sync OK', Boolean(r.at) && !r.err, JSON.stringify(r))
    let pull = await (await api('/v1/pull?since=')).json()
    check('le serveur a reçu la bibliothèque', pull.exercises.length > 100, `${pull.exercises.length} exos`)

    // 2. Séance locale -> serveur
    await page.evaluate(() => {
      const st = window.__veryhevy.getState()
      const id = st.startWorkout({ name: 'Synchro Test' })
      st.finishWorkout(id)
    })
    r = await syncNow()
    pull = await (await api('/v1/pull?since=')).json()
    check('séance poussée', pull.workouts.some((w) => w.name === 'Synchro Test') && !r.err)

    // 3. Changement distant (plus récent, document complet) -> app
    const progId = await page.evaluate(() => window.__veryhevy.getState().routines[0].id)
    const serverCopy = (await (await api('/v1/pull?since=')).json()).routines.find((x) => x.id === progId)
    const plusUneMinute = new Date(Date.now() + 60000).toISOString()
    await api('/v1/push', {
      method: 'POST',
      body: JSON.stringify({ workouts: [], routines: [{ ...serverCopy, name: 'Renommé NAS', updatedAt: plusUneMinute }], exercises: [], deleted: [] }),
    })
    r = await syncNow()
    const renamed = await page.evaluate((id) => window.__veryhevy.getState().routines.find((x) => x.id === id)?.name, progId)
    check('pull distant appliqué (LWW)', renamed === 'Renommé NAS' && !r.err, renamed)

    // 4. Conflit sur un autre programme : l'ancien côté serveur est rejeté, le local gagne
    const otherId = await page.evaluate(() => window.__veryhevy.getState().createRoutine({ name: 'Conflit' }))
    r = await syncNow()
    const old = new Date(Date.now() - 120000).toISOString()
    await api('/v1/push', {
      method: 'POST',
      body: JSON.stringify({ workouts: [], routines: [{ id: otherId, name: 'Vieux NAS', exercises: [], timesPerformed: 0, color: '#000', createdAt: old, updatedAt: old }], exercises: [], deleted: [] }),
    })
    pull = await (await api('/v1/pull?since=')).json()
    check('serveur rejette la version périmée', pull.routines.find((x) => x.id === otherId)?.name === 'Conflit')
    await page.evaluate((id) => window.__veryhevy.getState().updateRoutine(id, { name: 'Conflit Tél' }), otherId)
    r = await syncNow()
    pull = await (await api('/v1/pull?since=')).json()
    check('push local gagnant (LWW)', pull.routines.find((x) => x.id === otherId)?.name === 'Conflit Tél')

    // 5. Suppression locale -> tombstone serveur, file locale purgée
    const wid = await page.evaluate(() => {
      const st = window.__veryhevy.getState()
      const w = st.workouts.find((x) => x.name === 'Synchro Test')
      st.deleteWorkout(w.id)
      return w.id
    })
    r = await syncNow()
    pull = await (await api('/v1/pull?since=')).json()
    check('tombstone côté serveur', pull.deleted.some((t) => t.id === wid))
    const tombs = await page.evaluate(() => window.__veryhevy.getState().syncDeleted.length)
    check('file locale purgée après sync', tombs === 0 && !r.err, `${tombs} restante(s)`)

    // 6. Hors-ligne : erreur enregistrée, données intactes
    server.kill()
    await new Promise((resolve) => { server.on('exit', resolve); setTimeout(resolve, 3000) })
    r = await syncNow()
    check('échec réseau signalé sans casse', r.err !== null || r.at !== null, r.err ?? 'ok')
    const intact = await page.evaluate(() => window.__veryhevy.getState().routines.length > 0)
    check('données intactes hors-ligne', intact)

    // 7. Rattrapage au retour
    server = startServer(dataDir)
    await waitFor(`${SBASE}/v1/health`)
    r = await syncNow()
    check('rattrapage auto au retour', Boolean(r.at) && !r.err, JSON.stringify(r))

    // 8. Mauvais jeton -> 401 explicite
    await page.evaluate(() => {
      const s = window.__veryhevy.getState().settings
      window.__veryhevy.getState().updateSettings({ sync: { ...s.sync, token: 'mauvais' } })
    })
    r = await syncNow()
    check('401 explicite', r.err !== null && r.err.includes('401'), r.err ?? 'pas d’erreur')

    if (failures) throw new Error(`${failures} échec(s)`)
    console.log('\n✅ synchro maison OK')
  } finally {
    await browser.close()
    preview.kill()
    server.kill()
  }
}

main().catch((err) => {
  console.error('ECHEC:', err.stack ?? err.message)
  process.exit(1)
})
