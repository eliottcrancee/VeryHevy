import type { Exercise, Workout, WorkoutExercise, WorkoutSet, MuscleGroup } from '@/types'
import { toDateKey, startOfWeek, uid, formatDistance, formatWeight } from './utils'

/* ------------------------------------------------------------------
   Séries
------------------------------------------------------------------ */

/** Volume « charge de travail » d'une série : kg × reps. */
export function setVolume(set: WorkoutSet): number {
  if (!set.completed) return 0
  const w = set.weight ?? 0
  const r = set.reps ?? 0
  if (w > 0 && r > 0) return w * r
  return 0
}

/** 1RM estimé (formule d'Epley), sans effet si pas de poids/reps. */
export function estimate1RM(weight?: number, reps?: number): number {
  if (!weight || !reps) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export function isSetEmpty(set: WorkoutSet) {
  return set.weight === undefined && set.reps === undefined && set.duration === undefined && set.distance === undefined
}

/** Libellé compact d'une série, adapté à son type de suivi. */
export function describeSet(set: WorkoutSet, unit: 'kg' | 'lb', distanceUnit: 'km' | 'mi') {
  const parts: string[] = []
  if (set.weight !== undefined) parts.push(formatWeight(set.weight, unit, false))
  if (set.reps !== undefined) parts.push(`${set.reps}`)
  if (set.duration !== undefined) parts.push(`${set.duration}s`)
  if (set.distance !== undefined) parts.push(formatDistance(set.distance, distanceUnit))
  return parts.join(' × ')
}

/* ------------------------------------------------------------------
   Séance
------------------------------------------------------------------ */

export function workoutVolume(workout: Workout): number {
  return workout.exercises.reduce(
    (total, ex) => total + ex.sets.reduce((sum, s) => sum + setVolume(s), 0),
    0,
  )
}

export function workoutSets(workout: Workout, onlyCompleted = true): number {
  return workout.exercises.reduce(
    (n, ex) => n + ex.sets.filter((s) => (onlyCompleted ? s.completed : true)).length,
    0,
  )
}

export function workoutReps(workout: Workout): number {
  return workout.exercises.reduce(
    (n, ex) => n + ex.sets.reduce((s, set) => s + (set.completed ? (set.reps ?? 0) : 0), 0),
    0,
  )
}

export function workoutDurationSeconds(workout: Workout): number {
  const start = new Date(workout.startedAt).getTime()
  const end = workout.finishedAt ? new Date(workout.finishedAt).getTime() : Date.now()
  return Math.max(0, Math.round((end - start) / 1000))
}

export function workoutExerciseById(workout: Workout, workoutExerciseId: string) {
  return workout.exercises.find((e) => e.id === workoutExerciseId)
}

export function findExercise(exercises: Exercise[], id: string) {
  return exercises.find((e) => e.id === id)
}

export function exerciseName(exercises: Exercise[], id: string) {
  return exercises.find((e) => e.id === id)?.name ?? 'Exercice supprimé'
}

/** Répartition du volume par groupe musculaire principal. */
export function muscleBreakdown(
  workout: Workout,
  exercises: Exercise[],
): { muscle: string; volume: number; sets: number }[] {
  const map = new Map<string, { volume: number; sets: number }>()
  for (const we of workout.exercises) {
    const ex = findExercise(exercises, we.exerciseId)
    const muscle = ex?.primaryMuscles[0] ?? 'autre'
    const entry = map.get(muscle) ?? { volume: 0, sets: 0 }
    for (const s of we.sets) {
      if (!s.completed) continue
      entry.volume += setVolume(s)
      entry.sets += 1
    }
    map.set(muscle, entry)
  }
  return [...map.entries()]
    .map(([muscle, v]) => ({ muscle, ...v }))
    .sort((a, b) => b.sets - a.sets || b.volume - a.volume)
}

export function emptySet(type: WorkoutSet['type'] = 'normal'): WorkoutSet {
  return { id: uid('set'), type, completed: false }
}

/** Copie une série en gardant les valeurs mais en la marquant non validée. */
export function duplicateSet(set: WorkoutSet): WorkoutSet {
  return { id: uid('set'), type: set.type, weight: set.weight, reps: set.reps, duration: set.duration, distance: set.distance, rpe: set.rpe, completed: false }
}

export function blankWorkoutExercise(
  exerciseId: string,
  sets: WorkoutSet[],
  restSeconds: number,
): WorkoutExercise {
  return { id: uid('we'), exerciseId, sets, restSeconds, supersetId: null }
}

/* ------------------------------------------------------------------
   Historique & records
------------------------------------------------------------------ */

export interface ExerciseSession {
  workout: Workout
  workoutExercise: WorkoutExercise
  sets: WorkoutSet[]
}

/** Toutes les séances (terminées ou non) contenant l'exercice donné, plus récentes d'abord. */
export function getExerciseSessions(
  workouts: Workout[],
  exerciseId: string,
  opts: { includeActive?: boolean } = {},
): ExerciseSession[] {
  return workouts
    .filter((w) => (opts.includeActive ? true : w.status === 'completed'))
    .filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
    .map((w) => {
      const we = w.exercises.find((e) => e.exerciseId === exerciseId)!
      return { workout: w, workoutExercise: we, sets: we.sets.filter((s) => s.completed) }
    })
    .filter((s) => s.sets.length > 0 || opts.includeActive)
}

/** Exercices déjà utilisés dans au moins une séance, triés par fréquence. */
export function mostUsedExercises(workouts: Workout[], exercises: Exercise[], limit = 8) {
  const counts = new Map<string, number>()
  for (const w of workouts) {
    for (const we of w.exercises) {
      const hasCompleted = we.sets.some((s) => s.completed)
      if (!hasCompleted) continue
      counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ exercise: findExercise(exercises, id), count }))
    .filter((x): x is { exercise: Exercise; count: number } => Boolean(x.exercise))
    .slice(0, limit)
}

export function lastPerformance(
  workouts: Workout[],
  exerciseId: string,
  excludeWorkoutId?: string,
): ExerciseSession | undefined {
  return getExerciseSessions(
    workouts.filter((w) => w.id !== excludeWorkoutId),
    exerciseId,
  )[0]
}

export interface PersonalRecord {
  kind: 'weight' | 'e1rm' | 'reps' | 'volume' | 'duration' | 'distance'
  value: number
  set: WorkoutSet
  workout: Workout
}

export function getPersonalRecords(workouts: Workout[], exerciseId: string): PersonalRecord[] {
  const records: PersonalRecord[] = []
  let best = (kind: PersonalRecord['kind'], get: (s: WorkoutSet) => number | undefined) => {
    let found: PersonalRecord | undefined
    for (const w of workouts) {
      if (w.status !== 'completed') continue
      for (const we of w.exercises) {
        if (we.exerciseId !== exerciseId) continue
        for (const s of we.sets) {
          if (!s.completed) continue
          const v = get(s)
          if (v === undefined || v <= 0) continue
          if (!found || v > found.value) found = { kind, value: v, set: s, workout: w }
        }
      }
    }
    if (found) records.push(found)
  }
  best('weight', (s) => s.weight)
  best('e1rm', (s) => estimate1RM(s.weight, s.reps))
  best('reps', (s) => s.reps)
  best('volume', (s) => setVolume(s) || undefined)
  best('duration', (s) => s.duration)
  best('distance', (s) => s.distance)
  return records
}

export const RECORD_LABELS: Record<PersonalRecord['kind'], string> = {
  weight: 'Charge max',
  e1rm: '1RM estimé',
  reps: 'Reps max',
  volume: 'Meilleure série (volume)',
  duration: 'Durée max',
  distance: 'Distance max',
}

/** Records battus par une séance, comparés à l'historique antérieur. */
export function detectNewRecords(
  workout: Workout,
  previousWorkouts: Workout[],
  exercises: Exercise[],
): { exercise: Exercise; record: PersonalRecord; previousValue: number }[] {
  const out: { exercise: Exercise; record: PersonalRecord; previousValue: number }[] = []
  for (const we of workout.exercises) {
    const ex = findExercise(exercises, we.exerciseId)
    if (!ex) continue
    const prev = getPersonalRecords(previousWorkouts, we.exerciseId)
    const current = getPersonalRecords([workout], we.exerciseId)
    for (const rec of current) {
      const previous = prev.find((p) => p.kind === rec.kind)
      if (!previous || rec.value > previous.value + 1e-9) {
        out.push({ exercise: ex, record: rec, previousValue: previous?.value ?? 0 })
      }
    }
  }
  return out
}

export interface ExerciseProgressPoint {
  date: string
  label: string
  maxWeight: number
  e1rm: number
  volume: number
  reps: number
  sets: number
  duration?: number
  distance?: number
  bestSet: number
}

export function getExerciseProgress(
  workouts: Workout[],
  exerciseId: string,
): ExerciseProgressPoint[] {
  return getExerciseSessions(workouts, exerciseId)
    .slice()
    .reverse()
    .map(({ workout, sets }) => ({
      date: workout.startedAt,
      label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(
        new Date(workout.startedAt),
      ),
      maxWeight: Math.max(0, ...sets.map((s) => s.weight ?? 0)),
      e1rm: Math.max(0, ...sets.map((s) => estimate1RM(s.weight, s.reps))),
      volume: sets.reduce((n, s) => n + setVolume(s), 0),
      reps: sets.reduce((n, s) => n + (s.reps ?? 0), 0),
      sets: sets.length,
      duration: Math.max(0, ...sets.map((s) => s.duration ?? 0)) || undefined,
      distance: sets.reduce((n, s) => n + (s.distance ?? 0), 0) || undefined,
      bestSet: Math.max(0, ...sets.map((s) => s.weight ?? s.reps ?? 0)),
    }))
}

/* ------------------------------------------------------------------
   Statistiques globales
------------------------------------------------------------------ */

export function completedWorkouts(workouts: Workout[]) {
  return workouts.filter((w) => w.status === 'completed')
}

export function workoutsInRange(workouts: Workout[], from: Date, to: Date) {
  const a = +from
  const b = +to
  return completedWorkouts(workouts).filter((w) => {
    const t = +new Date(w.startedAt)
    return t >= a && t <= b
  })
}

export function weekStreak(workouts: Workout[], firstDay: 0 | 1 = 1): number {
  const weeks = new Set(completedWorkouts(workouts).map((w) => +startOfWeek(new Date(w.startedAt), firstDay)))
  let streak = 0
  let cursor = startOfWeek(new Date(), firstDay)
  // la semaine en cours compte si elle a au moins une séance
  if (!weeks.has(+cursor)) cursor = new Date(cursor.getTime() - 7 * 86400000)
  while (weeks.has(+cursor)) {
    streak += 1
    cursor = new Date(cursor.getTime() - 7 * 86400000)
  }
  return streak
}

export function dayStreak(workouts: Workout[]): number {
  const days = new Set(completedWorkouts(workouts).map((w) => toDateKey(w.startedAt)))
  let streak = 0
  let cursor = new Date()
  if (!days.has(toDateKey(cursor))) cursor = new Date(cursor.getTime() - 86400000)
  while (days.has(toDateKey(cursor))) {
    streak += 1
    cursor = new Date(cursor.getTime() - 86400000)
  }
  return streak
}

export function muscleVolume(
  workouts: Workout[],
  exercises: Exercise[],
): { muscle: MuscleGroup | string; sets: number; volume: number }[] {
  const map = new Map<string, { sets: number; volume: number }>()
  for (const w of workouts) {
    for (const we of w.exercises) {
      const ex = findExercise(exercises, we.exerciseId)
      if (!ex) continue
      for (const muscle of ex.primaryMuscles.length ? ex.primaryMuscles : ['autre']) {
        const entry = map.get(muscle) ?? { sets: 0, volume: 0 }
        for (const s of we.sets) {
          if (!s.completed) continue
          entry.sets += 1
          entry.volume += setVolume(s)
        }
        map.set(muscle, entry)
      }
    }
  }
  return [...map.entries()]
    .map(([muscle, v]) => ({ muscle, ...v }))
    .sort((a, b) => b.volume - a.volume || b.sets - a.sets)
}

export function weeklySeries(workouts: Workout[], weeks = 8, firstDay: 0 | 1 = 1) {
  const out: { label: string; volume: number; workouts: number; duration: number; sets: number }[] = []
  const thisWeek = startOfWeek(new Date(), firstDay)
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek.getTime() - i * 7 * 86400000)
    const end = new Date(start.getTime() + 7 * 86400000 - 1)
    const list = workoutsInRange(workouts, start, end)
    out.push({
      label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(start),
      volume: list.reduce((n, w) => n + workoutVolume(w), 0),
      workouts: list.length,
      duration: list.reduce((n, w) => n + workoutDurationSeconds(w), 0),
      sets: list.reduce((n, w) => n + workoutSets(w), 0),
    })
  }
  return out
}

/** Meilleure série d'un exercice dans une séance donnée. */
export function bestSetOf(we: WorkoutExercise, pick: (s: WorkoutSet) => number): WorkoutSet | undefined {
  let best: WorkoutSet | undefined
  for (const s of we.sets) {
    if (!s.completed) continue
    if (!best || pick(s) > pick(best)) best = s
  }
  return best
}