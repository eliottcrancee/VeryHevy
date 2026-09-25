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
  /** Dernière modification (synchro) ; absent = jamais modifié depuis la création. */
  updatedAt?: string
}

export type SetType = 'normal' | 'echauffement' | 'degressive' | 'echec'

export const SET_TYPE_META: Record<SetType, { label: string; short: string; color: string }> = {
  normal: { label: 'Normale', short: '', color: 'var(--muted)' },
  echauffement: { label: 'Échauffement', short: 'E', color: 'var(--warning)' },
  degressive: { label: 'Dégressive', short: 'D', color: 'var(--info)' },
  echec: { label: 'Échec', short: 'X', color: 'var(--danger)' },
}

/** Champs de données d'une série (tout ce que l'utilisateur peut saisir). */
export type SetDataField = 'weight' | 'reps' | 'duration' | 'distance' | 'rpe'

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
  /**
   * Champs déjà touchés par l'utilisateur dans cette séance. Les valeurs
   * pré-remplies (programme / dernière fois) non touchées s'affichent en
   * fantôme (grisé) jusqu'à leur première modification.
   */
  touched?: Partial<Record<SetDataField, boolean>>
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  /** Nom figé à l'ajout : garde la trace même si l'exercice est supprimé de la bibliothèque. */
  exerciseName?: string
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
  /** Nom figé à l'ajout : garde la trace même si l'exercice est supprimé de la bibliothèque. */
  exerciseName?: string
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

/** Trace d'une suppression pour la synchro (anti-résurrection). */
export interface SyncTombstone {
  kind: 'workout' | 'routine' | 'exercise'
  id: string
  deletedAt: string
}

export interface SyncSettings {
  /** Conservé pour migration des anciennes sauvegardes (serveur maison supprimé). */
  url: string
  /** Conservé pour migration des anciennes sauvegardes. */
  token: string
  enabled: boolean
}

export interface Settings {
  unit: 'kg' | 'lb'
  distanceUnit: 'km' | 'mi'
  theme: 'dark' | 'light' | 'system'
  accent: string
  defaultRestSeconds: number
  autoStartRest: boolean
  restSoundEnabled: boolean
  /** Notification système (téléphone/PC) à la fin du chrono de repos. */
  restNotifyEnabled: boolean
  /** Vibration du téléphone à la fin du chrono de repos (mobile uniquement). */
  restVibrateEnabled: boolean
  keepAwake: boolean
  weeklyGoal: number
  defaultSets: number
  showRpe: boolean
  firstDayOfWeek: 0 | 1
  /** Synchro cloud Supabase (le serveur maison est supprimé). Conservé pour migration. */
  sync: SyncSettings
  /** Visibilité par défaut des nouveaux posts : followers (défaut validé). */
  defaultPostVisibility: PostVisibility
  /** Langue de l'interface (contenus utilisateurs jamais traduits). */
  lang: 'fr' | 'en'
  /** Horodatage serveur de la dernière synchro réussie (ISO). */
  lastSyncAt: string | null
  /** Dernière erreur de synchro (affichage Réglages). */
  lastSyncError?: string
  /**
   * Début de l'« arc » en cours (ISO) : les records personnels ne comptent
   * que les séances postérieures. Null = tous l'historique.
   */
  recordsSince?: string | null
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
  /** Traces de suppressions en attente de synchro (anti-résurrection). */
  syncDeleted: SyncTombstone[]
}

/* ------------------------------------------------------------------
   Social (follow + posts + carte)
------------------------------------------------------------------ */

export type PostVisibility = 'public' | 'followers' | 'private'
/** invite = privée sur invitation · open = sur proposition (hôte anonyme) · public = demande + validation */
export type SessionVisibility = 'invite' | 'open' | 'public'
export type ProfileVisibility = 'private' | 'followers' | 'public'

export interface SocialProfile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio?: string | null
  city?: string | null
  visibility?: string | null
  followers_count: number
  following_count: number
  updated_at?: string
}

export interface Follow {
  follower: string
  followed: string
  created_at: string
}

/** Demande d'ami (compte privé). */
export interface FollowRequest {
  requester: string
  target: string
  created_at: string
  profile?: SocialProfile | null
}

/** Résumé figé d'une séance au moment de sa publication (post). */
export interface WorkoutSetSummary {
  reps: number | null
  weight: number | null
  duration: number | null
}

export interface WorkoutSnapshot {
  name: string
  sets: number
  volume: number
  seconds: number
  exercises: { exerciseId?: string; name: string; sets: WorkoutSetSummary[] }[]
}

/** Notification in-app (cloche). Types : follow_request, follow_accepted,
 *  new_follower, session_request, session_accepted. */
export interface AppNotification {
  id: string
  user_id: string
  type: string
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface Post {
  id: string
  user_id: string
  workout_id?: string | null
  /** Résumé figé (nouveaux posts) : affiché inline sans lecture inter-comptes. */
  workout_snapshot?: WorkoutSnapshot | null
  photo_url?: string | null
  caption: string
  visibility: PostVisibility
  likes_count: number
  comments_count: number
  created_at: string
  author?: SocialProfile | null
  liked_by_me?: boolean
}

export interface PostComment {
  id: string
  post_id: string
  user_id: string
  text: string
  created_at: string
  author?: SocialProfile | null
}

export interface SportSession {
  id: string
  host: string
  title: string
  gym_name: string
  address_text: string
  lat: number
  lng: number
  starts_at: string
  spots_total: number
  spots_taken: number
  level: string
  description: string
  visibility: SessionVisibility
  created_at: string
  joined_by_me?: boolean
  host_profile?: SocialProfile | null
}

/** Valide un pseudo : 3-20 minuscules/chiffres/._ */
export function isValidUsername(v: string): boolean {
  return /^[a-z0-9_.]{3,20}$/.test(v.trim().toLowerCase())
}

/** Normalise un pseudo (minuscules, espaces → .). */
export function normalizeUsername(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9_.]/g, '').slice(0, 20)
}