/**
 * Synchro automatique avec le serveur maison.
 *
 * Principes :
 * - 100 % locale par défaut (désactivée tant que l'URL n'est pas configurée).
 * - Le local reste la source de vérité : la synchro ne bloque jamais
 *   l'entraînement et part en arrière-plan quand le réseau est là.
 * - Dernier écrit gagne (horodatages ISO), suppressions via tombstones.
 * - Jamais synchronisé : séance en cours, chrono de repos, réglages.
 */
import type { SyncTombstone } from '@/types'
import { syncTs, useStore } from '@/store/store'

export interface SyncSummary {
  status: 'ok' | 'skipped' | 'error'
  pushed?: number
  pulled?: number
  deleted?: number
  at?: string
  error?: string
}

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)

function apiUrl(path: string): { url: string; token: string } | null {
  const { sync } = useStore.getState().settings
  const base = sync.url.trim().replace(/\/+$/, '')
  if (!sync.enabled || !base) return null
  return { url: `${base}/v1${path}`, token: sync.token }
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const api = apiUrl(path)
  if (!api) throw new Error('Synchro non configurée')
  const res = await fetch(api.url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token}`, ...(init?.headers ?? {}) },
  })
  if (res.status === 401) throw new Error('Jeton refusé par le serveur (401)')
  if (res.status === 404) throw new Error('Route inconnue — mettez le serveur à jour (404)')
  if (!res.ok) throw new Error(`Serveur injoignable (HTTP ${res.status})`)
  return res
}

let running: Promise<SyncSummary> | null = null

/** Une passe complète : push des modifs locales puis pull. */
export function syncNow(): Promise<SyncSummary> {
  if (running) return running
  running = (async (): Promise<SyncSummary> => {
    const st = useStore.getState()
    if (!st.settings.sync.enabled || !st.settings.sync.url.trim()) {
      return { status: 'skipped' }
    }
    if (!isOnline()) {
      return { status: 'skipped' }
    }
    try {
      const since = st.settings.lastSyncAt ?? ''
      const dirty = {
        workouts: st.workouts.filter((w) => syncTs(w) > since),
        routines: st.routines.filter((r) => syncTs(r) > since),
        exercises: st.exercises.filter((e) => syncTs(e) > since),
        deleted: st.syncDeleted.filter((t) => t.deletedAt > since) as SyncTombstone[],
      }
      const pushed = dirty.workouts.length + dirty.routines.length + dirty.exercises.length + dirty.deleted.length

      await call('/push', { method: 'POST', body: JSON.stringify(dirty) })

      const pullRes = await call(`/pull?since=${encodeURIComponent(since)}`)
      const pull = (await pullRes.json()) as {
        time: string
        workouts: typeof st.workouts
        routines: typeof st.routines
        exercises: typeof st.exercises
        deleted: SyncTombstone[]
      }
      const { applied, deleted } = useStore.getState().applyPulledData(pull)
      useStore.getState().markTombstonesSynced(pull.time)
      useStore.getState().setLastSync(pull.time)

      return { status: 'ok', pushed, pulled: applied, deleted, at: pull.time }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de synchro'
      useStore.getState().setLastSync(useStore.getState().settings.lastSyncAt, message)
      return { status: 'error', error: message }
    } finally {
      running = null
    }
  })()
  return running
}

/* ------------------------------------------------------------------ */
/* Déclencheurs automatiques                                           */
/* ------------------------------------------------------------------ */

let started = false

/** À appeler une fois au démarrage (boot + online + intervalle 5 min). */
export function startAutoSync() {
  if (started || typeof window === 'undefined') return
  started = true
  const kick = () => {
    if (useStore.getState().settings.sync.enabled) void syncNow()
  }
  window.addEventListener('online', kick)
  // Première passe peu après l'hydratation (laisse IndexedDB répondre).
  setTimeout(kick, 4000)
  setInterval(kick, 5 * 60 * 1000)
}
