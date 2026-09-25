/**
 * Tests de non-régression : vérifient que les correctifs tiennent.
 *
 *   node scripts/regress.mjs
 *
 * - le bouton d'action de l'éditeur de programme est réellement cliquable
 *   (`elementFromPoint`, pas seulement présent dans le DOM) ;
 * - le bandeau « séance en cours » s'empile au-dessus de la navigation mobile
 *   sans jamais la recouvrir ;
 * - les libellés de jour du calendrier correspondent aux dates réelles ;
 * - les unités kg/lb sont converties dans les deux sens (saisie + affichage) ;
 * - une case à cocher bascule une seule fois quand on clique son libellé.
 */
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'

import { browserPath } from './browser.mjs'
const PORT = 4333
const BASE = `http://localhost:${PORT}`

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', env: process.env })
await new Promise((r) => setTimeout(r, 2500))

const browser = await puppeteer.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 900))

/* ---------------- 1. Éditeur de programme : CTA atteignable ---------------- */
{
  const routineId = await page.evaluate(() => window.__veryhevy.getState().routines[1].id)
  await page.goto(`${BASE}/#/programmes/${routineId}`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 900))
  const res = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Démarrer ce programme'))
    if (!btn) return { found: false }
    const r = btn.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    const hit = document.elementFromPoint(x, y)
    const nav = document.querySelector('nav')?.getBoundingClientRect()
    return {
      found: true,
      reachable: hit === btn || btn.contains(hit),
      hitTag: hit?.tagName,
      hitText: (hit?.textContent ?? '').trim().slice(0, 30),
      btnBottom: Math.round(r.bottom),
      viewportH: window.innerHeight,
      // la nav ne doit pas recouvrir le bouton
      overlappedByNav: nav ? r.bottom > nav.top + 1 && r.top < nav.bottom : false,
    }
  })
  check('Éditeur de programme : bouton « Démarrer ce programme » présent', res.found)
  check('Éditeur de programme : bouton cliquable (non recouvert)', res.reachable, `cible = ${res.hitTag} « ${res.hitText} »`)
  check('Éditeur de programme : pas de recouvrement par la nav', res.overlappedByNav === false)
  await page.screenshot({ path: 'screenshots/verif-editeur-programme.png' })
}

/* ---------------- 2. Séance active : nav + bandeau empilés ---------------- */
{
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.startWorkout({ templateId: s.routines[0].id })
  })
  for (const route of ['/#/', '/#/stats']) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' })
    await new Promise((r) => setTimeout(r, 900))
    const res = await page.evaluate(() => {
      const nav = document.querySelector('nav')
      const navR = nav?.getBoundingClientRect()
      const pill = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Séance en cours'))
      const pillR = pill?.getBoundingClientRect()
      const links = [...document.querySelectorAll('nav a')].filter((a) => {
        const r = a.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      const reachable = links.every((a) => {
        const r = a.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return a === hit || a.contains(hit)
      })
      return {
        tabCount: links.length,
        allTabsReachable: reachable,
        pillAboveNav: pillR && navR ? pillR.bottom <= navR.top + 1 : null,
        overlapping: pillR && navR ? pillR.bottom > navR.top + 1 && pillR.top < navR.bottom : false,
      }
    })
    check(`Séance active ${route} : les ${res.tabCount} onglets sont cliquables`, res.allTabsReachable)
    check(`Séance active ${route} : bandeau au-dessus de la nav`, res.pillAboveNav === true)
    check(`Séance active ${route} : aucun chevauchement`, res.overlapping === false)
  }
  await page.screenshot({ path: 'screenshots/verif-seance-active-nav.png' })
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.discardWorkout(s.activeWorkoutId)
  })
}

/* ---------------- 3. Calendrier : libellés alignés sur les dates ---------------- */
{
  await page.goto(`${BASE}/#/calendrier`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 900))
  const res = await page.evaluate(() => {
    const grid = [...document.querySelectorAll('button')].filter((b) => /^\d+$/.test((b.textContent ?? '').trim()))
    const header = [...document.querySelectorAll('div')]
      .filter((d) => d.children.length === 0 && /^(LUN|MAR|MER|JEU|VEN|SAM|DIM)$/i.test((d.textContent ?? '').trim()))
      .map((d) => (d.textContent ?? '').trim().toUpperCase())
    // la cellule "aujourd'hui" porte un ring accent
    const todayIdx = grid.findIndex((b) => String(b.className).includes('ring-accent'))
    const iso = new Date()
    const expected = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'][iso.getDay()]
    return {
      labels: header,
      columnOfToday: todayIdx % 7,
      labelOfTodayColumn: header[todayIdx % 7],
      expected,
    }
  })
  check('Calendrier : 7 libellés de jours', res.labels.length === 7, res.labels.join(' '))
  check(
    "Calendrier : la colonne d'aujourd'hui porte le bon jour",
    res.labelOfTodayColumn === res.expected,
    `colonne ${res.columnOfToday} = ${res.labelOfTodayColumn}, attendu ${res.expected}`,
  )
  await page.screenshot({ path: 'screenshots/verif-calendrier.png' })
}

/* ---------------- 4. Unités : lb appliqué à la saisie et à l'affichage ---------------- */
{
  await page.evaluate(() => window.__veryhevy.getState().updateSettings({ unit: 'lb' }))
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.startWorkout({ templateId: s.routines.find((r) => r.folder === 'PPL').id })
  })
  await page.goto(`${BASE}/#/seance`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1200))

  // saisit 100 dans le premier champ "Poids" (doit valoir 100 lb = 45.36 kg en base)
  const filled = await page.evaluate(() => {
    const input = [...document.querySelectorAll('input[inputmode="decimal"]')].find((i) =>
      (i.getAttribute('aria-label') ?? '').includes('Poids'),
    )
    if (!input) return null
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '100')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return input.getAttribute('aria-label')
  })
  await new Promise((r) => setTimeout(r, 500))
  const stored = await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    const w = s.workouts.find((x) => x.id === s.activeWorkoutId)
    return w.exercises[0].sets[0].weight
  })
  check('Unités : le champ Poids est présent en séance', filled !== null, String(filled))
  check(
    'Unités : 100 lb saisis → poids stocké en kg',
    stored !== undefined && Math.abs(stored - 45.359) < 0.01,
    `stocké = ${stored} kg`,
  )

  const shownLb = await page.evaluate(() => {
    const input = [...document.querySelectorAll('input[inputmode="decimal"]')].find((i) =>
      (i.getAttribute('aria-label') ?? '').includes('Poids'),
    )
    return input?.value
  })
  check('Unités : la saisie reste affichée en lb (100)', shownLb === '100' || shownLb === '100,0', `affiché = ${shownLb}`)
  await page.screenshot({ path: 'screenshots/verif-unites-lb.png' })

  // bascule en kg → la même valeur doit s'afficher convertie
  await page.evaluate(() => window.__veryhevy.getState().updateSettings({ unit: 'kg' }))
  await new Promise((r) => setTimeout(r, 500))
  const shownKg = await page.evaluate(() => {
    const input = [...document.querySelectorAll('input[inputmode="decimal"]')].find((i) =>
      (i.getAttribute('aria-label') ?? '').includes('Poids'),
    )
    return input?.value
  })
  const kgOk = shownKg !== undefined && Math.abs(Number(String(shownKg).replace(',', '.')) - 45.36) < 0.02
  check('Unités : en kg la valeur devient 45,36', kgOk, `affiché = ${shownKg}`)

  // le volume affiché doit suivre l'unité : on renseigne des reps puis on valide la série
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const reps = [...document.querySelectorAll('input[inputmode="decimal"]')].find((i) =>
      (i.getAttribute('aria-label') ?? '').includes('Répétitions'),
    )
    setter.call(reps, '10')
    reps.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await new Promise((r) => setTimeout(r, 300))
  await page.evaluate(() => {
    document.querySelector('button[aria-pressed="false"]')?.click()
  })
  await new Promise((r) => setTimeout(r, 400))
  const volLb = await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.updateSettings({ unit: 'lb' })
    return new Promise((res) =>
      setTimeout(() => {
        const txt = [...document.querySelectorAll('span')]
          .map((e) => (e.textContent ?? '').trim())
          .find((t) => /^[\d\s\u202f\u00a0.,]+ lb$/.test(t))
        res(txt ?? null)
      }, 400),
    )
  })
  check('Unités : un volume chiffré est affiché en lb en séance', Boolean(volLb), `ex. « ${volLb} »`)
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.discardWorkout(s.activeWorkoutId)
    s.updateSettings({ unit: 'kg' })
  })
}

/* ---------------- 5. Case à cocher : clic sur le libellé ---------------- */
{
  await page.goto(`${BASE}/#/reglages`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 900))
  const read = () =>
    page.evaluate(() => {
      const sw = [...document.querySelectorAll('button[role="switch"]')].find((b) =>
        (b.parentElement?.textContent ?? '').includes('Garder l’écran allumé'),
      )
      return sw?.getAttribute('aria-checked') ?? null
    })
  const before = await read()
  await page.evaluate(() => {
    const sw = [...document.querySelectorAll('button[role="switch"]')].find((b) =>
      (b.parentElement?.textContent ?? '').includes('Garder l’écran allumé'),
    )
    sw?.parentElement?.querySelector('label')?.click()
  })
  await new Promise((r) => setTimeout(r, 500))
  const after = await read()
  check('Case à cocher : un clic sur le libellé bascule une seule fois', before !== after, `${before} → ${after}`)
  const stored = await page.evaluate(() => window.__veryhevy.getState().settings.keepAwake)
  check(
    'Case à cocher : la valeur enregistrée correspond à l’état affiché',
    String(stored) === after,
    `affiché = ${after}, enregistré = ${stored}`,
  )
  // remet la valeur d'origine
  await page.evaluate((v) => window.__veryhevy.getState().updateSettings({ keepAwake: v === 'true' }), before)
}

/* ---------------- 6. Supersets : invariant « exactement 2 exercices » ---------------- */
{
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    if (s.activeWorkoutId) s.discardWorkout(s.activeWorkoutId)
    const ids = s.exercises.slice(0, 3).map((e) => e.id)
    s.startWorkout({ exercises: ids.map((exerciseId) => ({ exerciseId })) })
  })
  await page.goto(`${BASE}/#/seance`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1000))

  const groups = () =>
    page.evaluate(() => {
      const s = window.__veryhevy.getState()
      const w = s.workouts.find((x) => x.id === s.activeWorkoutId)
      const counts = {}
      for (const we of w.exercises) {
        if (we.supersetId) counts[we.supersetId] = (counts[we.supersetId] ?? 0) + 1
      }
      return {
        counts,
        orphans: Object.entries(counts)
          .filter(([, n]) => n < 2)
          .map(([id]) => id),
        pairs: Object.values(counts).filter((n) => n === 2).length,
      }
    })

  const openExerciseMenu = (i) =>
    page.evaluate((idx) => {
      const cards = [...document.querySelectorAll('section')]
      cards[idx].querySelector('button[aria-label*="Options de l"]').click()
    }, i)

  const clickMenuLabel = (label) =>
    page.evaluate((l) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === l)
      if (!b) throw new Error(`élément de menu « ${l} » introuvable`)
      b.click()
    }, label)

  const linkTo = (i) =>
    page.evaluate((idx) => {
      const cards = [...document.querySelectorAll('section')]
      const b = [...cards[idx].querySelectorAll('button')].find((x) => x.textContent?.includes('Lier'))
      if (!b) throw new Error(`bouton « Lier » introuvable sur la carte ${idx}`)
      b.click()
    }, i)

  // lie [0] et [1]
  await openExerciseMenu(0)
  await new Promise((r) => setTimeout(r, 250))
  await clickMenuLabel('Créer un superset')
  await new Promise((r) => setTimeout(r, 250))
  await linkTo(1)
  await new Promise((r) => setTimeout(r, 400))
  const step1 = await groups()
  check('Superset : lier [0] et [1] forme une paire', step1.pairs === 1 && step1.orphans.length === 0, JSON.stringify(step1.counts))

  // lie [2] avec [1], qui appartient déjà à une paire
  await openExerciseMenu(2)
  await new Promise((r) => setTimeout(r, 250))
  await clickMenuLabel('Créer un superset')
  await new Promise((r) => setTimeout(r, 250))
  await linkTo(1)
  await new Promise((r) => setTimeout(r, 400))
  const step2 = await groups()
  check(
    'Superset : lier [2] à [1] ne laisse aucun identifiant orphelin',
    step2.orphans.length === 0,
    `groupes = ${JSON.stringify(step2.counts)}`,
  )
  check(
    'Superset : il ne reste qu’une seule paire ([2]+[1]), [0] est libéré',
    step2.pairs === 1 && Object.values(step2.counts).length === 1,
    `groupes = ${JSON.stringify(step2.counts)}`,
  )

  // délie la paire : les deux membres doivent être libérés
  await openExerciseMenu(1)
  await new Promise((r) => setTimeout(r, 250))
  await clickMenuLabel('Retirer du superset')
  await new Promise((r) => setTimeout(r, 400))
  const step3 = await groups()
  check(
    'Superset : délier la paire libère les deux exercices',
    Object.values(step3.counts).length === 0,
    `groupes = ${JSON.stringify(step3.counts)}`,
  )

  // données héritées : un identifiant orphelin doit être nettoyé au chargement
  const cleaned = await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    const w = s.workouts.find((x) => x.id === s.activeWorkoutId)
    w.exercises[0].supersetId = 'ss_orphelin_herite'
    s.bootstrap()
    const after = window.__veryhevy.getState().workouts.find((x) => x.id === w.id)
    return after.exercises.map((e) => e.supersetId)
  })
  check(
    'Superset : un identifiant orphelin hérité est nettoyé',
    cleaned.every((x) => !x),
    JSON.stringify(cleaned),
  )
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.discardWorkout(s.activeWorkoutId)
  })
}

/* ---------------- 7. Chrono de repos / toasts : pas de recouvrement ---------------- */
{
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    if (s.activeWorkoutId) s.discardWorkout(s.activeWorkoutId)
    s.startWorkout({ templateId: s.routines[0].id })
    s.updateSettings({ autoStartRest: true })
  })
  await page.goto(`${BASE}/#/seance`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 900))
  // valide la première série → lance le chrono de repos
  await page.evaluate(() => document.querySelector('button[aria-pressed="false"]')?.click())
  await new Promise((r) => setTimeout(r, 700))

  const res = await page.evaluate(() => {
    const fixedAncestor = (node) => {
      let n = node
      while (n && n !== document.body) {
        if (getComputedStyle(n).position === 'fixed') return n
        n = n.parentElement
      }
      return null
    }
    const rect = (el) => (el ? { top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom } : null)

    const restBar = fixedAncestor(document.querySelector('button[aria-label="+15 s"]'))
    const actionBar = fixedAncestor(
      [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Terminer la séance')),
    )
    return { rest: rect(restBar), action: rect(actionBar) }
  })
  check('Chrono de repos : la barre de repos est visible pendant le repos', res.rest !== null)
  check(
    'Chrono de repos : elle ne recouvre pas la barre « Terminer la séance »',
    Boolean(res.rest && res.action && res.rest.bottom <= res.action.top + 1),
    res.rest && res.action
      ? `repos.bottom=${Math.round(res.rest.bottom)} ≤ action.top=${Math.round(res.action.top)}`
      : '',
  )
  await page.screenshot({ path: 'screenshots/verif-chrono-repos.png' })
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.discardWorkout(s.activeWorkoutId)
  })
}

await browser.close()
server.kill()
console.log(failures === 0 ? '\n✅ Toutes les vérifications passent' : `\n❌ ${failures} vérification(s) en échec`)
process.exitCode = failures === 0 ? 0 : 1
