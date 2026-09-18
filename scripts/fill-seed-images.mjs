/**
 * Génère src/lib/seed-images.ts : associe à chaque exercice de la base
 * intégrée française ses illustrations infographiques issues de la base
 * libre free-exercise-db (domaine public).
 *
 * Usage : node scripts/fill-seed-images.mjs [chemin-exercises.json]
 * Le JSON est celui de https://github.com/yuhonas/free-exercise-db
 * (dist/exercises.json). Téléchargé automatiquement si absent.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../src/lib/seed-images.ts', import.meta.url))

const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

/** Exercice français (nom du seed) → exercice free-exercise-db (nom exact). */
const MAPPING = [
  // Pectoraux
  ['Développé couché', 'Barbell Bench Press - Medium Grip'],
  ['Développé couché haltères', 'Dumbbell Bench Press'],
  ['Développé incliné barre', 'Barbell Incline Bench Press - Medium Grip'],
  ['Développé incliné haltères', 'Incline Dumbbell Press'],
  ['Développé décliné barre', 'Decline Barbell Bench Press'],
  ['Développé convergente machine', 'Leverage Chest Press'],
  ['Écarté couché haltères', 'Dumbbell Flyes'],
  ['Écarté incliné haltères', 'Incline Dumbbell Flyes'],
  ['Écarté à la poulie vis-à-vis', 'Cable Crossover'],
  ['Pec-deck', 'Butterfly'],
  ['Pompes', 'Pushups'],
  ['Pompes lestées', 'Pushups'],
  ['Dips', 'Dips - Chest Version'],
  ['Dips lestées', 'Dips - Chest Version'],
  ['Pull-over haltère', 'Bent-Arm Dumbbell Pullover'],
  // Dos
  ['Tractions pronation', 'Pullups'],
  ['Tractions supination', 'Chin-Up'],
  ['Tractions prise neutre', 'V-Bar Pullup'],
  ['Tractions lestées', 'Weighted Pull Ups'],
  ['Tirage vertical poulie', 'Wide-Grip Lat Pulldown'],
  ['Tirage vertical prise serrée', 'Close-Grip Front Lat Pulldown'],
  ['Rowing barre', 'Bent Over Barbell Row'],
  ['Rowing haltère unilatéral', 'One-Arm Dumbbell Row'],
  ['Rowing T-bar', 'T-Bar Row with Handle'],
  ['Rowing poulie basse', 'Seated Cable Rows'],
  ['Tirage horizontal machine', 'Leverage Iso Row'],
  ['Shrugs barre', 'Barbell Shrug'],
  ['Shrugs haltères', 'Dumbbell Shrug'],
  ['Face pull', 'Face Pull'],
  ['Soulevé de terre', 'Barbell Deadlift'],
  ['Soulevé de terre roumain', 'Romanian Deadlift'],
  ['Soulevé de terre sumo', 'Sumo Deadlift'],
  ['Rack pull', 'Rack Pulls'],
  ['Good morning', 'Good Morning'],
  ['Hyperextension lombaire', 'Hyperextensions (Back Extensions)'],
  // Épaules
  ['Développé militaire barre', 'Barbell Shoulder Press'],
  ['Développé haltères assis', 'Seated Dumbbell Press'],
  ['Développé Arnold', 'Arnold Dumbbell Press'],
  ['Développé épaules machine', 'Machine Shoulder (Military) Press'],
  ['Élévations latérales haltères', 'Side Lateral Raise'],
  ['Élévations latérales poulie', 'Standing Low-Pulley Deltoid Raise'],
  ['Élévations frontales', 'Front Dumbbell Raise'],
  ['Oiseau haltères', 'Reverse Flyes'],
  ['Oiseau à la poulie', 'Cable Rear Delt Fly'],
  ['Rowing menton', 'Upright Barbell Row'],
  ['Push press', 'Push Press'],
  // Biceps
  ['Curl barre', 'Barbell Curl'],
  ['Curl barre EZ', 'EZ-Bar Curl'],
  ['Curl haltères alterné', 'Dumbbell Alternate Bicep Curl'],
  ['Curl marteau', 'Hammer Curls'],
  ['Curl incliné haltères', 'Incline Dumbbell Curl'],
  ['Curl pupitre', 'Preacher Curl'],
  ['Curl concentré', 'Concentration Curls'],
  ['Curl à la poulie', 'Standing Biceps Cable Curl'],
  ['Curl araignée', 'Spider Curl'],
  // Triceps
  ['Barre au front', 'EZ-Bar Skullcrusher'],
  ['Extension poulie haute', 'Triceps Pushdown'],
  ['Extension poulie corde', 'Triceps Pushdown - Rope Attachment'],
  ['Extension nuque haltère', 'Standing Dumbbell Triceps Extension'],
  ['Développé couché prise serrée', 'Close-Grip Barbell Bench Press'],
  ['Kickback haltère', 'Tricep Dumbbell Kickback'],
  ['Pompes diamant', 'Push-Ups - Close Triceps Position'],
  ['Dips entre bancs', 'Bench Dips'],
  // Avant-bras
  ['Curl poignets barre', 'Palms-Up Barbell Wrist Curl Over A Bench'],
  ['Curl inversé barre', 'Reverse Barbell Curl'],
  ['Farmer’s walk', "Farmer's Walk"],
  // Jambes / fessiers
  ['Squat barre', 'Barbell Squat'],
  ['Squat avant', 'Front Barbell Squat'],
  ['Squat gobelet', 'Goblet Squat'],
  ['Presse à cuisses', 'Leg Press'],
  ['Hack squat', 'Hack Squat'],
  ['Fentes marchées haltères', 'Dumbbell Lunges'],
  ['Fentes bulgares', 'Split Squats'],
  ['Step-up', 'Dumbbell Step Ups'],
  ['Leg extension', 'Leg Extensions'],
  ['Leg curl allongé', 'Lying Leg Curls'],
  ['Leg curl assis', 'Seated Leg Curl'],
  ['Hip thrust barre', 'Barbell Hip Thrust'],
  ['Pont fessier', 'Butt Lift (Bridge)'],
  ['Abduction machine', 'Thigh Abductor'],
  ['Adduction machine', 'Thigh Adductor'],
  ['Mollets debout', 'Standing Calf Raises'],
  ['Mollets assis', 'Seated Calf Raise'],
  ['Mollets à la presse', 'Calf Press On The Leg Press Machine'],
  // Abdos / gainage
  ['Crunch', 'Crunches'],
  ['Crunch à la poulie', 'Cable Crunch'],
  ['Relevé de jambes suspendu', 'Hanging Leg Raise'],
  ['Gainage', 'Plank'],
  ['Gainage latéral', 'Side Bridge'],
  ['Gainage lesté', 'Plank'],
  ['Roulette abdominale', 'Ab Roller'],
  ['Russian twist', 'Russian Twist'],
  ['Sit-up', 'Sit-Up'],
  ['Crunch vélo', 'Cross-Body Crunch'],
  ['Mountain climbers', 'Mountain Climbers'],
  ['Hollow hold', 'Dead Bug'],
  // Cardio
  ['Course à pied', 'Trail Running/Walking'],
  ['Course sur tapis', 'Running, Treadmill'],
  ['Marche rapide', 'Walking, Treadmill'],
  ['Marche inclinée tapis', 'Walking, Treadmill'],
  ['Vélo', 'Bicycling'],
  ['Vélo d’appartement', 'Bicycling, Stationary'],
  ['Rameur', 'Rowing, Stationary'],
  ['Elliptique', 'Elliptical Trainer'],
  ['Corde à sauter', 'Rope Jumping'],
  ['Escalier / Stairmaster', 'Stairmaster'],
  ['Assault bike', 'Air Bike'],
  ['Sprint', 'Wind Sprints'],
  ['Battle ropes', 'Battling Ropes'],
  ['Sled push', 'Sled Push'],
  ['Box jumps', 'Front Box Jump'],
  ['Jumping jacks', 'Star Jump'],
  ['Squat jumps', 'Freehand Jump Squat'],
  ['Clap push-up', 'Plyo Push-up'],
  ['Saut en longueur', 'Standing Long Jump'],
  // Haltérophilie / strongman
  ['Épaulé-jeté', 'Clean and Jerk'],
  ['Arraché', 'Snatch'],
  ['Épaulé', 'Clean'],
  ['Power clean', 'Power Clean'],
  ['Jeté', 'Split Jerk'],
  ['Thruster', 'Kettlebell Thruster'],
  ['Wall ball', 'Medicine Ball Chest Pass'],
  ['Kettlebell swing', 'One-Arm Kettlebell Swings'],
  ['Kettlebell clean & press', 'One-Arm Kettlebell Clean and Jerk'],
  ['Turkish get-up', 'Kettlebell Turkish Get-Up (Lunge style)'],
  ['Snatch haltère unilatéral', 'One-Arm Kettlebell Snatch'],
  // Étirements / mobilité
  ['Étirement ischio-jambiers', 'Hamstring Stretch'],
  ['Étirement quadriceps', 'Quad Stretch'],
  ['Étirement pectoraux', 'Behind Head Chest Stretch'],
  ['Étirement mollets', 'Calf Stretch Hands Against Wall'],
  ['Étirement fléchisseurs de hanche', 'Kneeling Hip Flexor'],
  ['Chat-vache', 'Cat Stretch'],
  ['Mobilité hanches 90/90', '90/90 Hamstring'],
  ['Rotations épaules au bâton', 'Shoulder Circles'],
  ['Ouverture thoracique', 'Dynamic Chest Stretch'],
  ['Mobilité chevilles', 'Ankle Circles'],
  ['Position du pigeon', 'IT Band and Glute Stretch'],
  ['Salutation au soleil', "Child's Pose"],
  ['Foam rolling quadriceps', 'Quadriceps-SMR'],
  ['Foam rolling dos', 'Lower Back-SMR'],
  ['Foam rolling ischio-jambiers', 'Hamstring-SMR'],
  ['Rotations de hanches debout', 'Standing Hip Circles'],
  ['Cercles de bras', 'Arm Circles'],
  ['Élastique pull-apart', 'Band Pull Apart'],
  ['Band face pull', 'Back Flyes - With Bands'],
  ['Band good morning', 'Band Good Morning'],
  ['Échauffement cardio léger', 'Fast Skipping'],
]

function slug(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

async function loadDb() {
  for (const p of process.argv.slice(2)) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
  }
  const res = await fetch('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json')
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status})`)
  return res.json()
}

const db = await loadDb()
const byName = new Map(db.map((e) => [e.name, e]))

const entries = []
let missing = []
for (const [fr, en] of MAPPING) {
  const ex = byName.get(en)
  if (!ex || !ex.images?.length) {
    missing.push(`${fr} → « ${en} »`)
    continue
  }
  entries.push([slug(fr), ex.images.map((p) => IMG_BASE + encodeURI(p))])
}

const lines = [
  '/**',
  ' * Illustrations infographiques de la base intégrée : chaque exercice',
  ' * français est relié aux rendus de free-exercise-db (domaine public).',
  ' * Clé : slug du nom du seed (cf. src/lib/seed.ts). Généré par',
  ' * scripts/fill-seed-images.mjs — ne pas éditer à la main.',
  ' */',
  `export const SEED_IMAGES: Record<string, string[]> = {`,
  ...entries.map(([k, imgs]) => `  ${k}: [${imgs.map((u) => `'${u}'`).join(', ')}],`),
  '}',
  '',
]

writeFileSync(OUT, lines.join('\n'))
console.log(`✓ ${entries.length} exercices illustrés → ${OUT}`)
if (missing.length) {
  console.log(`⚠ ${missing.length} sans correspondance :`)
  console.log(missing.map((m) => `  - ${m}`).join('\n'))
}
