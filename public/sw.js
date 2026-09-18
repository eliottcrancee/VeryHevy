/* VeryHevy — service worker
   L'application est précachée à l'installation (y compris les fichiers compilés
   aux noms hachés, injectés au build), puis servie instantanément et hors ligne.
   Les données vivent dans IndexedDB, pas ici. */
const CACHE = 'veryhevy-v4'

/* Injecté par `vite.config.ts` au moment du build : la liste complète des
   fichiers produits (JS, CSS, HTML, manifeste, icône…). En développement, la
   valeur reste une chaîne et l'on retombe sur le shell minimal. */
const PRECACHE = '__VERYHEVY_PRECACHE__'

const BASE_SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg']
const SHELL = Array.isArray(PRECACHE) && PRECACHE.length ? [...BASE_SHELL, ...PRECACHE] : BASE_SHELL

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        // Individuellement, pour qu'un fichier indisponible ne fasse pas
        // échouer tout le précache (contrairement à `addAll`).
        Promise.allSettled(SHELL.map((url) => cache.add(url))),
      )
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Les ressources externes (photos d'exercices, polices) passent par le réseau.
  if (url.origin !== self.location.origin) return
  if (url.pathname.endsWith('/sw.js')) return

  // Navigations : le réseau d'abord, pour récupérer immédiatement une nouvelle
  // version de l'application ; le cache prend le relais hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone()
            // clé stable : le fragment (#/...) ne fait pas partie de la ressource
            caches.open(CACHE).then((cache) => cache.put('./index.html', copy))
          }
          return response
        })
        .catch(async () => {
          return (
            (await caches.match('./index.html')) ||
            (await caches.match(request)) ||
            (await caches.match('./')) ||
            Response.error()
          )
        }),
    )
    return
  }

  // Ressources de l'application : cache d'abord, revalidation en arrière-plan.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchAndCache = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached || fetchAndCache
    }),
  )
})