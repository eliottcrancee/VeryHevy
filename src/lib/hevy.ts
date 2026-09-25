/**
 * Import depuis l'export CSV de Hevy (H-E-V-Y).
 * Dans Hevy : Profil → Réglages → Exporter les données (CSV reçu par email).
 *
 * Format attendu (une ligne par série) :
 * title,start_time,end_time,description,exercise_title,superset_id,
 * exercise_notes,set_index,set_type,weight_kg,reps,distance_km,
 * duration_seconds,rpe
 *
 * Pur (sans dépendance au store) pour rester testable.
 */
import type {
  Exercise,
  ExerciseCategory,
  SetType,
  TrackingType,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/types'

export interface HevyImportResult {
  workouts: Workout[]
  newExercises: Exercise[]
}

/* ------------------------------ CSV ------------------------------ */

/** Parseur RFC4180 minimal (guillemets, virgules, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const s = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      field = ''
      if (row.length > 1 || row[0].trim() !== '') rows.push(row)
      row = []
    } else if (c === '\r') {
      /* ignoré (géré par \n) */
    } else {
      field += c
    }
  }
  row.push(field)
  if (row.length > 1 || row[0].trim() !== '') rows.push(row)
  return rows
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  janv: 0, fevr: 1, févr: 1, avr: 3, mai: 4, juin: 5,
  juil: 6, aout: 7, août: 7, octo: 9, déc: 11,
}

/** "15 Oct 2024, 18:30" / "16 sept. 2026, 18:55" (Hevy EN/FR) → ISO. */
export function parseHevyDate(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const m = t.match(/^(\d{1,2})\s+([A-Za-zéû]+)\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month !== undefined) {
      const d = new Date(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))
      if (!Number.isNaN(d.getTime())) return d.toISOString()
    }
  }
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/* --------------------------- correspondance --------------------------- */

export function normalizeExerciseName(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hevySetType(v: string): SetType {
  switch (v.trim().toLowerCase()) {
    case 'warmup':
    case 'warm_up':
      return 'echauffement'
    case 'drop':
    case 'dropset':
      return 'degressive'
    case 'failure':
      return 'echec'
    default:
      return 'normal'
  }
}

const CARDIO_HINTS = [
  'run', 'running', 'course', 'courir', 'bike', 'cycling', 'velo', 'vélo',
  'swim', 'nage', 'natation', 'row', 'rameur', 'rowing', 'walk', 'marche',
  'elliptical', 'elliptique', 'tapis', 'treadmill', 'stair', 'escalier',
  'cardio', 'skipping', 'corde',
]
const STRETCH_HINTS = ['stretch', 'etirement', 'étirement', 'yoga', 'mobility', 'mobilite', 'mobilité']

function guessCategory(name: string): ExerciseCategory {
  const n = normalizeExerciseName(name)
  if (CARDIO_HINTS.some((h) => n.includes(h))) return 'cardio'
  if (STRETCH_HINTS.some((h) => n.includes(h))) return 'etirement'
  return 'muscu'
}

interface SetDraft {
  weight?: number
  reps?: number
  distance?: number
  duration?: number
  rpe?: number
  type: SetType
}

function guessTracking(sets: SetDraft[]): TrackingType {
  const has = (k: 'weight' | 'reps' | 'distance' | 'duration') => sets.some((s) => (s[k] ?? 0) > 0)
  if (has('distance')) return has('duration') ? 'distance_duration' : 'weight_distance'
  if (has('duration')) return has('weight') ? 'weight_duration' : 'duration'
  if (has('weight')) return 'weight_reps'
  if (has('reps')) {
    // Poids du corps si aucun lest sur aucune série.
    return 'bodyweight_reps'
  }
  return 'reps_only'
}

/* ------------------------------ import ------------------------------ */

let counter = 0
function nid(prefix: string): string {
  counter += 1
  return `${prefix}_hevy_${Date.now().toString(36)}_${counter}`
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined
  const n = Number(v.trim().replace(',', '.'))
  return v.trim() === '' || Number.isNaN(n) ? undefined : n
};

export function parseHevyCsv(
  text: string,
  library: Pick<Exercise, 'id' | 'name' | 'altName'>[],
  defaultRestSeconds = 90,
): HevyImportResult {
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error('CSV vide ou illisible')
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const need = ['title', 'start_time', 'exercise_title', 'set_index', 'set_type']
  for (const col of need) {
    if (!header.includes(col)) {
      throw new Error(`Colonne manquante : ${col}. Ce n'est pas un export Hevy (une ligne par série).`)
    }
  }
  const col = (name: string): number => header.indexOf(name)
  const cTitle = col('title')
  const cStart = col('start_time')
  const cEnd = col('end_time')
  const cDesc = col('description')
  const cEx = col('exercise_title')
  const cSup = col('superset_id')
  const cSetIdx = col('set_index')
  const cSetType = col('set_type')
  const cW = col('weight_kg')
  const cReps = col('reps')
  const cDist = col('distance_km')
  const cDur = col('duration_seconds')
  const cRpe = col('rpe')

  interface ExGroup {
    name: string
    superset: string
    order: number
    sets: { idx: number; draft: SetDraft }[]
  }
  interface WoGroup {
    title: string
    start: string
    end: string
    desc: string
    order: number
    exos: Map<string, ExGroup>
  }
  const groups = new Map<string, WoGroup>()
  let order = 0

  for (const r of rows.slice(1)) {
    const title = (r[cTitle] ?? '').trim() || 'Séance Hevy'
    const start = parseHevyDate(r[cStart] ?? '')
    if (!start) continue
    const key = `${title}|||${start}`
    let g = groups.get(key)
    if (!g) {
      g = {
        title,
        start,
        end: parseHevyDate(r[cEnd] ?? '') ?? start,
        desc: (cDesc >= 0 ? (r[cDesc] ?? '') : '').trim(),
        order: order++,
        exos: new Map(),
      }
      groups.set(key, g)
    }
    const exName = (r[cEx] ?? '').trim()
    if (!exName) continue
    const exKey = normalizeExerciseName(exName)
    let ex = g.exos.get(exKey)
    if (!ex) {
      ex = { name: exName, superset: (r[cSup] ?? '').trim(), order: g.exos.size, sets: [] }
      g.exos.set(exKey, ex)
    }
    ex.sets.push({
      idx: Number(r[cSetIdx] ?? 0) || 0,
      draft: {
        weight: cW >= 0 ? num(r[cW]) : undefined,
        reps: cReps >= 0 ? num(r[cReps]) : undefined,
        // Hevy exporte des km : on stocke des mètres comme le reste de l'app.
        distance: cDist >= 0 && num(r[cDist]) !== undefined ? Math.round((num(r[cDist]) as number) * 1000) : undefined,
        duration: cDur >= 0 ? num(r[cDur]) : undefined,
        rpe: cRpe >= 0 ? num(r[cRpe]) : undefined,
        type: hevySetType(r[cSetType] ?? ''),
      },
    })
  }

  if (!groups.size) throw new Error('Aucune séance trouvée dans ce fichier')

  const libByName = new Map<string, Pick<Exercise, 'id' | 'name' | 'altName'>>()
  for (const e of library) {
    libByName.set(normalizeExerciseName(e.name), e)
    if (e.altName) libByName.set(normalizeExerciseName(e.altName), e)
  }

  const now = new Date().toISOString()
  const newExercises: Exercise[] = []
  const newByName = new Map<string, Exercise>()
  const workouts: Workout[] = []
  const sorted = [...groups.values()].sort((a, b) => a.order - b.order)

  for (const g of sorted) {
    const wExercises: WorkoutExercise[] = []
    const exos = [...g.exos.values()].sort((a, b) => a.order - b.order)
    for (const ex of exos) {
      const key = normalizeExerciseName(ex.name)
      let lib = libByName.get(key) ?? newByName.get(key)
      if (!lib) {
        const drafts = ex.sets.map((s) => s.draft)
        const created: Exercise = {
          id: nid('ex'),
          name: ex.name,
          category: guessCategory(ex.name),
          tracking: guessTracking(drafts),
          primaryMuscles: [],
          secondaryMuscles: [],
          equipment: 'autre',
          level: 'débutant',
          instructions: [],
          images: [],
          isCustom: true,
          isFavorite: false,
          source: 'hevy',
          createdAt: now,
          updatedAt: now,
        }
        newByName.set(key, created)
        newExercises.push(created)
        lib = created
      }
      const sets: WorkoutSet[] = ex.sets
        .slice()
        .sort((a, b) => a.idx - b.idx)
        .map((s) => ({
          id: nid('se'),
          type: s.draft.type,
          weight: s.draft.weight,
          reps: s.draft.reps,
          distance: s.draft.distance,
          duration: s.draft.duration,
          rpe: s.draft.rpe,
          completed: true,
        }))
      wExercises.push({
        id: nid('we'),
        exerciseId: lib.id,
        exerciseName: ex.name,
        sets,
        restSeconds: defaultRestSeconds,
        supersetId: ex.superset || null,
      })
    }
    workouts.push({
      id: nid('wo'),
      name: g.title,
      startedAt: g.start,
      finishedAt: g.end,
      status: 'completed',
      exercises: wExercises,
      notes: g.desc || undefined,
      createdAt: now,
      updatedAt: now,
    })
  }

  return { workouts, newExercises }
}
