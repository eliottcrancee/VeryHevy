import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { clear, del, get, set } from 'idb-keyval'
import type {
  AppData,
  Exercise,
  RestTimerState,
  Routine,
  RoutineExercise,
  RoutineSetTemplate,
  Settings,
  SetType,
  SyncTombstone,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/types'
import {
  blankWorkoutExercise,
  duplicateSet,
  emptySet,
  lastPerformance,
  lastPerformanceInTemplate,
  workoutSets,
} from '@/lib/calc'
import { createSeedRoutines, SEED_EXERCISES } from '@/lib/seed'
import { mergeExercises } from '@/lib/importers'
import { uid } from '@/lib/utils'

export const DATA_VERSION = 1
const STORAGE_KEY = 'veryhevy-store'

const idbStorage = {
  getItem: (name: string) => get<string>(name).then((v) => v ?? null),
  setItem: (name: string, value: string) => set(name, value),
  removeItem: (name: string) => del(name),
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  distanceUnit: 'km',
  theme: 'dark',
  accent: '#4f83ff',
  defaultRestSeconds: 90,
  autoStartRest: true,
  restSoundEnabled: true,
  restNotifyEnabled: true,
  keepAwake: true,
  weeklyGoal: 4,
  defaultSets: 3,
  showRpe: false,
  firstDayOfWeek: 1,
  sync: { url: '', token: '', enabled: false },
  lastSyncAt: null,
}

interface ImportResult {
  added: number
  updated: number
  skipped: number
}

export interface StoreState extends AppData {
  hydrated: boolean
  restTimer: RestTimerState
  toasts: { id: string; message: string; tone: 'success' | 'error' | 'info' }[]

  /* ------- cycle de vie ------- */
  bootstrap: () => void
  resetAll: () => void
  importData: (data: Partial<AppData>) => void

  /* ------- exercices ------- */
  addExercise: (
    input: Pick<Exercise, 'name' | 'category' | 'tracking'> & Partial<Exercise>,
  ) => Exercise
  updateExercise: (id: string, patch: Partial<Exercise>) => void
  deleteExercise: (id: string) => void
  toggleFavorite: (id: string) => void
  importExercises: (list: Exercise[], opts?: { replace?: boolean }) => ImportResult
  restoreBuiltinExercises: () => void
  replaceLibraryWith: (list: Exercise[]) => void
  /** Retire les exercices importés (base libre…) : ne garde que la base VeryHevy + vos customs. */
  removeImportedExercises: () => number

  /* ------- séances ------- */
  startWorkout: (opts?: {
    name?: string
    templateId?: string
    templateName?: string
    exercises?: { exerciseId: string; setCount?: number; restSeconds?: number }[]
  }) => string
  discardWorkout: (id: string) => void
  deleteWorkout: (id: string) => void
  finishWorkout: (id: string, patch?: Partial<Workout>) => void
  reopenWorkout: (id: string) => void
  /** Met le chrono en pause (durée figée, modifiable, relançable). */
  pauseWorkoutClock: (id: string) => void
  /** Relance le chrono d'une séance rouverte (chrono resté en pause). */
  resumeWorkoutClock: (id: string) => void
  /** Ajuste la durée affichée (chrono en pause ou en cours). */
  setWorkoutDuration: (id: string, seconds: number) => void
  updateWorkout: (id: string, patch: Partial<Workout>) => void
  addExerciseToWorkout: (
    workoutId: string,
    exerciseId: string,
    opts?: { setCount?: number; restSeconds?: number; useHistory?: boolean },
  ) => string | undefined
  removeWorkoutExercise: (workoutId: string, weId: string) => void
  replaceWorkoutExercise: (workoutId: string, weId: string, exerciseId: string) => void
  updateWorkoutExercise: (workoutId: string, weId: string, patch: Partial<WorkoutExercise>) => void
  moveWorkoutExercise: (workoutId: string, weId: string, toIndex: number) => void
  toggleSuperset: (workoutId: string, weIdA: string, weIdB: string) => void

  addSet: (workoutId: string, weId: string, afterSetId?: string) => void
  updateSet: (workoutId: string, weId: string, setId: string, patch: Partial<WorkoutSet>) => void
  removeSet: (workoutId: string, weId: string, setId: string) => void
  duplicateWorkoutSet: (workoutId: string, weId: string, setId: string) => void
  toggleSetCompleted: (workoutId: string, weId: string, setId: string, force?: boolean) => void
  setSetType: (workoutId: string, weId: string, setId: string, type: SetType) => void
  completeAllSets: (workoutId: string, weId: string) => void

  /* ------- programmes ------- */
  createRoutine: (input?: Partial<Routine>) => string
  updateRoutine: (id: string, patch: Partial<Routine>) => void
  deleteRoutine: (id: string) => void
  duplicateRoutine: (id: string) => string
  addExerciseToRoutine: (routineId: string, exerciseId: string, setCount?: number) => void
  removeRoutineExercise: (routineId: string, reId: string) => void
  updateRoutineExercise: (routineId: string, reId: string, patch: Partial<RoutineExercise>) => void
  moveRoutineExercise: (routineId: string, reId: string, toIndex: number) => void
  saveWorkoutAsRoutine: (workoutId: string, name: string) => string | undefined

  /* ------- réglages ------- */
  updateSettings: (patch: Partial<Settings>) => void

  /* ------- synchro serveur maison ------- */
  applyPulledData: (pull: {
    workouts: Workout[]
    routines: Routine[]
    exercises: Exercise[]
    deleted: SyncTombstone[]
  }) => { applied: number; deleted: number }
  markTombstonesSynced: (upTo: string) => void
  setLastSync: (time: string | null, error?: string) => void

  /* ------- repos ------- */
  startRest: (seconds: number, meta?: { label?: string; exerciseId?: string; setId?: string }) => void
  stopRest: () => void
  adjustRest: (deltaSeconds: number) => void
  pauseRest: () => void
  resumeRest: () => void

  /* ------- toasts ------- */
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void
  dismissToast: (id: string) => void
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function workoutPatch(
  workouts: Workout[],
  workoutId: string,
  fn: (w: Workout) => Workout,
): Workout[] {
  return workouts.map((w) => (w.id === workoutId ? { ...fn(w), updatedAt: new Date().toISOString() } : w))
}

function exercisePatch(
  workout: Workout,
  weId: string,
  fn: (we: WorkoutExercise) => WorkoutExercise,
): Workout {
  return { ...workout, exercises: workout.exercises.map((we) => (we.id === weId ? fn(we) : we)) }
}

function setPatch(
  workout: Workout,
  weId: string,
  setId: string,
  fn: (s: WorkoutSet) => WorkoutSet,
): Workout {
  return exercisePatch(workout, weId, (we) => ({
    ...we,
    sets: we.sets.map((s) => (s.id === setId ? fn(s) : s)),
  }))
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

/** Ajoute une trace de suppression pour la synchro (anti-résurrection). */
function addTomb(
  tombs: SyncTombstone[],
  kind: SyncTombstone['kind'],
  id: string,
): SyncTombstone[] {
  if (tombs.some((t) => t.kind === kind && t.id === id)) return tombs
  return [...tombs, { kind, id, deletedAt: new Date().toISOString() }]
}

/** Pré-remplit les séries d'après la dernière performance connue. */
function buildSets(
  exercise: Exercise | undefined,
  history: WorkoutSet[] | undefined,
  setCount: number,
): WorkoutSet[] {
  const fields = trackingFieldsOf(exercise)
  const source = history?.filter((s) => s.completed) ?? []
  return Array.from({ length: Math.max(1, setCount) }, (_, i) => {
    const base = source[Math.min(i, Math.max(0, source.length - 1))]
    const s = emptySet('normal')
    if (base) {
      if (fields.includes('weight')) s.weight = base.weight
      if (fields.includes('reps')) s.reps = base.reps
      if (fields.includes('duration')) s.duration = base.duration
      if (fields.includes('distance')) s.distance = base.distance
    }
    return s
  })
}

export function trackingFieldsOf(exercise: Exercise | undefined): ('weight' | 'reps' | 'duration' | 'distance')[] {
  if (!exercise) return ['weight', 'reps']
  switch (exercise.tracking) {
    case 'weight_reps':
    case 'bodyweight_reps':
      return ['weight', 'reps']
    case 'weight_duration':
      return ['weight', 'duration']
    case 'reps_duration':
      return ['reps', 'duration']
    case 'distance_duration':
      return ['distance', 'duration']
    case 'duration':
      return ['duration']
    case 'reps_only':
      return ['reps']
    case 'weight_distance':
      return ['weight', 'distance']
  }
}

function autoWorkoutName(exercises: Exercise[]): string {
  const h = new Date().getHours()
  const moment = h < 11 ? 'Matin' : h < 17 ? 'Après-midi' : 'Soir'
  const muscles = new Set<string>()
  for (const e of exercises) e.primaryMuscles.forEach((m) => muscles.add(m))
  const focus = [...muscles].slice(0, 2).join(' & ')
  return focus ? `${focus} — ${moment}` : `Séance du ${moment.toLowerCase()}`
}

export function routineToWorkoutExercises(
  routine: Routine,
  exercises: Exercise[],
  workouts: Workout[],
  useHistory: boolean,
): WorkoutExercise[] {
  return routine.exercises.map((re) => {
    const ex = exercises.find((e) => e.id === re.exerciseId)
    // Priorité 1 : ce qui a été fait la dernière fois DANS CE programme
    // (répété intelligemment si le nombre de séries a changé).
    // Sinon : strictement les valeurs prescrites par le programme (le rappel
    // « précédent » sous le nom de l'exercice montre quand même le global).
    const sameProgram = useHistory && ex ? lastPerformanceInTemplate(workouts, ex.id, routine.id)?.sets : undefined
    const pickFrom = (arr: WorkoutSet[] | undefined, i: number) =>
      arr?.length ? arr[Math.min(i, arr.length - 1)] : undefined
    const sets = re.sets.map((t) => {
      const s = emptySet(t.type)
      if (t.weight !== undefined && t.weight > 0) s.weight = t.weight
      if (t.reps !== undefined) s.reps = t.reps
      if (t.duration !== undefined) s.duration = t.duration
      if (t.distance !== undefined) s.distance = t.distance
      return s
    })
    // Remplit intelligemment, même si le nombre de séries a changé :
    // on mappe par index, et on répète la dernière série connue au-delà.
    const merged = sets.map((s, i) => {
      const prev = pickFrom(sameProgram, i)
      // Déjà fait dans ce programme : on reprend tel quel (visible d'un coup
      // d'œil avant de valider) ; le prescrit ne sert que de repli champ par champ.
      if (!prev) return s
      if (prev.weight !== undefined) s.weight = prev.weight
      if (prev.reps !== undefined) s.reps = prev.reps
      if (prev.duration !== undefined) s.duration = prev.duration
      if (prev.distance !== undefined) s.distance = prev.distance
      return s
    })
    return {
      id: uid('we'),
      exerciseId: re.exerciseId,
      exerciseName: re.exerciseName ?? ex?.name,
      sets: merged.length ? merged : [emptySet()],
      restSeconds: re.restSeconds,
      notes: re.notes,
      supersetId: re.supersetId ?? null,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      exercises: [],
      workouts: [],
      routines: [],
      settings: DEFAULT_SETTINGS,
      activeWorkoutId: null,
      version: DATA_VERSION,
      hydrated: false,
      restTimer: { endsAt: null, totalSeconds: 0 },
      toasts: [],
      syncDeleted: [],

      /* -------------------------------------------------- cycle de vie */
      bootstrap: () => {
        if (get().exercises.length === 0) {
          set({ exercises: SEED_EXERCISES.map((e) => ({ ...e })) })
        }
        if (get().routines.length === 0) {
          set({ routines: createSeedRoutines(get().exercises) })
        }
        // Migration douce : les réglages/synchro d'anciennes sauvegardes
        // n'ont pas forcément les nouvelles clés.
        const s = get().settings as Partial<Settings>
        if (!s.sync || s.lastSyncAt === undefined || !Array.isArray(get().syncDeleted)) {
          set({
            settings: {
              ...DEFAULT_SETTINGS,
              ...s,
              sync: { ...DEFAULT_SETTINGS.sync, ...(s.sync ?? {}) },
              lastSyncAt: s.lastSyncAt ?? null,
            },
            syncDeleted: Array.isArray(get().syncDeleted) ? get().syncDeleted : [],
          })
        }
        // Notification de fin de repos : activée par défaut, y compris pour
        // les réglages enregistrés avant l'existence de cette clé.
        if (get().settings.restNotifyEnabled === undefined) {
          set({ settings: { ...get().settings, restNotifyEnabled: true } })
        }
        // Nettoie les supersets orphelins hérités d'anciennes données.
        const current = get()
        const cleaned = normalizeSupersets(current.workouts, current.routines)
        if (cleaned.workouts !== current.workouts || cleaned.routines !== current.routines) {
          set({ workouts: cleaned.workouts, routines: cleaned.routines })
        }
        set({ hydrated: true })
      },

      resetAll: () => {
        // Tout-effacer global : on enterre aussi ce qui part, pour que le
        // serveur suive (sinon il ressusciterait tout au prochain pull).
        // Les graines recréées sont horodatées après les tombstones pour survivre.
        const now = new Date().toISOString()
        const tombstones: SyncTombstone[] = [
          ...get().workouts.map((w) => ({ kind: 'workout' as const, id: w.id, deletedAt: now })),
          ...get().routines.map((r) => ({ kind: 'routine' as const, id: r.id, deletedAt: now })),
          ...get().exercises.map((e) => ({ kind: 'exercise' as const, id: e.id, deletedAt: now })),
        ]
        const fresh = new Date(Date.now() + 1000).toISOString()
        set({
          exercises: SEED_EXERCISES.map((e) => ({ ...e, updatedAt: fresh })),
          workouts: [],
          routines: [],
          activeWorkoutId: null,
          restTimer: { endsAt: null, totalSeconds: 0 },
          syncDeleted: [...get().syncDeleted, ...tombstones],
        })
        set({ routines: createSeedRoutines(get().exercises) })
        void del(STORAGE_KEY)
        get().notify('Données réinitialisées', 'success')
      },

      importData: (data) => {
        const current = get()
        const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
        const exercises = data.exercises?.length
          ? mergeExercises(current.exercises, asArray<Exercise>(data.exercises)).exercises
          : current.exercises
        const workouts = mergeById(current.workouts, asArray<Workout>(data.workouts))
        const routines = mergeById(current.routines, asArray<Routine>(data.routines))
        // Les réglages de synchro de CET appareil sont conservés : restaurer
        // une sauvegarde (p. ex. venue d'un autre téléphone) ne doit jamais
        // écraser l'URL / le jeton configurés ici.
        const incomingSettings: Partial<Settings> = data.settings ?? {}
        set({
          exercises,
          workouts,
          routines,
          settings: {
            ...current.settings,
            ...incomingSettings,
            sync: { ...current.settings.sync, ...(incomingSettings.sync ?? {}) },
          },
        })
        get().notify(
          `Import réussi : ${workouts.length - current.workouts.length} séance(s), ${routines.length - current.routines.length} programme(s)`,
          'success',
        )
      },

      /* ---------------------------------------------------- exercices */
      addExercise: (input) => {
        const ex: Exercise = {
          id: uid('ex'),
          name: input.name.trim(),
          altName: input.altName,
          category: input.category,
          tracking: input.tracking,
          primaryMuscles: input.primaryMuscles ?? [],
          secondaryMuscles: input.secondaryMuscles ?? [],
          equipment: input.equipment ?? 'autre',
          level: input.level ?? 'débutant',
          instructions: input.instructions ?? [],
          images: input.images ?? [],
          tips: input.tips,
          isCustom: true,
          isFavorite: input.isFavorite ?? false,
          source: 'custom',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set({ exercises: [ex, ...get().exercises] })
        return ex
      },

      updateExercise: (id, patch) => {
        const target = get().exercises.find((e) => e.id === id)
        // Seuls les exercices personnalisés sont modifiables : la base
        // intégrée reste en lecture seule (dupliquez pour personnaliser).
        if (!target || !target.isCustom) {
          if (target) get().notify('Exercice de la base : dupliquez-le pour le personnaliser', 'info')
          return
        }
        const now = new Date().toISOString()
        set({
          exercises: get().exercises.map((e) =>
            e.id === id
              ? { ...e, ...patch, id: e.id, isCustom: e.isCustom || patch.isCustom === true, updatedAt: now }
              : e,
          ),
        })
      },

      deleteExercise: (id) => {
        const target = get().exercises.find((e) => e.id === id)
        if (target && !target.isCustom) {
          get().notify('Impossible de supprimer un exercice de la base', 'error')
          return
        }
        // La bibliothèque perd l'exercice, mais l'historique garde sa trace :
        // on fige son nom partout où il est utilisé (séances + programmes).
        const stamp = <T extends { exerciseId: string; exerciseName?: string }>(items: T[]): T[] =>
          items.map((it) =>
            it.exerciseId === id && !it.exerciseName && target
              ? { ...it, exerciseName: target.name }
              : it,
          )
        set({
          exercises: get().exercises.filter((e) => e.id !== id),
          workouts: get().workouts.map((w) => ({ ...w, exercises: stamp(w.exercises) })),
          routines: get().routines.map((r) => ({ ...r, exercises: stamp(r.exercises) })),
          syncDeleted: addTomb(get().syncDeleted, 'exercise', id),
        })
        get().notify(
          target ? `« ${target.name} » supprimé (l'historique garde sa trace)` : 'Exercice supprimé',
          'info',
        )
      },

      toggleFavorite: (id) => {
        set({
          exercises: get().exercises.map((e) =>
            e.id === id ? { ...e, isFavorite: !e.isFavorite } : e,
          ),
        })
      },

      importExercises: (list, opts) => {
        if (opts?.replace) {
          const result = mergeExercises([], list)
          set({ exercises: result.exercises })
          return result
        }
        const result = mergeExercises(get().exercises, list)
        set({ exercises: result.exercises })
        return result
      },

      replaceLibraryWith: (list) => {
        // Remplacement brutal : tout ce qui disparaît est enterré, sinon la
        // prochaine synchro le ressusciterait depuis le serveur.
        const kept = new Set(list.map((e) => e.id))
        const tombs = get().exercises
          .filter((e) => !kept.has(e.id))
          .reduce((acc, e) => addTomb(acc, 'exercise', e.id), get().syncDeleted)
        set({ exercises: list, syncDeleted: tombs })
      },

      restoreBuiltinExercises: () => {
        const before = new Set(get().exercises.map((e) => e.id))
        const result = mergeExercises(get().exercises, SEED_EXERCISES)
        const restoredIds = result.exercises.filter((e) => !before.has(e.id)).map((e) => e.id)
        if (!restoredIds.length) {
          get().notify('Base par défaut déjà complète', 'info')
          return
        }
        // Les réintégrés sont horodatés à maintenant et désenterrés : sans ça,
        // la synchro les supprimerait à nouveau (tombstone plus récente) ou ne
        // les pousserait jamais (horodatage d'origine trop vieux).
        const now = new Date().toISOString()
        const restored = new Set(restoredIds)
        set({
          exercises: result.exercises.map((e) => (restored.has(e.id) ? { ...e, updatedAt: now } : e)),
          syncDeleted: get().syncDeleted.filter(
            (t) => !(t.kind === 'exercise' && restored.has(t.id)),
          ),
        })
        get().notify(`${restoredIds.length} exercice(s) réintégré(s)`, 'success')
      },

      removeImportedExercises: () => {
        const seedIds = new Set(SEED_EXERCISES.map((e) => e.id))
        const before = get().exercises.length
        // On garde la base VeryHevy + tous les exercices personnalisés.
        // Les séances passées ne sont pas touchées : elles conservent leurs
        // séries (le nom reste figé en trace).
        const kept = get().exercises.filter((e) => e.isCustom || seedIds.has(e.id))
        const removedIds = get().exercises.filter((e) => !kept.includes(e)).map((e) => e.id)
        set({
          exercises: kept,
          syncDeleted: removedIds.reduce(
            (tombs, id) => addTomb(tombs, 'exercise', id),
            get().syncDeleted,
          ),
        })
        const removed = before - kept.length
        get().notify(
          removed > 0 ? `${removed} exercice(s) importé(s) retiré(s)` : 'Aucun exercice importé à retirer',
          removed > 0 ? 'success' : 'info',
        )
        return removed
      },

      /* ------------------------------------------------------ séances */
      startWorkout: (opts = {}) => {
        const { exercises, workouts, routines, settings } = get()
        // une seule séance active à la fois
        const previousActive = workouts.find((w) => w.status === 'active')
        let base = workouts
        if (previousActive) {
          base = workoutPatch(base, previousActive.id, (w) => ({
            ...w,
            status: 'completed',
            finishedAt: w.finishedAt ?? new Date().toISOString(),
          }))
        }

        let weList: WorkoutExercise[] = []
        let name = opts.name?.trim()
        if (opts.templateId) {
          const routine = routines.find((r) => r.id === opts.templateId)
          if (routine) {
            weList = routineToWorkoutExercises(routine, exercises, base, true)
            name = name || routine.name
            set({
              routines: routines.map((r) =>
                r.id === routine.id
                  ? { ...r, timesPerformed: r.timesPerformed + 1, lastPerformedAt: new Date().toISOString() }
                  : r,
              ),
            })
          }
        } else if (opts.exercises?.length) {
          weList = opts.exercises.map((item) => {
            const ex = exercises.find((e) => e.id === item.exerciseId)
            // Même logique que depuis un programme : on préfère ce qui a été
            // fait dans ce programme, sinon la dernière performance globale.
            const history =
              lastPerformanceInTemplate(base, item.exerciseId, opts.templateId)?.sets ??
              lastPerformance(base, item.exerciseId)?.sets
            return blankWorkoutExercise(
              item.exerciseId,
              buildSets(ex, history, item.setCount ?? settings.defaultSets),
              item.restSeconds ?? settings.defaultRestSeconds,
              ex?.name,
            )
          })
        }

        if (!name) {
          const picked = weList
            .map((we) => exercises.find((e) => e.id === we.exerciseId))
            .filter((e): e is Exercise => Boolean(e))
          name = autoWorkoutName(picked)
        }

        const now = new Date().toISOString()
        const workout: Workout = {
          id: uid('wo'),
          name,
          startedAt: now,
          status: 'active',
          exercises: weList,
          templateId: opts.templateId,
          templateName: opts.templateName,
          createdAt: now,
          updatedAt: now,
        }
        set({ workouts: [workout, ...base], activeWorkoutId: workout.id })
        return workout.id
      },

      discardWorkout: (id) => {
        set({
          workouts: get().workouts.filter((w) => w.id !== id),
          activeWorkoutId: get().activeWorkoutId === id ? null : get().activeWorkoutId,
          // le chrono de repos n'a plus de sens une fois la séance annulée
          restTimer: get().activeWorkoutId === id ? { endsAt: null, totalSeconds: 0 } : get().restTimer,
          syncDeleted: addTomb(get().syncDeleted, 'workout', id),
        })
      },

      deleteWorkout: (id) => {
        set({
          workouts: get().workouts.filter((w) => w.id !== id),
          activeWorkoutId: get().activeWorkoutId === id ? null : get().activeWorkoutId,
          restTimer: get().activeWorkoutId === id ? { endsAt: null, totalSeconds: 0 } : get().restTimer,
          syncDeleted: addTomb(get().syncDeleted, 'workout', id),
        })
        get().notify('Séance supprimée', 'info')
      },

      finishWorkout: (id, patch) => {
        set({
          workouts: workoutPatch(get().workouts, id, (w) => ({
            ...w,
            ...patch,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          })),
          activeWorkoutId: get().activeWorkoutId === id ? null : get().activeWorkoutId,
          restTimer: { endsAt: null, totalSeconds: 0 },
        })
      },

      reopenWorkout: (id) => {
        // On rouvre sans effacer finishedAt : le chrono reste bloqué sur la
        // durée d'origine (modifiable, relançable). Idéal après un arrêt
        // accidentel : aucune série ni seconde n'est perdue.
        const target = get().workouts.find((w) => w.id === id)
        if (!target) return
        const base = target.finishedAt
          ? get().workouts
          : workoutPatch(get().workouts, id, (w) => ({
              ...w,
              finishedAt: new Date().toISOString(),
            }))
        set({
          workouts: workoutPatch(base, id, (w) => ({ ...w, status: 'active' })),
          activeWorkoutId: id,
        })
        get().notify('Séance rouverte — chrono en pause', 'info')
      },

      pauseWorkoutClock: (id) => {
        const w = get().workouts.find((x) => x.id === id)
        if (!w || w.status !== 'active' || w.finishedAt) return
        set({
          workouts: workoutPatch(get().workouts, id, (x) => ({ ...x, finishedAt: new Date().toISOString() })),
        })
        get().notify('Chrono en pause', 'info')
      },

      resumeWorkoutClock: (id) => {
        const w = get().workouts.find((x) => x.id === id)
        if (!w || !w.finishedAt) return
        const durationMs = Math.max(0, new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime())
        const startedAt = new Date(Date.now() - durationMs).toISOString()
        set({
          workouts: workoutPatch(get().workouts, id, (x) => ({ ...x, startedAt, finishedAt: undefined })),
        })
      },

      setWorkoutDuration: (id, seconds) => {
        const w = get().workouts.find((x) => x.id === id)
        if (!w) return
        const clamped = Math.max(0, Math.round(seconds))
        if (w.finishedAt) {
          const startedAt = new Date(new Date(w.finishedAt).getTime() - clamped * 1000).toISOString()
          set({ workouts: workoutPatch(get().workouts, id, (x) => ({ ...x, startedAt })) })
        } else {
          const startedAt = new Date(Date.now() - clamped * 1000).toISOString()
          set({ workouts: workoutPatch(get().workouts, id, (x) => ({ ...x, startedAt })) })
        }
      },

      updateWorkout: (id, patch) => {
        set({ workouts: workoutPatch(get().workouts, id, (w) => ({ ...w, ...patch })) })
      },

      addExerciseToWorkout: (workoutId, exerciseId, opts = {}) => {
        const { exercises, workouts } = get()
        const workout = workouts.find((w) => w.id === workoutId)
        if (!workout) return undefined
        const ex = exercises.find((e) => e.id === exerciseId)
        const ref =
          opts.useHistory === false
            ? undefined
            : (
                lastPerformanceInTemplate(workouts, exerciseId, workout.templateId, workoutId)?.sets ??
                lastPerformance(workouts, exerciseId, workoutId)?.sets
              )
        const we = blankWorkoutExercise(
          exerciseId,
          buildSets(ex, ref, opts.setCount ?? get().settings.defaultSets),
          opts.restSeconds ?? get().settings.defaultRestSeconds,
          ex?.name,
        )
        set({ workouts: workoutPatch(workouts, workoutId, (w) => ({ ...w, exercises: [...w.exercises, we] })) })
        return we.id
      },

      removeWorkoutExercise: (workoutId, weId) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) => ({
            ...w,
            exercises: w.exercises.filter((we) => we.id !== weId),
          })),
        })
      },

      replaceWorkoutExercise: (workoutId, weId, exerciseId) => {
        const name = get().exercises.find((e) => e.id === exerciseId)?.name
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            exercisePatch(w, weId, (we) => ({ ...we, exerciseId, exerciseName: name ?? we.exerciseName })),
          ),
        })
      },

      updateWorkoutExercise: (workoutId, weId, patch) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            exercisePatch(w, weId, (we) => ({ ...we, ...patch })),
          ),
        })
      },

      moveWorkoutExercise: (workoutId, weId, toIndex) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) => {
            const from = w.exercises.findIndex((e) => e.id === weId)
            return { ...w, exercises: moveItem(w.exercises, from, toIndex) }
          }),
        })
      },

      toggleSuperset: (workoutId, weIdA, weIdB) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) => {
            if (weIdA === weIdB) return w
            const a = w.exercises.find((e) => e.id === weIdA)
            const b = w.exercises.find((e) => e.id === weIdB)
            if (!a || !b) return w

            // Déjà appariés → on délie la paire.
            if (a.supersetId && a.supersetId === b.supersetId) {
              return {
                ...w,
                exercises: w.exercises.map((e) =>
                  e.id === weIdA || e.id === weIdB ? { ...e, supersetId: null } : e,
                ),
              }
            }

            // Sinon on (re)forme une paire. Les anciens partenaires des deux
            // exercices sont libérés : un superset relie exactement 2 exercices,
            // on ne laisse jamais un exercice seul avec un identifiant de groupe.
            const previousGroups = [a.supersetId, b.supersetId].filter(
              (id): id is string => Boolean(id),
            )
            const group = uid('ss')
            return {
              ...w,
              exercises: w.exercises.map((e) => {
                if (e.id === weIdA || e.id === weIdB) return { ...e, supersetId: group }
                if (e.supersetId && previousGroups.includes(e.supersetId)) {
                  return { ...e, supersetId: null }
                }
                return e
              }),
            }
          }),
        })
      },

      /* -------------------------------------------------------- séries */
      addSet: (workoutId, weId, afterSetId) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            exercisePatch(w, weId, (we) => {
              const idx = afterSetId ? we.sets.findIndex((s) => s.id === afterSetId) : we.sets.length - 1
              const next = afterSetId ? we.sets[idx] : undefined
              const fresh = next ? duplicateSet(next) : emptySet('normal')
              const sets = [...we.sets]
              sets.splice(idx + 1, 0, fresh)
              return { ...we, sets }
            }),
          ),
        })
      },

      updateSet: (workoutId, weId, setId, patch) => {
        // updateSet n'est appelé que depuis les champs de saisie : toute clé
        // de donnée présente dans le patch marque le champ comme touché par
        // l'utilisateur (les valeurs pré-remplies restent « fantôme » sinon).
        const touchedKeys = (['weight', 'reps', 'duration', 'distance', 'rpe'] as const).filter(
          (k) => k in patch,
        )
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            setPatch(w, weId, setId, (s) => {
              if (!touchedKeys.length) return { ...s, ...patch }
              const touched = { ...s.touched }
              for (const k of touchedKeys) touched[k] = true
              return { ...s, ...patch, touched }
            }),
          ),
        })
      },

      removeSet: (workoutId, weId, setId) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            exercisePatch(w, weId, (we) => ({ ...we, sets: we.sets.filter((s) => s.id !== setId) })),
          ),
        })
      },

      duplicateWorkoutSet: (workoutId, weId, setId) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            exercisePatch(w, weId, (we) => {
              const idx = we.sets.findIndex((s) => s.id === setId)
              if (idx < 0) return we
              const sets = [...we.sets]
              sets.splice(idx + 1, 0, duplicateSet(we.sets[idx]))
              return { ...we, sets }
            }),
          ),
        })
      },

      toggleSetCompleted: (workoutId, weId, setId, force) => {
        const { settings, workouts } = get()
        const workout = workouts.find((w) => w.id === workoutId)
        const we = workout?.exercises.find((e) => e.id === weId)
        const s = we?.sets.find((x) => x.id === setId)
        if (!workout || !we || !s) return
        const nextCompleted = force ?? !s.completed

        set({
          workouts: workoutPatch(workouts, workoutId, (w) =>
            setPatch(w, weId, setId, (x) => ({
              ...x,
              completed: nextCompleted,
              restTaken: nextCompleted ? x.restTaken : undefined,
            })),
          ),
        })

        if (nextCompleted && settings.autoStartRest && we.restSeconds > 0) {
          get().startRest(we.restSeconds, {
            label: get().exercises.find((e) => e.id === we.exerciseId)?.name,
            exerciseId: we.exerciseId,
            setId,
          })
        }
      },

      setSetType: (workoutId, weId, setId, type) => {
        set({
          workouts: workoutPatch(get().workouts, workoutId, (w) =>
            setPatch(w, weId, setId, (s) => ({ ...s, type })),
          ),
        })
      },

      completeAllSets: (workoutId, weId) => {
        const { settings, workouts } = get()
        const workout = workouts.find((w) => w.id === workoutId)
        const we = workout?.exercises.find((e) => e.id === weId)
        if (!we) return
        const anyIncomplete = we.sets.some((s) => !s.completed)
        set({
          workouts: workoutPatch(workouts, workoutId, (w) =>
            exercisePatch(w, weId, (x) => ({ ...x, sets: x.sets.map((s) => ({ ...s, completed: anyIncomplete })) })),
          ),
        })
        if (anyIncomplete && settings.autoStartRest) {
          get().startRest(we.restSeconds, { label: undefined, exerciseId: we.exerciseId })
        }
      },

      /* ---------------------------------------------------- programmes */
      createRoutine: (input = {}) => {
        const now = new Date().toISOString()
        const routine: Routine = {
          id: input.id ?? uid('rt'),
          name: input.name ?? 'Nouveau programme',
          description: input.description,
          folder: input.folder,
          color: input.color ?? '#4f83ff',
          exercises: input.exercises ?? [],
          timesPerformed: 0,
          createdAt: now,
          updatedAt: now,
        }
        set({ routines: [routine, ...get().routines] })
        return routine.id
      },

      updateRoutine: (id, patch) => {
        set({
          routines: get().routines.map((r) =>
            r.id === id ? { ...r, ...patch, id: r.id, updatedAt: new Date().toISOString() } : r,
          ),
        })
      },

      deleteRoutine: (id) => {
        set({
          routines: get().routines.filter((r) => r.id !== id),
          syncDeleted: addTomb(get().syncDeleted, 'routine', id),
        })
        get().notify('Programme supprimé', 'info')
      },

      duplicateRoutine: (id) => {
        const src = get().routines.find((r) => r.id === id)
        if (!src) return id
        const copy: Routine = {
          ...src,
          id: uid('rt'),
          name: `${src.name} (copie)`,
          timesPerformed: 0,
          lastPerformedAt: undefined,
          exercises: src.exercises.map((re) => ({ ...re, id: uid('re') })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        set({ routines: [copy, ...get().routines] })
        return copy.id
      },

      addExerciseToRoutine: (routineId, exerciseId, setCount = get().settings.defaultSets) => {
        const ex = get().exercises.find((e) => e.id === exerciseId)
        const fields = trackingFieldsOf(ex)
        const sets: RoutineSetTemplate[] = Array.from({ length: Math.max(1, setCount) }, () => {
          const t: RoutineSetTemplate = { type: 'normal' }
          if (fields.includes('reps')) t.reps = 10
          if (fields.includes('duration')) t.duration = 60
          return t
        })
        set({
          routines: get().routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  exercises: [
                    ...r.exercises,
                    {
                      id: uid('re'),
                      exerciseId,
                      exerciseName: ex?.name,
                      sets,
                      restSeconds: get().settings.defaultRestSeconds,
                      supersetId: null,
                    },
                  ],
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        })
      },

      removeRoutineExercise: (routineId, reId) => {
        set({
          routines: get().routines.map((r) =>
            r.id === routineId
              ? { ...r, exercises: r.exercises.filter((x) => x.id !== reId), updatedAt: new Date().toISOString() }
              : r,
          ),
        })
      },

      updateRoutineExercise: (routineId, reId, patch) => {
        set({
          routines: get().routines.map((r) =>
            r.id === routineId
              ? {
                  ...r,
                  exercises: r.exercises.map((x) => (x.id === reId ? { ...x, ...patch } : x)),
                  updatedAt: new Date().toISOString(),
                }
              : r,
          ),
        })
      },

      moveRoutineExercise: (routineId, reId, toIndex) => {
        set({
          routines: get().routines.map((r) => {
            if (r.id !== routineId) return r
            const from = r.exercises.findIndex((x) => x.id === reId)
            return { ...r, exercises: moveItem(r.exercises, from, toIndex), updatedAt: new Date().toISOString() }
          }),
        })
      },

      saveWorkoutAsRoutine: (workoutId, name) => {
        const workout = get().workouts.find((w) => w.id === workoutId)
        if (!workout) return undefined
        const exercises: RoutineExercise[] = workout.exercises.map((we) => ({
          id: uid('re'),
          exerciseId: we.exerciseId,
          exerciseName: we.exerciseName ?? get().exercises.find((e) => e.id === we.exerciseId)?.name,
          restSeconds: we.restSeconds,
          supersetId: we.supersetId ?? null,
          notes: we.notes,
          sets: we.sets.map<RoutineSetTemplate>((s) => ({
            type: s.type,
            weight: undefined,
            reps: s.reps,
            duration: s.duration,
            distance: s.distance,
          })),
        }))
        const id = get().createRoutine({
          name,
          description: `Créé depuis la séance « ${workout.name} »`,
          exercises,
          color: '#4f83ff',
        })
        get().notify('Programme enregistré', 'success')
        return id
      },

      /* ------------------------------------------------------ réglages */
      updateSettings: (patch) => {
        set({ settings: { ...get().settings, ...patch } })
      },

      /* ------------------------------------------- synchro serveur maison */
      applyPulledData: (pull) => {
        const cur = get()
        let applied = 0
        let removed = 0
        const localTombs = new Map(cur.syncDeleted.map((t) => [`${t.kind}:${t.id}`, t.deletedAt]))

        const mergeList = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
          kind: SyncTombstone['kind'],
          local: T[],
          remote: T[],
        ): T[] => {
          const map = new Map(local.map((x) => [x.id, x]))
          for (const r of remote) {
            const rt = syncTs(r)
            // Supprimé localement : on garde la suppression (le push la propagera).
            if (localTombs.has(`${kind}:${r.id}`)) continue
            const l = map.get(r.id)
            if (!l) {
              map.set(r.id, r)
              applied += 1
            } else if (rt > syncTs(l)) {
              map.set(r.id, r)
              applied += 1
            }
          }
          return [...map.values()]
        }

        const workouts = mergeList('workout', cur.workouts, pull.workouts)
        const routines = mergeList('routine', cur.routines, pull.routines)
        const exercises = mergeList('exercise', cur.exercises, pull.exercises)

        // Suppressions distantes (sauf si le local est plus récent → il ressuscitera au push).
        const drop = <T extends { id: string; updatedAt?: string; createdAt?: string }>(
          kind: SyncTombstone['kind'],
          list: T[],
        ): T[] =>
          list.filter((x) => {
            const tomb = pull.deleted.find((d) => d.kind === kind && d.id === x.id)
            if (!tomb) return true
            if (localTombs.has(`${kind}:${x.id}`)) return false
            if (syncTs(x) > tomb.deletedAt) return true
            removed += 1
            return false
          })

        set({
          workouts: drop('workout', workouts),
          routines: drop('routine', routines),
          exercises: drop('exercise', exercises),
        })
        return { applied, deleted: removed }
      },

      markTombstonesSynced: (upTo) => {
        const kept = get().syncDeleted.filter((t) => t.deletedAt > upTo)
        if (kept.length !== get().syncDeleted.length) set({ syncDeleted: kept })
      },

      setLastSync: (time, error) => {
        set({ settings: { ...get().settings, lastSyncAt: time, lastSyncError: error } })
      },

      /* --------------------------------------------------------- repos */
      startRest: (seconds, meta) => {
        if (!seconds || seconds <= 0) return
        set({
          restTimer: {
            endsAt: Date.now() + seconds * 1000,
            totalSeconds: seconds,
            label: meta?.label,
            exerciseId: meta?.exerciseId,
            setId: meta?.setId,
            pausedSeconds: null,
          },
        })
      },

      stopRest: () => set({ restTimer: { endsAt: null, totalSeconds: 0, pausedSeconds: null } }),

      adjustRest: (delta) => {
        const t = get().restTimer
        // Chrono en pause : on ajuste le temps figé.
        if (t.pausedSeconds != null) {
          const pausedSeconds = Math.max(1, Math.round(t.pausedSeconds + delta))
          set({ restTimer: { ...t, pausedSeconds, totalSeconds: Math.max(1, t.totalSeconds + delta) } })
          return
        }
        if (!t.endsAt) return
        const endsAt = Math.max(Date.now() + 1000, t.endsAt + delta * 1000)
        set({ restTimer: { ...t, endsAt, totalSeconds: Math.max(1, t.totalSeconds + delta) } })
      },

      pauseRest: () => {
        const t = get().restTimer
        if (!t.endsAt || t.pausedSeconds != null) return
        const remaining = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000))
        set({ restTimer: { ...t, endsAt: null, pausedSeconds: remaining } })
      },

      resumeRest: () => {
        const t = get().restTimer
        if (t.pausedSeconds == null) return
        const remaining = Math.max(0, Math.round(t.pausedSeconds))
        if (remaining <= 0) {
          set({ restTimer: { ...t, endsAt: Date.now(), pausedSeconds: null } })
          return
        }
        set({ restTimer: { ...t, endsAt: Date.now() + remaining * 1000, pausedSeconds: null } })
      },

      /* -------------------------------------------------------- toasts */
      notify: (message, tone = 'info') => {
        const id = uid('toast')
        set({ toasts: [...get().toasts, { id, message, tone }] })
        setTimeout(() => get().dismissToast(id), 3200)
      },

      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    }),
    {
      name: STORAGE_KEY,
      version: DATA_VERSION,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        exercises: state.exercises,
        workouts: state.workouts,
        routines: state.routines,
        settings: state.settings,
        activeWorkoutId: state.activeWorkoutId,
        version: state.version,
        restTimer: state.restTimer,
        syncDeleted: state.syncDeleted,
      }),
      onRehydrateStorage: () => (state) => {
        state?.bootstrap()
      },
    },
  ),
)

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map(current.map((x) => [x.id, x]))
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()]
}

/** Horodatage de référence pour la synchro (dernier écrit gagne). */
export function syncTs(e: { updatedAt?: string; createdAt?: string }): string {
  return e.updatedAt ?? e.createdAt ?? ''
}

/**
 * Un superset relie exactement deux exercices. Les identifiants de groupe
 * partagés par moins de deux exercices sont des résidus : on les retire pour
 * ne pas afficher un exercice « en superset » alors qu'il n'est chaîné à rien.
 */
function normalizeSupersetGroups<T extends { supersetId?: string | null }>(items: T[]): T[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.supersetId) counts.set(item.supersetId, (counts.get(item.supersetId) ?? 0) + 1)
  }
  const orphans = new Set(
    [...counts.entries()].filter(([, n]) => n < 2).map(([id]) => id),
  )
  if (orphans.size === 0) return items
  return items.map((item) =>
    item.supersetId && orphans.has(item.supersetId) ? ({ ...item, supersetId: null } as T) : item,
  )
}

function normalizeSupersets(
  workouts: Workout[],
  routines: Routine[],
): { workouts: Workout[]; routines: Routine[] } {
  const nextWorkouts = workouts.map((w) => {
    const exercises = normalizeSupersetGroups(w.exercises)
    return exercises === w.exercises ? w : { ...w, exercises }
  })
  const nextRoutines = routines.map((r) => {
    const exercises = normalizeSupersetGroups(r.exercises)
    return exercises === r.exercises ? r : { ...r, exercises }
  })
  return { workouts: nextWorkouts, routines: nextRoutines }
}

/* ------------------------------------------------------------------ */
/* Sélecteurs pratiques                                               */
/* ------------------------------------------------------------------ */

export const selectActiveWorkout = (s: StoreState): Workout | undefined =>
  s.workouts.find((w) => w.id === s.activeWorkoutId) ?? s.workouts.find((w) => w.status === 'active')

export const selectExerciseMap = (s: StoreState): Map<string, Exercise> =>
  new Map(s.exercises.map((e) => [e.id, e]))

export function useExercise(id: string | undefined): Exercise | undefined {
  return useStore((s) => (id ? s.exercises.find((e) => e.id === id) : undefined))
}

export function useActiveWorkout() {
  return useStore((s) => s.workouts.find((w) => w.id === s.activeWorkoutId))
}

/** Le store n'est pas encore hydraté tant qu'IndexedDB n'a pas répondu. */
export function useHydrated() {
  return useStore((s) => s.hydrated)
}

export function useSettings() {
  return useStore((s) => s.settings)
}

export { workoutSets }
export const __clearStorage = () => clear()
// Accès au store depuis la console (debug / automatisation).
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__veryhevy = useStore
}
