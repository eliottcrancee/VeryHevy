import type {
  Exercise,
  ExerciseCategory,
  ExerciseLevel,
  Routine,
  RoutineSetTemplate,
  TrackingType,
} from '@/types'
import { uid } from '@/lib/utils'

/* ------------------------------------------------------------------
   Base d'exercices embarquée (français, ~150 mouvements)
   La base complète (876 exercices anglais + photos) est importable
   depuis l'écran Exercices → « Importer la base complète ».
------------------------------------------------------------------ */

interface SeedInput {
  name: string
  category: ExerciseCategory
  tracking: TrackingType
  primary: string[]
  equipment: string
  secondary?: string[]
  level?: ExerciseLevel
  altName?: string
  tips?: string
  instructions?: string[]
  images?: string[]
}

function s(i: SeedInput): Exercise {
  return {
    id: `ex_${slug(i.name)}`,
    name: i.name,
    altName: i.altName,
    category: i.category,
    tracking: i.tracking,
    primaryMuscles: i.primary,
    secondaryMuscles: i.secondary ?? [],
    equipment: i.equipment,
    level: i.level ?? 'intermédiaire',
    instructions: i.instructions ?? [],
    images: i.images ?? [],
    tips: i.tips,
    isCustom: false,
    isFavorite: false,
    source: 'veryhevy',
    createdAt: new Date(0).toISOString(),
  }
}

export function slug(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

const BB = 'barre'
const DB = 'haltères'

export const SEED_EXERCISES: Exercise[] = [
  /* ----------------------------- PECTORAUX ----------------------------- */
  s({
    name: 'Développé couché',
    altName: 'Bench Press',
    category: 'muscu',
    tracking: 'weight_reps',
    primary: ['pectoraux'],
    secondary: ['triceps', 'épaules'],
    equipment: BB,
    level: 'intermédiaire',
    tips: 'Omoplates serrées, coudes à ~45°, barre au niveau des tétons.',
    instructions: [
      'Allongez-vous sur le banc, pieds à plat au sol, omoplates serrées.',
      'Saisissez la barre légèrement plus large que les épaules.',
      'Descendez la barre de façon contrôlée jusqu’à la poitrine.',
      'Poussez en gardant les coudes à environ 45° du buste.',
    ],
  }),
  s({ name: 'Développé couché haltères', altName: 'Dumbbell Bench Press', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['triceps', 'épaules'], equipment: DB, level: 'débutant' }),
  s({ name: 'Développé incliné barre', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['épaules', 'triceps'], equipment: BB, level: 'intermédiaire' }),
  s({ name: 'Développé incliné haltères', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['épaules', 'triceps'], equipment: DB, level: 'débutant' }),
  s({ name: 'Développé décliné barre', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['triceps'], equipment: BB }),
  s({ name: 'Développé convergente machine', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['triceps', 'épaules'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Écarté couché haltères', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], equipment: DB, level: 'débutant' }),
  s({ name: 'Écarté incliné haltères', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], equipment: DB }),
  s({ name: 'Écarté à la poulie vis-à-vis', altName: 'Cable Fly', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], equipment: 'poulie' }),
  s({ name: 'Pec-deck', altName: 'Butterfly', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Pompes', altName: 'Push-up', category: 'muscu', tracking: 'bodyweight_reps', primary: ['pectoraux'], secondary: ['triceps', 'épaules', 'abdominaux'], equipment: 'poids du corps', level: 'débutant', tips: 'Corps gainé, coudes rentrés à 45°.' }),
  s({ name: 'Pompes lestées', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['triceps', 'abdominaux'], equipment: 'poids du corps', level: 'avancé' }),
  s({ name: 'Dips', category: 'muscu', tracking: 'bodyweight_reps', primary: ['pectoraux'], secondary: ['triceps', 'épaules'], equipment: 'poids du corps', level: 'intermédiaire', tips: 'Buste penché en avant = pectoraux, buste droit = triceps.' }),
  s({ name: 'Dips lestées', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['triceps'], equipment: 'poids du corps', level: 'avancé' }),
  s({ name: 'Pull-over haltère', category: 'muscu', tracking: 'weight_reps', primary: ['pectoraux'], secondary: ['lats', 'triceps'], equipment: DB }),

  /* -------------------------------- DOS -------------------------------- */
  s({ name: 'Tractions pronation', altName: 'Pull-up', category: 'muscu', tracking: 'bodyweight_reps', primary: ['lats'], secondary: ['biceps', 'dos'], equipment: 'poids du corps', level: 'intermédiaire', tips: 'Tirez les coudes vers le bas, menton au-dessus de la barre.' }),
  s({ name: 'Tractions supination', altName: 'Chin-up', category: 'muscu', tracking: 'bodyweight_reps', primary: ['lats'], secondary: ['biceps'], equipment: 'poids du corps' }),
  s({ name: 'Tractions prise neutre', category: 'muscu', tracking: 'bodyweight_reps', primary: ['lats'], secondary: ['biceps', 'dos'], equipment: 'poids du corps' }),
  s({ name: 'Tractions lestées', category: 'muscu', tracking: 'weight_reps', primary: ['lats'], secondary: ['biceps'], equipment: 'poids du corps', level: 'avancé' }),
  s({ name: 'Tirage vertical poulie', altName: 'Lat Pulldown', category: 'muscu', tracking: 'weight_reps', primary: ['lats'], secondary: ['biceps'], equipment: 'poulie', level: 'débutant' }),
  s({ name: 'Tirage vertical prise serrée', category: 'muscu', tracking: 'weight_reps', primary: ['lats'], secondary: ['biceps', 'dos'], equipment: 'poulie' }),
  s({ name: 'Rowing barre', altName: 'Barbell Row', category: 'muscu', tracking: 'weight_reps', primary: ['dos'], secondary: ['lats', 'biceps', 'lombaires'], equipment: BB, tips: 'Buste à 45°, dos neutre, tirez vers le nombril.' }),
  s({ name: 'Rowing haltère unilatéral', category: 'muscu', tracking: 'weight_reps', primary: ['lats'], secondary: ['dos', 'biceps'], equipment: DB, level: 'débutant' }),
  s({ name: 'Rowing T-bar', category: 'muscu', tracking: 'weight_reps', primary: ['dos'], secondary: ['lats', 'biceps'], equipment: BB }),
  s({ name: 'Rowing poulie basse', altName: 'Seated Cable Row', category: 'muscu', tracking: 'weight_reps', primary: ['dos'], secondary: ['lats', 'biceps'], equipment: 'poulie', level: 'débutant' }),
  s({ name: 'Tirage horizontal machine', category: 'muscu', tracking: 'weight_reps', primary: ['dos'], secondary: ['lats', 'biceps'], equipment: 'machine' }),
  s({ name: 'Shrugs barre', altName: 'Haussements d’épaules', category: 'muscu', tracking: 'weight_reps', primary: ['trapèzes'], equipment: BB }),
  s({ name: 'Shrugs haltères', category: 'muscu', tracking: 'weight_reps', primary: ['trapèzes'], equipment: DB }),
  s({ name: 'Face pull', category: 'muscu', tracking: 'weight_reps', primary: ['trapèzes'], secondary: ['épaules'], equipment: 'poulie', tips: 'Idéal en prévention d’épaule : tirez vers le visage, coudes hauts.' }),
  s({ name: 'Soulevé de terre', altName: 'Deadlift', category: 'muscu', tracking: 'weight_reps', primary: ['dos'], secondary: ['lombaires', 'fessiers', 'ischio-jambiers', 'trapèzes'], equipment: BB, level: 'avancé', instructions: ['Pieds écartés largeur de bassin, barre au-dessus du milieu du pied.', 'Attrapez la barre, dos neutre, poitrine sortie.', 'Poussez dans le sol et montez en gardant la barre proche du corps.', 'Verrouillez hanches et genoux, puis redescendez avec contrôle.'] }),
  s({ name: 'Soulevé de terre roumain', altName: 'RDL', category: 'muscu', tracking: 'weight_reps', primary: ['ischio-jambiers'], secondary: ['fessiers', 'lombaires'], equipment: BB, tips: 'Hanches en arrière, jambes presque tendues, dos neutre.' }),
  s({ name: 'Soulevé de terre sumo', category: 'muscu', tracking: 'weight_reps', primary: ['fessiers'], secondary: ['adducteurs', 'lombaires'], equipment: BB }),
  s({ name: 'Rack pull', category: 'muscu', tracking: 'weight_reps', primary: ['dos'], secondary: ['trapèzes', 'lombaires'], equipment: BB }),
  s({ name: 'Good morning', category: 'muscu', tracking: 'weight_reps', primary: ['ischio-jambiers'], secondary: ['lombaires', 'fessiers'], equipment: BB }),
  s({ name: 'Hyperextension lombaire', altName: 'Extension de banc', category: 'muscu', tracking: 'bodyweight_reps', primary: ['lombaires'], secondary: ['fessiers', 'ischio-jambiers'], equipment: 'machine', level: 'débutant' }),

  /* ------------------------------ ÉPAULES ------------------------------ */
  s({ name: 'Développé militaire barre', altName: 'Overhead Press', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['triceps', 'abdominaux'], equipment: BB, tips: 'Gainage fort, ne pas cambrer le bas du dos.' }),
  s({ name: 'Développé haltères assis', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['triceps'], equipment: DB, level: 'débutant' }),
  s({ name: 'Développé Arnold', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['triceps'], equipment: DB }),
  s({ name: 'Développé épaules machine', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['triceps'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Élévations latérales haltères', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], equipment: DB, level: 'débutant', tips: 'Montez jusqu’à l’horizontale, sans balancier.' }),
  s({ name: 'Élévations latérales poulie', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], equipment: 'poulie' }),
  s({ name: 'Élévations frontales', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], equipment: DB, level: 'débutant' }),
  s({ name: 'Oiseau haltères', altName: 'Rear Delt Fly', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['trapèzes'], equipment: DB }),
  s({ name: 'Oiseau à la poulie', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['trapèzes'], equipment: 'poulie' }),
  s({ name: 'Rowing menton', altName: 'Upright Row', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['trapèzes'], equipment: BB }),
  s({ name: 'Push press', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['triceps', 'quadriceps'], equipment: BB }),

  /* ------------------------------- BICEPS ------------------------------ */
  s({ name: 'Curl barre', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], secondary: ['avant-bras'], equipment: BB, level: 'débutant' }),
  s({ name: 'Curl barre EZ', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: 'barre EZ', level: 'débutant' }),
  s({ name: 'Curl haltères alterné', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: DB, level: 'débutant' }),
  s({ name: 'Curl marteau', altName: 'Hammer Curl', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], secondary: ['avant-bras'], equipment: DB, level: 'débutant' }),
  s({ name: 'Curl incliné haltères', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: DB }),
  s({ name: 'Curl pupitre', altName: 'Larry Scott', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: 'barre EZ' }),
  s({ name: 'Curl concentré', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: DB }),
  s({ name: 'Curl à la poulie', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: 'poulie' }),
  s({ name: 'Curl araignée', category: 'muscu', tracking: 'weight_reps', primary: ['biceps'], equipment: DB }),

  /* ------------------------------ TRICEPS ------------------------------ */
  s({ name: 'Barre au front', altName: 'Skull Crusher', category: 'muscu', tracking: 'weight_reps', primary: ['triceps'], equipment: 'barre EZ' }),
  s({ name: 'Extension poulie haute', category: 'muscu', tracking: 'weight_reps', primary: ['triceps'], equipment: 'poulie', level: 'débutant' }),
  s({ name: 'Extension poulie corde', category: 'muscu', tracking: 'weight_reps', primary: ['triceps'], equipment: 'poulie', level: 'débutant' }),
  s({ name: 'Extension nuque haltère', category: 'muscu', tracking: 'weight_reps', primary: ['triceps'], equipment: DB }),
  s({ name: 'Développé couché prise serrée', category: 'muscu', tracking: 'weight_reps', primary: ['triceps'], secondary: ['pectoraux'], equipment: BB }),
  s({ name: 'Kickback haltère', category: 'muscu', tracking: 'weight_reps', primary: ['triceps'], equipment: DB, level: 'débutant' }),
  s({ name: 'Pompes diamant', category: 'muscu', tracking: 'bodyweight_reps', primary: ['triceps'], secondary: ['pectoraux'], equipment: 'poids du corps' }),
  s({ name: 'Dips entre bancs', category: 'muscu', tracking: 'bodyweight_reps', primary: ['triceps'], equipment: 'poids du corps', level: 'débutant' }),

  /* ------------------------------ AVANT-BRAS --------------------------- */
  s({ name: 'Curl poignets barre', category: 'muscu', tracking: 'weight_reps', primary: ['avant-bras'], equipment: BB }),
  s({ name: 'Curl inversé barre', category: 'muscu', tracking: 'weight_reps', primary: ['avant-bras'], secondary: ['biceps'], equipment: BB }),
  s({ name: 'Farmer’s walk', category: 'muscu', tracking: 'weight_distance', primary: ['avant-bras'], secondary: ['trapèzes', 'abdominaux'], equipment: DB, tips: 'Marchez dos droit, épaules basses, sur une distance donnée.' }),

  /* -------------------------------- JAMBES ----------------------------- */
  s({ name: 'Squat barre', altName: 'Back Squat', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers', 'ischio-jambiers', 'lombaires'], equipment: BB, level: 'intermédiaire', instructions: ['Barre sur les trapèzes, pieds largeur d’épaules, orteils légèrement ouverts.', 'Inspirez, gainez, descendez en poussant les hanches vers l’arrière.', 'Descendez au moins jusqu’à la parallèle.', 'Remontez en poussant dans le sol sans laisser les genoux rentrer.'] }),
  s({ name: 'Squat avant', altName: 'Front Squat', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers', 'abdominaux'], equipment: BB, level: 'avancé' }),
  s({ name: 'Squat gobelet', altName: 'Goblet Squat', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers'], equipment: DB, level: 'débutant' }),
  s({ name: 'Presse à cuisses', altName: 'Leg Press', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Hack squat', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers'], equipment: 'machine' }),
  s({ name: 'Fentes marchées haltères', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers', 'ischio-jambiers'], equipment: DB, level: 'débutant' }),
  s({ name: 'Fentes bulgares', altName: 'Split Squat bulgare', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers'], equipment: DB }),
  s({ name: 'Step-up', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], secondary: ['fessiers'], equipment: DB, level: 'débutant' }),
  s({ name: 'Leg extension', category: 'muscu', tracking: 'weight_reps', primary: ['quadriceps'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Leg curl allongé', category: 'muscu', tracking: 'weight_reps', primary: ['ischio-jambiers'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Leg curl assis', category: 'muscu', tracking: 'weight_reps', primary: ['ischio-jambiers'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Hip thrust barre', category: 'muscu', tracking: 'weight_reps', primary: ['fessiers'], secondary: ['ischio-jambiers'], equipment: BB, tips: 'Menton rentré, côtes basses, verrouillez les fessiers en haut.' }),
  s({ name: 'Pont fessier', category: 'muscu', tracking: 'bodyweight_reps', primary: ['fessiers'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Abduction machine', category: 'muscu', tracking: 'weight_reps', primary: ['abducteurs'], secondary: ['fessiers'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Adduction machine', category: 'muscu', tracking: 'weight_reps', primary: ['adducteurs'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Mollets debout', category: 'muscu', tracking: 'weight_reps', primary: ['mollets'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Mollets assis', category: 'muscu', tracking: 'weight_reps', primary: ['mollets'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Mollets à la presse', category: 'muscu', tracking: 'weight_reps', primary: ['mollets'], equipment: 'machine' }),

  /* ------------------------------ ABDOMINAUX --------------------------- */
  s({ name: 'Crunch', category: 'muscu', tracking: 'bodyweight_reps', primary: ['abdominaux'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Crunch à la poulie', altName: 'Cable Crunch', category: 'muscu', tracking: 'weight_reps', primary: ['abdominaux'], equipment: 'poulie' }),
  s({ name: 'Relevé de jambes suspendu', category: 'muscu', tracking: 'bodyweight_reps', primary: ['abdominaux'], secondary: ['obliques'], equipment: 'poids du corps' }),
  s({ name: 'Gainage', altName: 'Planche', category: 'muscu', tracking: 'duration', primary: ['abdominaux'], secondary: ['lombaires', 'épaules'], equipment: 'poids du corps', level: 'débutant', tips: 'Bassin en rétroversion, fessiers serrés, respiration continue.' }),
  s({ name: 'Gainage latéral', category: 'muscu', tracking: 'duration', primary: ['obliques'], secondary: ['abdominaux'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Gainage lesté', category: 'muscu', tracking: 'weight_duration', primary: ['abdominaux'], equipment: 'poids du corps', level: 'avancé' }),
  s({ name: 'Roulette abdominale', altName: 'Ab Wheel', category: 'muscu', tracking: 'bodyweight_reps', primary: ['abdominaux'], secondary: ['lombaires'], equipment: 'autre' }),
  s({ name: 'Russian twist', category: 'muscu', tracking: 'bodyweight_reps', primary: ['obliques'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Sit-up', category: 'muscu', tracking: 'bodyweight_reps', primary: ['abdominaux'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Crunch vélo', category: 'muscu', tracking: 'bodyweight_reps', primary: ['abdominaux'], secondary: ['obliques'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Mountain climbers', category: 'cardio', tracking: 'duration', primary: ['abdominaux'], secondary: ['cardio'], equipment: 'poids du corps' }),
  s({ name: 'Hollow hold', category: 'muscu', tracking: 'duration', primary: ['abdominaux'], equipment: 'poids du corps' }),

  /* -------------------------------- CARDIO ----------------------------- */
  s({ name: 'Course à pied', altName: 'Running', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['quadriceps', 'ischio-jambiers', 'mollets'], equipment: 'autre', level: 'débutant' }),
  s({ name: 'Course sur tapis', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Marche rapide', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], equipment: 'autre', level: 'débutant' }),
  s({ name: 'Marche inclinée tapis', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['fessiers'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Vélo', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['quadriceps'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Vélo d’appartement', category: 'cardio', tracking: 'duration', primary: ['cardio'], secondary: ['quadriceps'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Rameur', altName: 'Aviron', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['dos', 'quadriceps'], equipment: 'machine' }),
  s({ name: 'Elliptique', category: 'cardio', tracking: 'duration', primary: ['cardio'], equipment: 'machine', level: 'débutant' }),
  s({ name: 'Corde à sauter', category: 'cardio', tracking: 'duration', primary: ['cardio'], secondary: ['mollets'], equipment: 'autre', level: 'débutant' }),
  s({ name: 'Natation', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['dos', 'épaules'], equipment: 'autre' }),
  s({ name: 'Escalier / Stairmaster', category: 'cardio', tracking: 'duration', primary: ['cardio'], secondary: ['fessiers', 'mollets'], equipment: 'machine' }),
  s({ name: 'Ski erg', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['dos'], equipment: 'machine' }),
  s({ name: 'Assault bike', category: 'cardio', tracking: 'duration', primary: ['cardio'], equipment: 'machine' }),
  s({ name: 'Sprint', category: 'cardio', tracking: 'distance_duration', primary: ['cardio'], secondary: ['quadriceps', 'ischio-jambiers'], equipment: 'autre', level: 'avancé' }),
  s({ name: 'HIIT', category: 'cardio', tracking: 'duration', primary: ['cardio'], equipment: 'autre' }),
  s({ name: 'Battle ropes', category: 'cardio', tracking: 'duration', primary: ['cardio'], secondary: ['épaules'], equipment: 'autre' }),
  s({ name: 'Sled push', category: 'strongman', tracking: 'weight_distance', primary: ['quadriceps'], secondary: ['cardio', 'fessiers'], equipment: 'autre' }),

  /* ---------------------- PLIOMÉTRIE / HALTÉRO / STRONGMAN -------------- */
  s({ name: 'Burpees', category: 'plyometrie', tracking: 'reps_only', primary: ['corps entier'], secondary: ['cardio'], equipment: 'poids du corps', level: 'intermédiaire' }),
  s({ name: 'Box jumps', category: 'plyometrie', tracking: 'reps_only', primary: ['quadriceps'], secondary: ['fessiers', 'mollets'], equipment: 'autre' }),
  s({ name: 'Jumping jacks', category: 'plyometrie', tracking: 'duration', primary: ['cardio'], secondary: ['corps entier'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Squat jumps', category: 'plyometrie', tracking: 'reps_only', primary: ['quadriceps'], secondary: ['fessiers'], equipment: 'poids du corps' }),
  s({ name: 'Clap push-up', category: 'plyometrie', tracking: 'bodyweight_reps', primary: ['pectoraux'], secondary: ['triceps'], equipment: 'poids du corps', level: 'avancé' }),
  s({ name: 'Saut en longueur', category: 'plyometrie', tracking: 'distance_duration', primary: ['quadriceps'], secondary: ['fessiers'], equipment: 'poids du corps' }),
  s({ name: 'Épaulé-jeté', altName: 'Clean & Jerk', category: 'halterophilie', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['épaules', 'quadriceps', 'trapèzes'], equipment: BB, level: 'avancé' }),
  s({ name: 'Arraché', altName: 'Snatch', category: 'halterophilie', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['épaules', 'dos'], equipment: BB, level: 'avancé' }),
  s({ name: 'Épaulé', altName: 'Clean', category: 'halterophilie', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['quadriceps', 'trapèzes'], equipment: BB, level: 'avancé' }),
  s({ name: 'Power clean', category: 'halterophilie', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['trapèzes', 'quadriceps'], equipment: BB, level: 'avancé' }),
  s({ name: 'Jeté', altName: 'Jerk', category: 'halterophilie', tracking: 'weight_reps', primary: ['épaules'], secondary: ['quadriceps'], equipment: BB, level: 'avancé' }),
  s({ name: 'Thruster', category: 'muscu', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['épaules', 'quadriceps'], equipment: BB }),
  s({ name: 'Wall ball', category: 'muscu', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['quadriceps', 'épaules'], equipment: 'medicine-ball' }),
  s({ name: 'Kettlebell swing', category: 'muscu', tracking: 'weight_reps', primary: ['fessiers'], secondary: ['ischio-jambiers', 'lombaires'], equipment: 'kettlebell', tips: 'Mouvement de hanches, pas un squat.' }),
  s({ name: 'Kettlebell clean & press', category: 'muscu', tracking: 'weight_reps', primary: ['épaules'], secondary: ['corps entier'], equipment: 'kettlebell' }),
  s({ name: 'Turkish get-up', category: 'muscu', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['abdominaux', 'épaules'], equipment: 'kettlebell', level: 'avancé' }),
  s({ name: 'Snatch haltère unilatéral', category: 'muscu', tracking: 'weight_reps', primary: ['corps entier'], secondary: ['épaules'], equipment: DB }),

  /* ------------------------ MOBILITÉ / ÉTIREMENTS ---------------------- */
  s({ name: 'Étirement ischio-jambiers', category: 'etirement', tracking: 'duration', primary: ['ischio-jambiers'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Étirement quadriceps', category: 'etirement', tracking: 'duration', primary: ['quadriceps'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Étirement pectoraux', category: 'etirement', tracking: 'duration', primary: ['pectoraux'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Étirement mollets', category: 'etirement', tracking: 'duration', primary: ['mollets'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Étirement fléchisseurs de hanche', category: 'etirement', tracking: 'duration', primary: ['quadriceps'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Chat-vache', category: 'mobilite', tracking: 'duration', primary: ['lombaires'], secondary: ['dos'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Mobilité hanches 90/90', category: 'mobilite', tracking: 'duration', primary: ['fessiers'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Rotations épaules au bâton', category: 'mobilite', tracking: 'reps_only', primary: ['épaules'], equipment: 'autre', level: 'débutant' }),
  s({ name: 'Ouverture thoracique', category: 'mobilite', tracking: 'duration', primary: ['dos'], secondary: ['pectoraux'], equipment: 'rouleau de mousse', level: 'débutant' }),
  s({ name: 'Mobilité chevilles', category: 'mobilite', tracking: 'reps_only', primary: ['mollets'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Position du pigeon', category: 'mobilite', tracking: 'duration', primary: ['fessiers'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Salutation au soleil', category: 'mobilite', tracking: 'duration', primary: ['corps entier'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Foam rolling quadriceps', category: 'mobilite', tracking: 'duration', primary: ['quadriceps'], equipment: 'rouleau de mousse', level: 'débutant' }),
  s({ name: 'Foam rolling dos', category: 'mobilite', tracking: 'duration', primary: ['dos'], equipment: 'rouleau de mousse', level: 'débutant' }),
  s({ name: 'Foam rolling ischio-jambiers', category: 'mobilite', tracking: 'duration', primary: ['ischio-jambiers'], equipment: 'rouleau de mousse', level: 'débutant' }),
  s({ name: 'Rotations de hanches debout', category: 'mobilite', tracking: 'reps_only', primary: ['fessiers'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Cercles de bras', category: 'mobilite', tracking: 'reps_only', primary: ['épaules'], equipment: 'poids du corps', level: 'débutant' }),
  s({ name: 'Élastique pull-apart', category: 'mobilite', tracking: 'reps_only', primary: ['épaules'], secondary: ['trapèzes'], equipment: 'élastiques', level: 'débutant' }),
  s({ name: 'Band face pull', category: 'mobilite', tracking: 'reps_only', primary: ['trapèzes'], secondary: ['épaules'], equipment: 'élastiques', level: 'débutant' }),
  s({ name: 'Band good morning', category: 'mobilite', tracking: 'reps_only', primary: ['ischio-jambiers'], equipment: 'élastiques', level: 'débutant' }),
  s({ name: 'Échauffement cardio léger', category: 'cardio', tracking: 'duration', primary: ['cardio'], equipment: 'autre', level: 'débutant' }),
]

/* ------------------------------------------------------------------
   Programmes préenregistrés
------------------------------------------------------------------ */

interface RoutineSeed {
  name: string
  description: string
  color: string
  folder: string
  items: [name: string, sets: number, reps: number, rest: number][]
}

const ROUTINE_SEEDS: RoutineSeed[] = [
  {
    name: 'Push — Pectoraux / Épaules / Triceps',
    description: 'Séance poussée classique en salle.',
    color: '#4f83ff',
    folder: 'PPL',
    items: [
      ['Développé couché', 4, 8, 150],
      ['Développé incliné haltères', 3, 10, 120],
      ['Élévations latérales haltères', 4, 12, 75],
      ['Développé militaire barre', 3, 8, 120],
      ['Extension poulie corde', 3, 12, 75],
      ['Écarté à la poulie vis-à-vis', 3, 12, 75],
    ],
  },
  {
    name: 'Pull — Dos / Biceps',
    description: 'Séance tirage, focus dos et biceps.',
    color: '#22c55e',
    folder: 'PPL',
    items: [
      ['Tractions pronation', 4, 8, 150],
      ['Rowing barre', 4, 8, 150],
      ['Tirage vertical poulie', 3, 12, 90],
      ['Rowing poulie basse', 3, 12, 90],
      ['Curl barre EZ', 3, 12, 75],
      ['Curl marteau', 3, 12, 60],
    ],
  },
  {
    name: 'Legs — Jambes / Fessiers',
    description: 'Séance bas du corps complète.',
    color: '#f97316',
    folder: 'PPL',
    items: [
      ['Squat barre', 4, 8, 180],
      ['Soulevé de terre roumain', 3, 10, 150],
      ['Presse à cuisses', 3, 12, 120],
      ['Leg curl allongé', 3, 12, 75],
      ['Mollets debout', 4, 15, 60],
      ['Gainage', 3, 1, 60],
    ],
  },
  {
    name: 'Full body débutant',
    description: '3 séances/semaine, mouvements polyarticulaires.',
    color: '#a855f7',
    folder: 'Débutant',
    items: [
      ['Squat gobelet', 3, 10, 120],
      ['Développé couché haltères', 3, 10, 120],
      ['Tirage vertical poulie', 3, 10, 120],
      ['Développé haltères assis', 3, 12, 90],
      ['Leg curl assis', 3, 12, 75],
      ['Gainage', 3, 1, 60],
    ],
  },
  {
    name: 'Haut du corps express',
    description: '45 min, salle ou maison avec haltères.',
    color: '#0ea5e9',
    folder: 'Express',
    items: [
      ['Pompes', 3, 15, 60],
      ['Rowing haltère unilatéral', 3, 10, 90],
      ['Élévations latérales haltères', 3, 15, 60],
      ['Curl haltères alterné', 3, 12, 60],
      ['Extension nuque haltère', 3, 12, 60],
      ['Gainage latéral', 3, 1, 45],
    ],
  },
  {
    name: 'Cardio & mobilité',
    description: 'Séance d’endurance + mobilité / récupération active.',
    color: '#eab308',
    folder: 'Cardio',
    items: [
      ['Échauffement cardio léger', 1, 1, 30],
      ['Rameur', 3, 1, 90],
      ['Corde à sauter', 5, 1, 45],
      ['Mobilité hanches 90/90', 2, 1, 30],
      ['Étirement ischio-jambiers', 2, 1, 30],
      ['Foam rolling quadriceps', 2, 1, 30],
    ],
  },
  {
    name: 'HIIT brûle-graisse',
    description: 'Circuit intense, 20 min.',
    color: '#ef4444',
    folder: 'Cardio',
    items: [
      ['Burpees', 4, 15, 45],
      ['Mountain climbers', 4, 1, 45],
      ['Squat jumps', 4, 15, 45],
      ['Battle ropes', 4, 1, 45],
      ['Jumping jacks', 4, 1, 45],
    ],
  },
]

export function createSeedRoutines(exercises: Exercise[]): Routine[] {
  const byName = new Map(exercises.map((e) => [e.name, e]))
  const now = new Date().toISOString()
  return ROUTINE_SEEDS.map((seed) => {
    const items = seed.items
      .map(([name, setCount, reps, rest]) => {
        const ex = byName.get(name)
        if (!ex) return null
        const fields = trackingFields(ex.tracking)
        const sets: RoutineSetTemplate[] = Array.from({ length: setCount }, () => {
          const t: RoutineSetTemplate = { type: 'normal' }
          if (fields.includes('reps')) t.reps = reps
          if (fields.includes('duration')) t.duration = reps > 1 ? reps * 60 : 60
          return t
        })
        return { id: uid('re'), exerciseId: ex.id, sets, restSeconds: rest, supersetId: null }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
    return {
      id: `routine_${slug(seed.name)}`,
      name: seed.name,
      description: seed.description,
      folder: seed.folder,
      color: seed.color,
      exercises: items,
      timesPerformed: 0,
      createdAt: now,
      updatedAt: now,
    }
  })
}

function trackingFields(t: TrackingType): string[] {
  switch (t) {
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