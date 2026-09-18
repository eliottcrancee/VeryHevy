/**
 * Audit de mise en page : débordements horizontaux, tailles tactiles,
 * contrastes de texte. À lancer après `npm run build`.
 */
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4322
const BASE = `http://localhost:${PORT}`

const ROUTES = [
  ['accueil', '/#/'],
  ['programmes', '/#/programmes'],
  ['exercices', '/#/exercices'],
  ['historique', '/#/historique'],
  ['stats', '/#/stats'],
  ['calendrier', '/#/calendrier'],
  ['reglages', '/#/reglages'],
]
const AUDIT = () => {
  const vw = window.innerWidth
  const overflow = []
  const smallTargets = []
  const lowContrast = []

  const parseColor = (c) => {
    if (!c || c === 'transparent') return null
    let m = c.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
      return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
    }
    // color(srgb r g b [/ a]) — composantes de 0 à 1
    m = c.match(/color\(srgb\s+([^)]+)\)/)
    if (m) {
      const parts = m[1].split(/[\s/]+/).filter(Boolean).map(Number)
      if (parts.length >= 3) {
        return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts[3] ?? 1 }
      }
    }
    return null
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const ratio = (a, b) => {
    const l1 = lum(a)
    const l2 = lum(b)
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
  }
  const bgOf = (el) => {
    let node = el
    while (node && node !== document.documentElement) {
      const c = parseColor(getComputedStyle(node).backgroundColor)
      if (c && c.a > 0.85) return c
      node = node.parentElement
    }
    return parseColor(getComputedStyle(document.body).backgroundColor) ?? { r: 0, g: 0, b: 0, a: 1 }
  }

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue

    // débordement : on remonte les ancêtres pour trouver un conteneur qui rogne
    if (r.right > vw + 1.5 && cs.position !== 'fixed') {
      let node = el.parentElement
      let clipped = false
      while (node && node !== document.body) {
        const ox = getComputedStyle(node).overflowX
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') {
          clipped = true
          break
        }
        node = node.parentElement
      }
      if (!clipped) {
        overflow.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 90),
          right: Math.round(r.right),
          text: (el.textContent ?? '').trim().slice(0, 40),
        })
      }
    }

    // cibles tactiles interactives
    const tag = el.tagName.toLowerCase()
    if ((tag === 'button' || tag === 'a') && r.height < 28 && r.width < 28) {
      smallTargets.push({
        tag,
        w: Math.round(r.width),
        h: Math.round(r.height),
        text: (el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label') || '',
      })
    }

    // contraste du texte
    const text = (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      ? el.textContent.trim()
      : ''
    if (text && text.length > 1 && parseFloat(cs.fontSize) >= 11) {
      const fg = parseColor(cs.color)
      if (fg && fg.a > 0.6) {
        const bg = bgOf(el)
        const cr = ratio(fg, bg)
        const size = parseFloat(cs.fontSize)
        const bold = parseInt(cs.fontWeight, 10) >= 700
        const min = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
        if (cr < min) {
          lowContrast.push({
            text: text.slice(0, 40),
            ratio: Math.round(cr * 100) / 100,
            min,
            size,
            cls: String(el.className).slice(0, 60),
          })
        }
      }
    }
  }

  const fixedBottoms = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed') continue
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
    const r = el.getBoundingClientRect()
    if (r.height === 0 || r.width === 0) continue
    if (window.innerHeight - r.bottom <= 4 && r.height > 24) {
      fixedBottoms.push({ cls: String(el.className).slice(0, 60), h: Math.round(r.height), top: Math.round(r.top) })
    }
  }

  /* Éléments interactifs recouverts par un autre élément : c'est le cas
     typique d'un bouton d'action masqué par une barre fixe. On ne teste que
     les éléments appartenant eux-mêmes à une barre fixe/colante : le contenu
     qui défile sous une barre translucide est un comportement normal. */
  const inFixedBar = (node) => {
    let n = node
    while (n && n !== document.body) {
      const pos = getComputedStyle(n).position
      if (pos === 'fixed' || pos === 'sticky') return true
      n = n.parentElement
    }
    return false
  }
  const covered = []
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
    if (el.closest('[aria-hidden="true"]')) continue
    if (!inFixedBar(el)) continue
    const r = el.getBoundingClientRect()
    if (r.width < 6 || r.height < 6) continue
    if (r.bottom < 1 || r.top > window.innerHeight - 1 || r.right < 1 || r.left > window.innerWidth - 1) continue
    const x = Math.min(window.innerWidth - 1, Math.max(1, r.left + r.width / 2))
    const y = Math.min(window.innerHeight - 1, Math.max(1, r.top + r.height / 2))
    const hit = document.elementFromPoint(x, y)
    if (!hit) continue
    if (hit === el || el.contains(hit) || hit.contains(el)) continue
    covered.push({
      tag: el.tagName.toLowerCase(),
      text: ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || '').slice(0, 40),
      cover: `${hit.tagName.toLowerCase()} .${String(hit.className).slice(0, 45)}`,
      top: Math.round(r.top),
    })
  }

  return {
    scrollOverflow: document.documentElement.scrollWidth - vw,
    overflow: overflow.slice(0, 8),
    smallTargets: smallTargets.slice(0, 8),
    lowContrast: lowContrast.slice(0, 10),
    fixedBottoms,
    covered: covered.slice(0, 8),
  }
}

/* Fait défiler le contenu jusqu'en bas puis vérifie qu'aucun élément en flux
   normal (bouton, champ, lien) n'est recouvert par une barre fixe : c'est le
   symptôme d'une marge basse insuffisante. */
const CLIPPED = () => {
  /* Remonte jusqu'à la barre (fixed/sticky) à laquelle appartient `node`,
     en ne retenant que celles ancrées en bas de l'écran : le contenu qui
     défile sous un en-tête collant est un comportement normal. */
  const pinnedBottomBar = (node) => {
    let n = node
    while (n && n !== document.body) {
      const cs = getComputedStyle(n)
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        const r = n.getBoundingClientRect()
        return r.height > 20 && window.innerHeight - r.bottom <= 220 ? n : null
      }
      n = n.parentElement
    }
    return null
  }
  const inFixedBar = (node) => {
    let n = node
    while (n && n !== document.body) {
      const pos = getComputedStyle(n).position
      if (pos === 'fixed' || pos === 'sticky') return true
      n = n.parentElement
    }
    return false
  }
  const measure = () => {
    const out = []
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
      if (el.closest('[aria-hidden="true"]')) continue
      if (inFixedBar(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 6 || r.height < 6) continue
      if (r.bottom < 1 || r.top > window.innerHeight - 1) continue
      const x = Math.min(window.innerWidth - 1, Math.max(1, r.left + r.width / 2))
      const y = Math.min(window.innerHeight - 1, Math.max(1, r.top + r.height / 2))
      const hit = document.elementFromPoint(x, y)
      if (!hit) continue
      if (hit === el || el.contains(hit) || hit.contains(el)) continue
      const bar = pinnedBottomBar(hit)
      if (!bar) continue
      out.push({
        tag: el.tagName.toLowerCase(),
        text: ((el.textContent ?? '').trim() || el.getAttribute('aria-label') || '').slice(0, 40),
        cover: `${bar.tagName.toLowerCase()} .${String(bar.className).slice(0, 45)}`,
      })
    }
    return out.slice(0, 6)
  }

  const main = document.querySelector('main')
  if (!main || main.scrollHeight <= main.clientHeight + 4) return Promise.resolve(measure())
  main.scrollTop = main.scrollHeight
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(measure()))),
  )
}

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore', env: process.env },
)
await new Promise((r) => setTimeout(r, 2500))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })

let problems = 0

// session de départ (données de démo minimales pour peupler l'historique)
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 800))
await page.evaluate(() => {
  const store = window.__veryhevy.getState()
  store.startWorkout({ templateId: store.routines.find((r) => r.folder === 'PPL')?.id })
  const s = window.__veryhevy.getState()
  const wo = s.workouts[0]
  wo.exercises.forEach((we) => {
    we.sets.forEach((set, i) => {
      s.updateSet(wo.id, we.id, set.id, { weight: 40 + i * 5, reps: 10, completed: true })
    })
  })
  s.finishWorkout(wo.id)
})
await new Promise((r) => setTimeout(r, 600))

const auditOne = async (page, label) => {
  const res = await page.evaluate(AUDIT)
  const clipped = await page.evaluate(CLIPPED)
  const overlap = Math.max(0, res.fixedBottoms.length - 1)
  const issues =
    res.overflow.length +
    res.smallTargets.length +
    res.lowContrast.length +
    (res.scrollOverflow > 1 ? 1 : 0) +
    overlap +
    res.covered.length +
    clipped.length
  problems += issues
  console.log(`\n=== ${label} === ${issues === 0 ? '✅' : `⚠️  ${issues} problème(s)`}`)
  if (res.scrollOverflow > 1) console.log(`  scroll horizontal de ${res.scrollOverflow}px`)
  if (overlap) console.log('  barres fixes superposées :', JSON.stringify(res.fixedBottoms, null, 2))
  if (res.covered.length) console.log('  éléments recouverts :', JSON.stringify(res.covered, null, 2))
  if (clipped.length) console.log('  fin de page masquée par une barre fixe :', JSON.stringify(clipped, null, 2))
  if (res.overflow.length) console.log('  débordements :', JSON.stringify(res.overflow, null, 2))
  if (res.smallTargets.length) console.log('  cibles tactiles < 28px :', JSON.stringify(res.smallTargets, null, 2))
  if (res.lowContrast.length) console.log('  contrastes faibles :', JSON.stringify(res.lowContrast, null, 2))
}

for (const theme of ['dark', 'light']) {
  await page.evaluate((t) => window.__veryhevy.getState().updateSettings({ theme: t }), theme)
  await new Promise((r) => setTimeout(r, 400))
  console.log(`\n########## THÈME ${theme.toUpperCase()} ##########`)

  // Routes dépendant de données existantes (éditeur de programme, fiche exercice).
  const dynamicRoutes = await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    return [
      ['editeur-programme', `/#/programmes/${s.routines[1]?.id ?? s.routines[0]?.id}`],
      ['fiche-exercice', `/#/exercices/${s.exercises[0]?.id}`],
    ]
  })

  for (const [name, route] of [...ROUTES, ...dynamicRoutes]) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' })
    await new Promise((r) => setTimeout(r, 1000))
    await auditOne(page, name)
  }

  // écran de séance en cours
  await page.evaluate(() => {
    const store = window.__veryhevy.getState()
    const routine = store.routines[0]
    if (routine) store.startWorkout({ templateId: routine.id })
  })
  await new Promise((r) => setTimeout(r, 500))
  await page.goto(`${BASE}/#/seance`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 1200))
  await auditOne(page, 'séance-en-cours')

  // séance en cours + navigation : le bandeau ne doit pas masquer les onglets,
  // et aucun bouton d'action fixe ne doit être recouvert.
  for (const [name, route] of [['accueil', '/#/'], ['reglages', '/#/reglages'], ...dynamicRoutes]) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' })
    await new Promise((r) => setTimeout(r, 1000))
    await auditOne(page, `séance-en-cours + ${name}`)
  }
  await page.evaluate(() => {
    const s = window.__veryhevy.getState()
    s.discardWorkout(s.activeWorkoutId)
  })
  await new Promise((r) => setTimeout(r, 300))
}

await browser.close()
server.kill()
console.log(problems === 0 ? '\n✅ aucun problème détecté' : `\n⚠️  ${problems} problème(s) au total`)
process.exitCode = problems === 0 ? 0 : 1