/**
 * Synchro cloud multi-utilisateurs (Supabase + Auth Google).
 *
 * - Chaque ligne est isolée par user_id = auth.uid() (RLS, voir supabase/schema.sql).
 * - Dernier écrit gagne (horodatages ISO), suppressions via tombstones.
 * - Le local (IndexedDB) reste la source de vérité : no-op si le cloud
 *   n'est pas configuré ou si personne n'est connecté.
 */
import type { Exercise, Routine, SyncTombstone, Workout } from '@/types'
import { syncTs, useStore } from '@/store/store'
import { getSupabase, isCloudEnabled } from './supabase'

export interface CloudSyncSummary {
  status: 'ok' | 'skipped' | 'error'
  pushed?: number
  pulled?: number
  deleted?: number
  at?: string
  error?: string
}

const UID_KEY = 'veryhevy-cloud-uid'

let running: Promise<CloudSyncSummary> | null = null
let kickTimer: ReturnType<typeof setTimeout> | null = null

export function kickCloudSoon(delayMs = 4000): void {
  if (typeof window === 'undefined') return
  if (kickTimer) clearTimeout(kickTimer)
  kickTimer = setTimeout(() => {
    kickTimer = null
    void syncCloudNow()
  }, delayMs)
}

function fingerprint(): string {
  const s = useStore.getState()
  const stamp = (list: { updatedAt?: string; createdAt?: string }[]): string => {
    let max = ''
    for (const e of list) {
      const t = e.updatedAt ?? e.createdAt ?? ''
      if (t > max) max = t
    }
    return `${list.length}:${max}`
  }
  return [stamp(s.workouts), stamp(s.routines), stamp(s.exercises), s.syncDeleted.length].join('|')
}

/** Passe complète : push des modifs locales puis pull, pour l'utilisateur connecté. */
export function syncCloudNow(): Promise<CloudSyncSummary> {
  if (running) return running
  running = (async (): Promise<CloudSyncSummary> => {
    const supabase = getSupabase()
    if (!isCloudEnabled || !supabase) return { status: 'skipped' }
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return { status: 'skipped' }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'skipped' }

    try {
      const st = useStore.getState()
      // Changement de compte sur cet appareil : on repart d'un pull complet
      // pour ne pas rater l'historique du nouveau compte.
      let since = st.settings.lastSyncAt ?? ''
      try {
        const prevUid = localStorage.getItem(UID_KEY)
        if (prevUid && prevUid !== user.id) since = ''
        localStorage.setItem(UID_KEY, user.id)
      } catch { /* stockage indisponible */ }

      const dirtyWorkouts = st.workouts.filter((w) => syncTs(w) > since)
      const dirtyRoutines = st.routines.filter((r) => syncTs(r) > since)
      const dirtyExercises = st.exercises.filter((e) => syncTs(e) > since)
      const dirtyDeleted = st.syncDeleted.filter((t) => t.deletedAt > since)
      const pushed = dirtyWorkouts.length + dirtyRoutines.length + dirtyExercises.length + dirtyDeleted.length

      // Profil (email / nom / avatar Google) — best effort.
      void supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? null,
        display_name:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
        updated_at: new Date().toISOString(),
      })

      if (dirtyWorkouts.length) {
        const { error } = await supabase.from('workouts').upsert(
          dirtyWorkouts.map((w) => ({
            user_id: user.id,
            id: w.id,
            data: w,
            updated_at: syncTs(w) || new Date().toISOString(),
          })),
          { onConflict: 'user_id,id' },
        )
        if (error) throw new Error(`Push séances : ${error.message}`)
      }
      if (dirtyRoutines.length) {
        const { error } = await supabase.from('routines').upsert(
          dirtyRoutines.map((r) => ({
            user_id: user.id,
            id: r.id,
            data: r,
            updated_at: syncTs(r) || new Date().toISOString(),
          })),
          { onConflict: 'user_id,id' },
        )
        if (error) throw new Error(`Push programmes : ${error.message}`)
      }
      if (dirtyExercises.length) {
        const { error } = await supabase.from('exercises').upsert(
          dirtyExercises.map((e) => ({
            user_id: user.id,
            id: e.id,
            data: e,
            updated_at: syncTs(e) || new Date().toISOString(),
          })),
          { onConflict: 'user_id,id' },
        )
        if (error) throw new Error(`Push exercices : ${error.message}`)
      }
      if (dirtyDeleted.length) {
        const { error } = await supabase.from('deleted_items').upsert(
          dirtyDeleted.map((t) => ({
            user_id: user.id,
            kind: t.kind,
            item_id: t.id,
            deleted_at: t.deletedAt,
          })),
          { onConflict: 'user_id,kind,item_id' },
        )
        if (error) throw new Error(`Push suppressions : ${error.message}`)
        // La suppression gagne : on efface les lignes devenues orphelines.
        for (const t of dirtyDeleted) {
          const table = t.kind === 'workout' ? 'workouts' : t.kind === 'routine' ? 'routines' : 'exercises'
          const { error: delErr } = await supabase
            .from(table)
            .delete()
            .eq('user_id', user.id)
            .eq('id', t.id)
          if (delErr) throw new Error(`Nettoyage distant : ${delErr.message}`)
        }
      }

      const now = new Date().toISOString()
      const [wRes, rRes, eRes, dRes] = await Promise.all([
        supabase.from('workouts').select('data').eq('user_id', user.id).gt('updated_at', since),
        supabase.from('routines').select('data').eq('user_id', user.id).gt('updated_at', since),
        supabase.from('exercises').select('data').eq('user_id', user.id).gt('updated_at', since),
        supabase.from('deleted_items').select('kind,item_id,deleted_at').eq('user_id', user.id).gt('deleted_at', since),
      ])
      const firstErr = wRes.error ?? rRes.error ?? eRes.error ?? dRes.error
      if (firstErr) throw new Error(`Pull : ${firstErr.message}`)

      const pull = {
        time: now,
        workouts: (wRes.data ?? []).map((r) => (r as { data: Workout }).data),
        routines: (rRes.data ?? []).map((r) => (r as { data: Routine }).data),
        exercises: (eRes.data ?? []).map((r) => (r as { data: Exercise }).data),
        deleted: ((dRes.data ?? []) as { kind: string; item_id: string; deleted_at: string }[]).map(
          (r): SyncTombstone => ({ kind: r.kind as SyncTombstone['kind'], id: r.item_id, deletedAt: r.deleted_at }),
        ),
      }
      const { applied, deleted } = useStore.getState().applyPulledData(pull)
      useStore.getState().markTombstonesSynced(pull.time)
      useStore.getState().setLastSync(pull.time)
      return { status: 'ok', pushed, pulled: applied, deleted, at: pull.time }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de synchro cloud'
      useStore.getState().setLastSync(useStore.getState().settings.lastSyncAt, message)
      return { status: 'error', error: message }
    } finally {
      running = null
    }
  })()
  return running
}

let started = false

/** À appeler une fois au démarrage (boot + online + intervalle 5 min + événements). */
export function startAutoCloudSync() {
  if (started || typeof window === 'undefined') return
  started = true
  if (!isCloudEnabled) return
  const kick = () => void syncCloudNow()
  window.addEventListener('online', kick)
  setTimeout(kick, 5000)
  setInterval(kick, 5 * 60 * 1000)
  let lastFp = fingerprint()
  useStore.subscribe(() => {
    const fp = fingerprint()
    if (fp === lastFp) return
    lastFp = fp
    kickCloudSoon()
  })
}

/** Supprime les données cloud de l'utilisateur connecté (profil + synchro). */
export async function deleteCloudData(): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Cloud non configuré')
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) throw new Error('Non connecté')
  for (const table of ['workouts', 'routines', 'exercises', 'deleted_items'] as const) {
    const { error } = await supabase.from(table).delete().eq('user_id', user.id)
    if (error) throw new Error(`${table} : ${error.message}`)
  }
}
