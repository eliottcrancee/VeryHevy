/**
 * Synchro cloud multi-utilisateurs (Supabase + Auth Google).
 *
 * - Chaque ligne est isolée par user_id = auth.uid() (RLS, voir supabase/schema.sql).
 * - Dernier écrit gagne (horodatages ISO), suppressions via tombstones.
 * - Le local (IndexedDB) reste la source de vérité : no-op si le cloud
 *   n'est pas configuré ou si personne n'est connecté.
 */
import type { Exercise, Routine, SyncTombstone, Workout } from '@/types'
import { activateAccount, activeAccountId, syncTs, useStore } from '@/store/store'
import { getSupabase, isCloudEnabled } from './supabase'
import { t } from './i18n'

export interface CloudSyncSummary {
  status: 'ok' | 'skipped' | 'error'
  pushed?: number
  pulled?: number
  deleted?: number
  at?: string
  error?: string
}

let running: Promise<CloudSyncSummary> | null = null
let kickTimer: ReturnType<typeof setTimeout> | null = null
const pauseKey = (uid: string) => `veryhevy-cloud-paused:${uid}`

export function isCloudSyncPaused(uid: string): boolean {
  try { return localStorage.getItem(pauseKey(uid)) === '1' }
  catch { return false }
}

export function resumeCloudSync(uid: string): void {
  localStorage.removeItem(pauseKey(uid))
  useStore.getState().setLastSync(null)
  kickCloudSoon(0)
}

export function kickCloudSoon(delayMs = 4000): void {
  if (typeof window === 'undefined') return
  if (kickTimer) clearTimeout(kickTimer)
  kickTimer = setTimeout(() => {
    kickTimer = null
    void syncCloudNow()
  }, delayMs)
}

/** Après une connexion, une passe du nouveau compte attend la passe précédente. */
export function syncAccountAfterSwitch(userId: string): void {
  const previous = running
  if (previous) {
    void previous.then(() => {
      if (activeAccountId() === userId) return syncCloudNow()
    }).catch(() => {})
  } else kickCloudSoon(500)
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
    if (isCloudSyncPaused(user.id)) return { status: 'skipped' }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'skipped' }

    try {
      await activateAccount(user.id)
      const st = useStore.getState()
      const since = st.settings.lastSyncAt ?? ''

      const dirtyWorkouts = st.workouts.filter((w) => syncTs(w) > since)
      const dirtyRoutines = st.routines.filter((r) => syncTs(r) > since)
      const dirtyExercises = st.exercises.filter((e) => syncTs(e) > since)
      const dirtyDeleted = st.syncDeleted.filter((t) => t.deletedAt > since)
      const pushed = dirtyWorkouts.length + dirtyRoutines.length + dirtyExercises.length + dirtyDeleted.length

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
        if (error) throw new Error(t('lib.pushWorkouts', { msg: error.message }))
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
        if (error) throw new Error(t('lib.pushPrograms', { msg: error.message }))
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
        if (error) throw new Error(t('lib.pushExercises', { msg: error.message }))
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
        if (error) throw new Error(t('lib.pushDeleted', { msg: error.message }))
        // La suppression gagne : on efface les lignes devenues orphelines.
        for (const tomb of dirtyDeleted) {
          const table = tomb.kind === 'workout' ? 'workouts' : tomb.kind === 'routine' ? 'routines' : 'exercises'
          const { error: delErr } = await supabase
            .from(table)
            .delete()
            .eq('user_id', user.id)
            .eq('id', tomb.id)
          if (delErr) throw new Error(t('lib.remoteCleanup', { msg: delErr.message }))
        }
      }

      const now = new Date().toISOString()
      // Supabase limite par défaut les résultats d'une requête. Parcourir toutes
      // les pages évite une perte silencieuse après 1 000 éléments.
      const fetchPages = async (table: 'workouts' | 'routines' | 'exercises' | 'deleted_items') => {
        const rows: Record<string, unknown>[] = []
        const stamp = table === 'deleted_items' ? 'deleted_at' : 'updated_at'
        const columns = table === 'deleted_items' ? 'kind,item_id,deleted_at' : 'data'
        for (let offset = 0; ; offset += 500) {
          // Premier sync (since vide) = pull complet : un `gt('', ...)` ferait
          // échouer Postgres ("invalid input syntax for timestamp with time zone").
          let query = supabase.from(table).select(columns).eq('user_id', user.id)
          if (since) query = query.gt(stamp, since)
          const { data, error } = await query
            .order(stamp, { ascending: true }).range(offset, offset + 499)
          if (error) throw new Error(t('lib.pullError', { table, msg: error.message }))
          const page = (data ?? []) as unknown as Record<string, unknown>[]
          rows.push(...page)
          if (page.length < 500) return rows
        }
      }
      const [wRows, rRows, eRows, dRows] = await Promise.all([
        fetchPages('workouts'), fetchPages('routines'), fetchPages('exercises'), fetchPages('deleted_items'),
      ])

      const { data: latestAuth } = await supabase.auth.getSession()
      if (latestAuth.session?.user.id !== user.id || activeAccountId() !== user.id) {
        return { status: 'skipped' }
      }
      const pull = {
        time: now,
        workouts: wRows.map((r) => r.data as Workout),
        routines: rRows.map((r) => r.data as Routine),
        exercises: eRows.map((r) => r.data as Exercise),
        deleted: (dRows as { kind: string; item_id: string; deleted_at: string }[]).map(
          (r): SyncTombstone => ({ kind: r.kind as SyncTombstone['kind'], id: r.item_id, deletedAt: r.deleted_at }),
        ),
      }
      const { applied, deleted } = useStore.getState().applyPulledData(pull)
      useStore.getState().markTombstonesSynced(pull.time)
      useStore.getState().setLastSync(pull.time)
      return { status: 'ok', pushed, pulled: applied, deleted, at: pull.time }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('lib.syncFailed')
      if (activeAccountId() === user.id) {
        useStore.getState().setLastSync(useStore.getState().settings.lastSyncAt, message)
      }
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
  if (!supabase) throw new Error(t('lib.cloudOff'))
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) throw new Error(t('lib.notConnected'))
  // Empêche immédiatement une resynchronisation qui recréerait les lignes.
  localStorage.setItem(pauseKey(user.id), '1')
  if (running) await running
  try {
    for (const table of ['workouts', 'routines', 'exercises', 'deleted_items'] as const) {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id)
      if (error) throw new Error(t('lib.wipeError', { table, msg: error.message }))
    }
  } catch (err) {
    localStorage.removeItem(pauseKey(user.id))
    throw err
  }
}
