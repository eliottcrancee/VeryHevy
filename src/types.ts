/* ------------------------------------------------------------------
   VeryHevy — domaine métier
------------------------------------------------------------------ */

/** Champs de saisie disponibles pour une série. */
export type SetField = 'weight' | 'reps' | 'duration' | 'distance'

/** Type de suivi d'un exercice = combinaison de champs. */
export type TrackingType =
  | 'weight_reps' // musculation classique  → poids × reps
  | 'bodyweight_reps' // poids du corps + reps (lest optionnel)
  | 'weight_duration' // poids + temps (ex : gainage lesté)
  | 'reps_duration' // reps + temps
  | 'distance_duration' // cardio : distance + durée
  | 'duration' // temps seul (gainage, étirements)
  | 'reps_only' // reps seules (burpees, tractions)
  | 'weight_distance' // ex : farmer's walk lesté

export const TRACKING_TYPES: Record<TrackingType, { label: string; fields: SetField[] }> = {
  weight_reps: { label: 'Poids & reps', fields: ['weight', 'reps'] },
  bodyweight_reps: { label: 'Poids du corps & reps', fields: ['weight', 'reps'] },
  weight_duration: { label: 'Poids & durée', fields: ['weight', 'duration'] },
  reps_duration: { label: 'Reps & durée', fields: ['reps', 'duration'] },
  distance_duration: { label: 'Distance & durée', fields: ['distance', 'duration'] },
  duration: { label: 'Durée', fields: ['duration'] },
  reps_only: { label: 'Reps', fields: ['reps'] },
  weight_distance: { label: 'Poids & distance', fields: ['weight', 'distance'] },
}

export type ExerciseCategory =
  | 'muscu'
  | 'cardio'
  | 'mobilite'
  | 'plyometrie'
  | 'halterophilie'
  | 'strongman'
  | 'etirement'
  | 'autre'

export const CATEGORY_META: Record<
  ExerciseCategory,
  { label: string; emoji: string; color: string }
> = {
  muscu: { label: 'Musculation', emoji: '🏋️', color: '#4f83ff' },
  cardio: { label: 'Cardio', emoji: '🏃', color: '#ea580c' },
  mobilite: { label: 'Mobilité', emoji: '🧘', color: '#0d9488' },
  plyometrie: { label: 'Pliométrie', emoji: '⚡', color: '#b45309' },
  halterophilie: { label: 'Haltérophilie', emoji: '🥇', color: '#9333ea' },
  strongman: { label: 'Strongman', emoji: '🪨', color: '#78716c' },
  etirement: { label: 'Étirement', emoji: '🤸', color: '#16a34a' },
  autre: { label: 'Autre', emoji: '🎯', color: '#6b7280' },
}

export type MuscleGroup =
  | 'pectoraux'
  | 'dos'
  | 'lats'
  | 'lombaires'
  | 'trapèzes'
  | 'épaules'
  | 'biceps'
  | 'triceps'
  | 'avant-bras'
  | 'abdominaux'
  | 'obliques'
  | 'quadriceps'
  | 'ischio-jambiers'
  | 'fessiers'
  | 'adducteurs'
  | 'abducteurs'
  | 'mollets'
  | 'cou'
  | 'corps entier'
  | 'cardio'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'pectoraux',
  'dos',
  'lats',
  'lombaires',
  'trapèzes',
  'épaules',
  'biceps',
  'triceps',
  'avant-bras',
  'abdominaux',
  'obliques',
  'quadriceps',
  'ischio-jambiers',
  'fessiers',
  'adducteurs',
  'abducteurs',
  'mollets',
  'cou',
  'corps entier',
  'cardio',
]

export type Equipment =
  | 'barre'
  | 'haltères'
  | 'machine'
  | 'poulie'
  | 'kettlebell'
  | 'barre EZ'
  | 'élastiques'
  | 'poids du corps'
  | 'medicine-ball'
  | 'swiss-ball'
  | 'rouleau de mousse'
  | 'autre'

export const EQUIPMENT_LIST: Equipment[] = [
  'barre',
  'haltères',
  'machine',
  'poulie',
  'kettlebell',
  'barre EZ',
  'élastiques',
  'poids du corps',
  'medicine-ball',
  'swiss-ball',
  'rouleau de mousse',
  'autre',
]

export type ExerciseLevel = 'débutant' | 'intermédiaire' | 'avancé'

export interface Exercise {
  id: string
  name: string
  /** Nom alternatif / anglais, utilisé pour la recherche. */
  altName?: string
  category: ExerciseCategory
  tracking: TrackingType
  primaryMuscles: string[]
  secondaryMuscles: string[]
  equipment: string
  level: ExerciseLevel
  instructions: string[]
  /** URLs d'illustrations (distantes ou data-URL). */
  images: string[]
  tips?: string
  isCustom: boolean
  isFavorite: boolean
  /** Source d'import (ex. free-exercise-db). */
  source?: string
  createdAt: string
}

export type SetType = 'normal' | 'echauffement' | 'degressive' | 'echec'

export const SET_TYPE_META: Record<SetType, { label: string; short: string; color: string }> = {
  normal: { label: 'Normale', short: '', color: 'var(--muted)' },
  echauffement: { label: 'Échauffement', short: 'E', color: 'var(--warning)' },
  degressive: { label: 'Dégressive', short: 'D', color: 'var(--info)' },
  echec: { label: 'Échec', short: 'X', color: 'var(--danger)' },
}

export interface WorkoutSet {
  id: string
  type: SetType
  weight?: number
  reps?: number
  /** secondes */
  duration?: number
  /** mètres */
  distance?: number
  rpe?: number
  completed: boolean
  /** repos réellement observé après cette série (secondes) */
  restTaken?: number
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  sets: WorkoutSet[]
  notes?: string
  /** identifiant de superset (les exercices partageant la valeur s'enchaînent) */
  supersetId?: string | null
  restSeconds: number
}

export type WorkoutStatus = 'active' | 'completed'

export interface Workout {
  id: string
  name: string
  startedAt: string
  finishedAt?: string
  status: WorkoutStatus
  exercises: WorkoutExercise[]
  notes?: string
  /** 1 → 5 */
  rating?: number
  templateId?: string
  templateName?: string
  bodyweightKg?: number
  /** durée totale du repos cumulé (secondes) */
  restSeconds?: number
  createdAt: string
  updatedAt: string
}

export interface RoutineSetTemplate {
  type: SetType
  weight?: number
  reps?: number
  duration?: number
  distance?: number
}

export interface RoutineExercise {
  id: string
  exerciseId: string
  sets: RoutineSetTemplate[]
  restSeconds: number
  notes?: string
  supersetId?: string | null
}

export interface Routine {
  id: string
  name: string
  description?: string
  folder?: string
  color: string
  exercises: RoutineExercise[]
  timesPerformed: number
  lastPerformedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Settings {
  unit: 'kg' | 'lb'
  distanceUnit: 'km' | 'mi'
  theme: 'dark' | 'light' | 'system'
  accent: string
  defaultRestSeconds: number
  autoStartRest: boolean
  restSoundEnabled: boolean
  keepAwake: boolean
  weeklyGoal: number
  defaultSets: number
  showRpe: boolean
  firstDayOfWeek: 0 | 1
}

export interface RestTimerState {
  endsAt: number | null
  totalSeconds: number
  label?: string
  exerciseId?: string
  setId?: string
  /** Secondes restantes figées quand le chrono est en pause (null = en cours). */
  pausedSeconds?: number | null
}

export interface AppData {
  exercises: Exercise[]
  workouts: Workout[]
  routines: Routine[]
  settings: Settings
  activeWorkoutId: string | null
  version: number
}