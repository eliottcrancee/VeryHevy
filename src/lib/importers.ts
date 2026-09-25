import type { Exercise, ExerciseCategory, ExerciseLevel, TrackingType } from '@/types'
import { slug, SEED_EXERCISES } from './seed'
import { uid } from './utils'
import { t } from './i18n'

/* ------------------------------------------------------------------
   Import de la base free-exercise-db (876 exercices + photos)
   https://github.com/yuhonas/free-exercise-db  (domaine public)
------------------------------------------------------------------ */

export const FREE_EXERCISE_DB_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const FREE_EXERCISE_IMG_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

interface FreeDbExercise {
  id: string
  name: string
  force?: string | null
  level?: string | null
  mechanic?: string | null
  equipment?: string | null
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
  instructions?: string[]
  category?: string
  images?: string[]
}

const MUSCLE_MAP: Record<string, string> = {
  abdominals: 'abdominaux',
  hamstrings: 'ischio-jambiers',
  adductors: 'adducteurs',
  quadriceps: 'quadriceps',
  biceps: 'biceps',
  shoulders: 'épaules',
  chest: 'pectoraux',
  'middle back': 'dos',
  calves: 'mollets',
  glutes: 'fessiers',
  'lower back': 'lombaires',
  lats: 'lats',
  triceps: 'triceps',
  traps: 'trapèzes',
  forearms: 'avant-bras',
  neck: 'cou',
  abductors: 'abducteurs',
}

const EQUIPMENT_MAP: Record<string, string> = {
  'body only': 'poids du corps',
  machine: 'machine',
  other: 'autre',
  'foam roll': 'rouleau de mousse',
  kettlebells: 'kettlebell',
  dumbbell: 'haltères',
  cable: 'poulie',
  barbell: 'barre',
  bands: 'élastiques',
  'medicine ball': 'medicine-ball',
  'exercise ball': 'swiss-ball',
  'e-z curl bar': 'barre EZ',
}

const CATEGORY_MAP: Record<string, ExerciseCategory> = {
  strength: 'muscu',
  cardio: 'cardio',
  stretching: 'etirement',
  plyometrics: 'plyometrie',
  strongman: 'strongman',
  powerlifting: 'muscu',
  'olympic weightlifting': 'halterophilie',
}

const LEVEL_MAP: Record<string, ExerciseLevel> = {
  beginner: 'débutant',
  intermediate: 'intermédiaire',
  expert: 'avancé',
}

const DURATION_RE = /\b(plank|hold|hang|stretch|wall sit|bridge|superman|dead hang|isometric|pose)\b/i
const CARDIO_DISTANCE_RE = /\b(run|jog|walk|cycle|bike|swim|row|sprint|ski|skate|ellip)/i

function inferTracking(raw: FreeDbExercise): TrackingType {
  const text = `${raw.name} ${raw.category ?? ''}`
  const isBodyweight = !raw.equipment || raw.equipment === 'body only'
  if (raw.category === 'cardio') {
    return CARDIO_DISTANCE_RE.test(text) ? 'distance_duration' : 'duration'
  }
  if (raw.category === 'stretching') return 'duration'
  if (DURATION_RE.test(raw.name)) return isBodyweight ? 'duration' : 'weight_duration'
  if (isBodyweight) return 'bodyweight_reps'
  return 'weight_reps'
}

export function fromFreeDbExercise(raw: FreeDbExercise): Exercise {
  const images = (raw.images ?? []).map((p) => `${FREE_EXERCISE_IMG_BASE}${p}`)
  return {
    id: `fedb_${slug(raw.id || raw.name)}`,
    name: raw.name,
    altName: raw.name,
    category: CATEGORY_MAP[raw.category ?? ''] ?? 'autre',
    tracking: inferTracking(raw),
    primaryMuscles: (raw.primaryMuscles ?? []).map((m) => MUSCLE_MAP[m] ?? m),
    secondaryMuscles: (raw.secondaryMuscles ?? []).map((m) => MUSCLE_MAP[m] ?? m),
    equipment: EQUIPMENT_MAP[raw.equipment ?? ''] ?? 'autre',
    level: LEVEL_MAP[raw.level ?? ''] ?? 'intermédiaire',
    instructions: raw.instructions ?? [],
    images,
    isCustom: false,
    isFavorite: false,
    source: 'free-exercise-db',
    createdAt: new Date().toISOString(),
  }
}

export async function fetchFreeExerciseDb(url = FREE_EXERCISE_DB_URL): Promise<Exercise[]> {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(t('lib.downloadError', { status: res.status }))
  const json: unknown = await res.json()
  if (!Array.isArray(json)) throw new Error(t('lib.badFormat'))
  return (json as FreeDbExercise[]).map(fromFreeDbExercise)
}

/* ------------------------------------------------------------------
   Import générique (JSON fourni par l'utilisateur)
------------------------------------------------------------------ */

export function parseExternalExercises(json: unknown): Exercise[] {
  if (!Array.isArray(json)) throw new Error(t('lib.jsonArray'))
  const out: Exercise[] = []
  for (const item of json as Record<string, unknown>[]) {
    if (!item || typeof item !== 'object') continue
    const name = String(item.name ?? '').trim()
    if (!name) continue
    if (item.tracking && item.primaryMuscles) {
      // déjà au format VeryHevy
      out.push({
        id: String(item.id ?? `imp_${slug(name)}`),
        name,
        altName: item.altName ? String(item.altName) : undefined,
        category: (item.category as ExerciseCategory) ?? 'autre',
        tracking: item.tracking as TrackingType,
        primaryMuscles: (item.primaryMuscles as string[]) ?? [],
        secondaryMuscles: (item.secondaryMuscles as string[]) ?? [],
        equipment: String(item.equipment ?? 'autre'),
        level: (item.level as ExerciseLevel) ?? 'intermédiaire',
        instructions: (item.instructions as string[]) ?? [],
        images: (item.images as string[]) ?? [],
        tips: item.tips ? String(item.tips) : undefined,
        isCustom: true,
        isFavorite: false,
        source: 'import',
        createdAt: new Date().toISOString(),
      })
    } else {
      out.push({ ...fromFreeDbExercise(item as unknown as FreeDbExercise), isCustom: true, source: 'import' })
    }
  }
  return out
}

/** Fusionne sans écraser l'existant (par nom, insensible à la casse). */
export function mergeExercises(existing: Exercise[], incoming: Exercise[]) {
  const usedIds = new Set(existing.map((e) => e.id))
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))
  let added = 0
  let updated = 0
  let skipped = 0
  const result = [...existing]
  for (const ex of incoming) {
    const dup = byName.get(ex.name.toLowerCase())
    if (dup) {
      if (dup.images.length === 0 && ex.images.length > 0) {
        result[result.indexOf(dup)] = { ...dup, images: ex.images, instructions: dup.instructions.length ? dup.instructions : ex.instructions, updatedAt: new Date().toISOString() }
        updated += 1
      } else {
        skipped += 1
      }
      continue
    }
    const id = usedIds.has(ex.id) ? uid('ex') : ex.id
    usedIds.add(id)
    byName.set(ex.name.toLowerCase(), { ...ex, id })
    result.push({ ...ex, id })
    added += 1
  }
  return { exercises: result, added, updated, skipped }
}

export const BUILTIN_EXERCISES = SEED_EXERCISES