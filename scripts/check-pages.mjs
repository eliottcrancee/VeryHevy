/**
 * Vérifie que le build de production fonctionne **en sous-chemin**, comme sur
 * GitHub Pages (`https://<compte>.github.io/<dépôt>/`).
 *
 *   npm run build && node scripts/check-pages.mjs
 *
 * Sert `dist/` sous un préfixe fictif et contrôle : chargement sans erreur,
 * navigation, manifeste, service worker (portée et enregistrement) et absence
 * de requête en 404 — le mode d'échec typique d'un `base` mal configuré.
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 4336
const PREFIX = '/veryhevy'
const BASE = `http://localhost:${PORT}${PREFIX}/`

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

const server = http.createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  if (!url.startsWith(PREFIX)) {
    res.writeHead(404).end('hors préfixe')
    return
  }
  let rel = url.slice(PREFIX.length)
  if (rel === '' || rel === '/') rel = '/index.html'
  const file = path.join('dist', rel)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end('introuvable')
  }
})
await new Promise((r) => server.listen(PORT, r))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })

const consoleErrors = []
const badResponses = []
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text())
})
page.on('pageerror', (e) => consoleErrors.push(`[pageerror] ${e.message}`))
page.on('response', (r) => {
  // les ressources externes (polices) ne dépendent pas du déploiement
  if (r.status() >= 400 && r.url().startsWith(BASE)) {
    badResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`)
  }
})

await page.goto(BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 800))

check('Sous-chemin : la page se charge', page.url().startsWith(BASE), page.url())
const text = await page.evaluate(() => document.body.innerText.toLowerCase())
check('Sous-chemin : l’accueil est rendu', text.includes('objectif'), `${text.slice(0, 60).replace(/\n/g, ' ')}…`)
check(
  'Sous-chemin : aucune ressource en erreur',
  badResponses.length === 0,
  badResponses.slice(0, 5).join(', '),
)
check('Sous-chemin : aucune erreur console', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
// le CSS et le JS sont bien chargés depuis le sous-chemin
const assetOk = await page.evaluate(() => {
  const js = [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'))
  const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'))
  const sheetLoaded = [...document.styleSheets].some((s) => s.href && s.href.includes('/veryhevy/'))
  return { js, css, sheetLoaded }
})
check('Sous-chemin : la feuille de style est appliquée', assetOk.sheetLoaded, assetOk.css.join(', '))

// navigation par onglets
await page.evaluate(() => {
  const link = [...document.querySelectorAll('nav a')].find((a) => a.textContent?.includes('Stats'))
  link?.click()
})
await new Promise((r) => setTimeout(r, 900))
check('Sous-chemin : la navigation par onglets fonctionne', page.url().includes('#/stats'), page.url())

// manifeste
const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]')
  if (!link) return null
  const res = await fetch(link.href)
  return res.ok ? await res.json() : { error: res.status }
})
check('Sous-chemin : le manifeste PWA est accessible', Boolean(manifest?.name), manifest?.name ?? JSON.stringify(manifest))
check(
  'Sous-chemin : les icônes du manifeste pointent au bon endroit',
  Array.isArray(manifest?.icons) && manifest.icons.every((i) => !String(i.src).startsWith('/')),
  JSON.stringify(manifest?.icons?.[0]?.src),
)

// service worker
await page.evaluate(async () => {
  if ('serviceWorker' in navigator) await navigator.serviceWorker.ready
})
await new Promise((r) => setTimeout(r, 600))
const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { state: 'unsupported' }
  const regs = await navigator.serviceWorker.getRegistrations()
  if (!regs.length || !regs[0].active) return { state: 'inactif' }
  return { state: 'ok', scope: regs[0].scope, controlled: Boolean(navigator.serviceWorker.controller) }
})
check('Sous-chemin : le service worker est actif', sw.state === 'ok', JSON.stringify(sw))
check(
  'Sous-chemin : sa portée couvre bien le sous-chemin',
  sw.state === 'ok' && sw.scope.endsWith(`${PREFIX}/`),
  sw.scope ?? '',
)

// Rechargement réellement hors ligne : on coupe l'origine, le SW doit servir
// la page depuis son cache (Puppeteer n'émule pas la coupure pour le SW).
if (sw.state === 'ok' && sw.controlled) {
  await page.evaluate(() => {
    location.hash = '#/'
  })
  await new Promise((r) => setTimeout(r, 500))
  await new Promise((r) => server.close(r))
  server.closeAllConnections?.()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await new Promise((r) => setTimeout(r, 1500))
  const offlineText = await page.evaluate(() => document.body.innerText.toLowerCase())
  check(
    'Sous-chemin : l’application reste utilisable sans serveur (hors ligne)',
    offlineText.includes('objectif'),
    `${offlineText.slice(0, 50).replace(/\n/g, ' ')}…`,
  )
} else {
  server.close()
}

await browser.close()
console.log(failures === 0 ? '\n✅ build compatible GitHub Pages' : `\n❌ ${failures} problème(s)`)
process.exitCode = failures === 0 ? 0 : 1