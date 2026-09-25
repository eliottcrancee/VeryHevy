/**
 * Test de fumée : lance Edge headless sur le build de production,
 * parcourt les écrans principaux et rapporte les erreurs console.
 *
 *   node scripts/smoke.mjs [--keep-open]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

import { browserPath } from './browser.mjs'
const PORT = 4319
const BASE = `http://localhost:${PORT}`
const SHOTS = path.resolve('screenshots')

const errors = []

function log(msg) {
  process.stdout.write(`${msg}\n`)
}

async function waitForServer(url, timeoutMs = 40000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 350))
  }
  throw new Error(`Serveur injoignable : ${url}`)
}

async function main() {
  if (!existsSync('dist/index.html')) throw new Error('Lancez `npm run build` avant le test de fumée.')
  mkdirSync(SHOTS, { recursive: true })

  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', env: process.env },
  )

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=430,932'],
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  })

  try {
    await waitForServer(BASE)
    const page = await browser.newPage()

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console] ${msg.text()}`)
    })
    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
    page.on('requestfailed', (req) => {
      const url = req.url()
      if (url.includes('free-exercise-db') || url.includes('fonts.g')) return
      errors.push(`[request] ${url} → ${req.failure()?.errorText}`)
    })

    const shot = async (name) => {
      await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
      log(`  📸 ${name}.png`)
    }

    const step = async (label, fn) => {
      log(`▶ ${label}`)
      try {
        await fn()
      } catch (err) {
        const text = await page.evaluate(() => document.body.innerText).catch(() => '')
        await page.screenshot({ path: path.join(SHOTS, `echec-${label.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {})
        log(`  ✗ ${err.message}`)
        log(`  --- texte de la page ---\n${text.slice(0, 1200)}\n  -----------------------`)
        throw err
      }
    }

    await step('Chargement de l’accueil', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle2' })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('objectif'), { timeout: 15000 })
      await shot('01-accueil')
    })

    await step('Ouverture de la liste des programmes', async () => {
      await page.goto(`${BASE}/#/programmes`, { waitUntil: 'networkidle2' })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('push'), { timeout: 15000 })
      await shot('02-programmes')
    })

    await step('Démarrage d’un programme', async () => {
      const clicked = await page.evaluate(() => {
        const candidates = [...document.querySelectorAll('button')].filter(
          (b) => b.textContent?.trim() === 'Démarrer',
        )
        const btn = candidates.find((b) => {
          let node = b.parentElement
          for (let i = 0; i < 3 && node; i++) {
            if ((node.textContent ?? '').includes('Pectoraux')) return true
            node = node.parentElement
          }
          return false
        })
        if (!btn) return false
        btn.click()
        return true
      })
      if (!clicked) throw new Error('Bouton Démarrer introuvable')
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('terminer la séance'), { timeout: 15000 })
      await shot('03-seance-active')
    })

    await step('Saisie de séries et validation', async () => {
      const ok = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll('input[inputmode="decimal"]')]
        const fill = (el, value) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
          setter.call(el, String(value))
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        let n = 0
        for (const input of inputs.slice(0, 6)) {
          const label = input.getAttribute('aria-label') ?? ''
          fill(input, label.includes('Répétitions') ? 10 : label.includes('Poids') ? 60 : 30)
          n += 1
        }
        return n
      })
      if (ok === 0) throw new Error('Aucun champ de saisie trouvé')
      await new Promise((r) => setTimeout(r, 300))
      // valide les 3 premières séries
      const checked = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('button[aria-pressed="false"]')]
        buttons.slice(0, 3).forEach((b) => b.click())
        return buttons.length
      })
      log(`  ${ok} champs remplis, ${checked} cases de validation disponibles`)
      await new Promise((r) => setTimeout(r, 400))
      await shot('04-seance-saisie')
    })

    await step('Terminer la séance → rapport', async () => {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) =>
          b.textContent?.includes('Terminer la séance'),
        )
        btn?.click()
      })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('terminer la séance ?'), { timeout: 8000 })
      await shot('05-confirmation-fin')
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Terminer')
        btns.at(-1)?.click()
      })
      await page.waitForFunction(() =>
        document.body.innerText.toLowerCase().includes('répartition des séries'),
      { timeout: 15000 })
      const volume = await page.evaluate(() => {
        const state = window.__veryhevy.getState()
        const w = state.workouts.find((x) => x.status === 'completed')
        const done = w.exercises.flatMap((we) => we.sets).filter((s) => s.completed)
        return { sets: done.length, weight: done[0]?.weight ?? null, reps: done[0]?.reps ?? null }
      })
      if (!volume.sets) throw new Error('Aucune série validée enregistrée')
      if (volume.weight === null || volume.reps === null) {
        throw new Error(`Charges non enregistrées (${JSON.stringify(volume)})`)
      }
      log(`  ✓ ${volume.sets} séries persistées (ex. ${volume.weight} kg × ${volume.reps})`)
      await shot('06-rapport')
    })

    await step('Ajout d’un exercice à la séance terminée', async () => {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Modifier')
        btns.at(-1)?.click()
      })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('terminer la séance'), { timeout: 10000 })
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Ajouter un exercice'))
        btn?.click()
      })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('choisir un exercice'), { timeout: 8000 })
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('button')].filter((b) =>
          b.textContent?.toLowerCase().includes('tractions pronation'),
        )
        rows[0]?.click()
        const add = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Ajouter')
        add?.click()
      })
      await new Promise((r) => setTimeout(r, 700))
      await shot('04b-seance-ajout-exercice')
    })

    await step('Historique', async () => {
      await page.goto(`${BASE}/#/historique`, { waitUntil: 'networkidle2' })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('historique'), { timeout: 10000 })
      await shot('07-historique')
    })

    await step('Bibliothèque d’exercices', async () => {
      await page.goto(`${BASE}/#/exercices`, { waitUntil: 'networkidle2' })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('développé couché'), { timeout: 10000 })
      await shot('08-exercices')
    })

    await step('Fiche exercice', async () => {
      await page.evaluate(() => {
        const links = [...document.querySelectorAll('a[href*="/exercices/"]')]
        links[0]?.click()
      })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('fiche'), { timeout: 10000 })
      await shot('09-fiche-exercice')
    })

    await step('Statistiques', async () => {
      await page.goto(`${BASE}/#/stats`, { waitUntil: 'networkidle2' })
      await new Promise((r) => setTimeout(r, 1200))
      await shot('10-stats')
    })

    await step('Calendrier', async () => {
      await page.goto(`${BASE}/#/calendrier`, { waitUntil: 'networkidle2' })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('calendrier'), { timeout: 10000 })
      await shot('11-calendrier')
    })

    await step('Réglages', async () => {
      await page.goto(`${BASE}/#/reglages`, { waitUntil: 'networkidle2' })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('apparence'), { timeout: 10000 })
      await shot('12-reglages')
    })

    await step('Base illustrée auto-téléchargée', async () => {
      const before = await page.evaluate(() => window.__veryhevy.getState().exercises.length)
      // Nouveau flux : la base illustrée se télécharge seule en arrière-plan
      // (~3 s après le chargement). On attend juste le résultat.
      await page.waitForFunction(
        () => window.__veryhevy.getState().exercises.length > 800,
        { timeout: 90000, polling: 1000 },
      )
      const after = await page.evaluate(() => ({
        total: window.__veryhevy.getState().exercises.length,
        withPhotos: window.__veryhevy.getState().exercises.filter((e) => e.images.length > 0).length,
      }))
      log(`  ✓ ${before} → ${after.total} exercices (${after.withPhotos} avec photos)`)
      await shot('16-import-base')
    })

    await step('Recherche après import', async () => {
      await page.goto(`${BASE}/#/exercices`, { waitUntil: 'networkidle2' })
      await page.evaluate(() => {
        const input = document.querySelector('input[placeholder="Rechercher…"]')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'barbell bench')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await new Promise((r) => setTimeout(r, 600))
      await shot('17-recherche-import')
    })

    await step('Création d’un exercice personnalisé', async () => {
      await page.evaluate(() => {
        const input = document.querySelector('input[placeholder="Rechercher…"]')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await page.evaluate(() => {
        // « + » de la barre de recherche = création directe
        const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Créer un exercice')
        btn?.click()
      })
      await page.waitForFunction(() => document.body.innerText.toLowerCase().includes('nouvel exercice'), { timeout: 8000 })
      await page.evaluate(() => {
        const input = document.querySelector('input[placeholder="Ex. Développé incliné"]')
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(input, 'Presse à mollets maison')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await new Promise((r) => setTimeout(r, 300))
      await shot('18-nouvel-exercice')
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Créer')
        btns.at(-1)?.click()
      })
      await new Promise((r) => setTimeout(r, 800))
      const found = await page.evaluate(() =>
        window.__veryhevy.getState().exercises.some((e) => e.name === 'Presse à mollets maison' && e.isCustom),
      )
      if (!found) throw new Error('Exercice personnalisé non créé')
      log('  ✓ exercice personnalisé enregistré')
    })

    await step('Thème clair', async () => {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Clair')
        btn?.click()
      })
      await new Promise((r) => setTimeout(r, 500))
      await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' })
      await new Promise((r) => setTimeout(r, 700))
      await shot('13-accueil-clair')
    })

    await step('Vue desktop', async () => {
      await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 })
      await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle2' })
      await new Promise((r) => setTimeout(r, 900))
      await shot('14-accueil-desktop')
      await page.goto(`${BASE}/#/stats`, { waitUntil: 'networkidle2' })
      await new Promise((r) => setTimeout(r, 1400))
      await shot('15-stats-desktop')
    })

    await step('PWA : manifeste et service worker', async () => {
      const manifest = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="manifest"]')
        if (!link) return null
        const res = await fetch(link.href)
        return res.ok ? await res.json() : null
      })
      if (!manifest?.name) throw new Error('Manifeste PWA introuvable')
      const sw = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'unsupported'
        const regs = await navigator.serviceWorker.getRegistrations()
        return regs.length > 0 ? 'ok' : 'none'
      })
      if (sw !== 'ok') throw new Error(`Service worker non enregistré (${sw})`)
      log(`  ✓ ${manifest.name} — service worker actif`)
    })
  } finally {
    if (!process.argv.includes('--keep-open')) {
      await browser.close()
      server.kill()
    }
  }

  if (errors.length) {
    log(`\n❌ ${errors.length} erreur(s) détectée(s) :`)
    for (const e of [...new Set(errors)]) log(`   • ${e}`)
    process.exitCode = 1
  } else {
    log('\n✅ Aucune erreur console.')
  }
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exitCode = 1
})
