import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Injecte la liste des fichiers produits dans `dist/sw.js`, à la place du
 * marqueur `'__VERYHEVY_PRECACHE__'`.
 *
 * Les noms des fichiers compilés sont hachés, donc impossibles à écrire en dur :
 * sans cette étape, le service worker ne précache que `index.html` et
 * l'application affiche un écran blanc hors ligne après une première visite.
 */
function injectServiceWorkerPrecache(): Plugin {
  return {
    name: 'veryhevy-sw-precache',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve('dist')
      const swPath = path.join(outDir, 'sw.js')
      if (!existsSync(swPath)) return

      const assetsDir = path.join(outDir, 'assets')
      const assets = existsSync(assetsDir)
        ? readdirSync(assetsDir).map((file) => `./assets/${file}`)
        : []
      const precache = ['./index.html', './manifest.webmanifest', './icon.svg', ...assets]

      const source = readFileSync(swPath, 'utf8')
      const marker = "'__VERYHEVY_PRECACHE__'"
      if (!source.includes(marker)) {
        this.warn('marqueur de précache introuvable dans dist/sw.js')
        return
      }
      writeFileSync(swPath, source.replace(marker, JSON.stringify(precache)))
    },
  }
}

export default defineConfig({
  // Chemins relatifs : l'application fonctionne aussi bien à la racine d'un domaine
  // qu'en sous-chemin (GitHub Pages : https://<compte>.github.io/<dépôt>/) ou en
  // ouverture directe depuis un fichier.
  base: './',
  plugins: [react(), tailwindcss(), injectServiceWorkerPrecache()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
})