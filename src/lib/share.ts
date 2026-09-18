/**
 * Partage de séance : récap texte + carte image (1080×1350, format portrait
 * pour Instagram / story / message à un proche).
 *
 * Stratégie : `navigator.share` avec le fichier image quand le navigateur le
 * permet (Android…), sinon téléchargement PNG + texte copié dans le
 * presse-papiers, sinon texte seul.
 */
import type { Exercise, Settings, Workout, WorkoutSet } from '@/types'
import {
  RECORD_LABELS,
  detectNewRecords,
  workoutDurationSeconds,
  workoutSets,
  workoutVolume,
} from '@/lib/calc'
import { formatDate, formatDistance, formatDuration, formatVolume, formatWeight } from '@/lib/utils'

export interface ShareData {
  workout: Workout
  exercises: Exercise[]
  settings: Settings
  previousWorkouts: Workout[]
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void
}

/* ------------------------------------------------------------------ */
/* Récapitulatif texte                                                */
/* ------------------------------------------------------------------ */

function formatSet(s: WorkoutSet, settings: Settings): string {
  const parts: string[] = []
  if (s.weight !== undefined && s.weight > 0) parts.push(formatWeight(s.weight, settings.unit, false))
  if (s.reps !== undefined) parts.push(`×${s.reps}`)
  if (s.duration !== undefined && s.duration > 0) parts.push(formatDuration(s.duration, 'compact'))
  if (s.distance !== undefined && s.distance > 0) parts.push(formatDistance(s.distance, settings.distanceUnit))
  return parts.join(' ') || '—'
}

function formatRecordValue(kind: string, value: number, settings: Settings): string {
  switch (kind) {
    case 'weight':
    case 'e1rm':
    case 'volume':
      return formatWeight(value, settings.unit)
    case 'reps':
      return `${Math.round(value)} reps`
    case 'duration':
      return formatDuration(value, 'compact')
    case 'distance':
      return formatDistance(value, settings.distanceUnit)
    default:
      return String(Math.round(value))
  }
}

export function buildShareText(
  workout: Workout,
  exercises: Exercise[],
  settings: Settings,
  previousWorkouts: Workout[],
): string {
  const lines: string[] = []
  lines.push(`💪 ${workout.name}`)
  lines.push(
    `📅 ${formatDate(workout.startedAt, 'long')} · ⏱ ${formatDuration(workoutDurationSeconds(workout), 'compact')} · 📦 ${formatVolume(workoutVolume(workout), settings.unit)} · 🔥 ${workoutSets(workout)} séries`,
  )

  const records = detectNewRecords(workout, previousWorkouts, exercises)
  if (records.length > 0) {
    lines.push('')
    lines.push(`🏆 Record${records.length > 1 ? 's' : ''} battu${records.length > 1 ? 's' : ''} :`)
    for (const r of records.slice(0, 5)) {
      const label = RECORD_LABELS[r.record.kind] ?? r.record.kind
      lines.push(`• ${r.exercise.name} — ${label} (${formatRecordValue(r.record.kind, r.record.value, settings)})`)
    }
  }

  lines.push('')
  for (const we of workout.exercises) {
    const name =
      exercises.find((e) => e.id === we.exerciseId)?.name ?? we.exerciseName ?? 'Exercice'
    const done = we.sets.filter((s) => s.completed)
    const shown = done.length > 0 ? done : we.sets
    if (!shown.length) continue
    lines.push(`🏋️ ${name} : ${shown.map((s) => formatSet(s, settings)).join(' · ')}`)
  }

  lines.push('')
  lines.push('— partagé depuis VeryHevy')
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* Carte image 1080×1350                                              */
/* ------------------------------------------------------------------ */

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    const test = current ? `${current} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current)
      current = w
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

export function renderShareCard(
  workout: Workout,
  exercises: Exercise[],
  settings: Settings,
  previousWorkouts: Workout[],
): HTMLCanvasElement {
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  const accent = settings.accent || '#4f83ff'
  const font = (size: number, weight = 700) => `${weight} ${size}px Inter, system-ui, sans-serif`

  // Fond + halo d'accent
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#14161d')
  bg.addColorStop(1, '#0a0b0f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, 0, 50, W / 2, 0, 700)
  glow.addColorStop(0, `${accent}55`)
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  let y = 120
  const pad = 90

  ctx.fillStyle = accent
  ctx.font = font(44)
  ctx.fillText('💪 VERYHEVY', pad, y)
  y += 30
  ctx.fillStyle = '#8b90a0'
  ctx.font = font(34, 500)
  ctx.fillText(formatDate(workout.startedAt, 'long'), pad, y + 40)
  y += 110

  ctx.fillStyle = '#ffffff'
  ctx.font = font(72)
  for (const line of wrapText(ctx, workout.name, W - pad * 2).slice(0, 2)) {
    ctx.fillText(line, pad, y)
    y += 88
  }
  y += 30

  // Statistiques
  const stats: [string, string][] = [
    ['DURÉE', formatDuration(workoutDurationSeconds(workout), 'compact')],
    ['VOLUME', formatVolume(workoutVolume(workout), settings.unit)],
    ['SÉRIES', String(workoutSets(workout))],
  ]
  const boxW = (W - pad * 2 - 40) / 3
  stats.forEach(([label, value], i) => {
    const x = pad + i * (boxW + 20)
    ctx.fillStyle = '#1a1d25'
    ctx.beginPath()
    ctx.roundRect(x, y, boxW, 150, 24)
    ctx.fill()
    ctx.fillStyle = '#8b90a0'
    ctx.font = font(26, 600)
    ctx.fillText(label, x + 28, y + 52)
    ctx.fillStyle = '#ffffff'
    ctx.font = font(44)
    ctx.fillText(value, x + 28, y + 112)
  })
  y += 210

  // Records
  const records = detectNewRecords(workout, previousWorkouts, exercises).slice(0, 3)
  if (records.length > 0) {
    ctx.fillStyle = accent
    ctx.font = font(36)
    ctx.fillText(`🏆 ${records.length} record${records.length > 1 ? 's' : ''} battu${records.length > 1 ? 's' : ''}`, pad, y)
    y += 60
    ctx.font = font(32, 500)
    for (const r of records) {
      const label = RECORD_LABELS[r.record.kind] ?? r.record.kind
      const line = `${r.exercise.name} — ${label} (${formatRecordValue(r.record.kind, r.record.value, settings)})`
      ctx.fillStyle = '#e8eaf0'
      for (const part of wrapText(ctx, `• ${line}`, W - pad * 2).slice(0, 2)) {
        ctx.fillText(part, pad, y)
        y += 48
      }
    }
    y += 20
  }

  // Exercices (max 7 pour tenir sur la carte)
  ctx.fillStyle = '#ffffff'
  ctx.font = font(36)
  ctx.fillText('Séance', pad, y)
  y += 58
  const shown = workout.exercises.slice(0, 7)
  ctx.font = font(30, 500)
  for (const we of shown) {
    const name = exercises.find((e) => e.id === we.exerciseId)?.name ?? we.exerciseName ?? 'Exercice'
    const done = we.sets.filter((s) => s.completed)
    const sets = (done.length > 0 ? done : we.sets).slice(0, 6)
    ctx.fillStyle = '#ffffff'
    const title = wrapText(ctx, name, W - pad * 2).slice(0, 1)[0] ?? name
    ctx.fillText(title, pad, y)
    y += 44
    ctx.fillStyle = '#8b90a0'
    ctx.font = font(28, 400)
    for (const part of wrapText(ctx, sets.map((s) => formatSet(s, settings)).join('  ·  '), W - pad * 2).slice(0, 2)) {
      ctx.fillText(part, pad, y)
      y += 40
    }
    ctx.font = font(30, 500)
    y += 18
    if (y > H - 140) break
  }

  // Pied de page
  ctx.fillStyle = '#5b6070'
  ctx.font = font(28, 500)
  ctx.fillText('💪 VeryHevy — carnet d’entraînement', pad, H - 70)
  return canvas
}

/* ------------------------------------------------------------------ */
/* Partage                                                            */
/* ------------------------------------------------------------------ */

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

export async function shareWorkout(data: ShareData): Promise<void> {
  const { workout, exercises, settings, previousWorkouts, notify } = data
  const text = buildShareText(workout, exercises, settings, previousWorkouts)
  const title = `Séance VeryHevy — ${workout.name}`

  // 1. Partage natif avec l'image (Android…).
  try {
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    const blob = await canvasToBlob(renderShareCard(workout, exercises, settings, previousWorkouts))
    if (blob && typeof navigator.share === 'function') {
      const file = new File([blob], `veryhevy-seance-${workout.startedAt.slice(0, 10)}.png`, { type: 'image/png' })
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await navigator.share({ title, text, files: [file] })
        return
      }
    }
    // 2. Sinon : image téléchargée (pour Instagram) + texte copié.
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `veryhevy-seance-${workout.startedAt.slice(0, 10)}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
    try {
      await navigator.clipboard.writeText(text)
      notify('Image téléchargée + récap copié : colle-le sur Instagram 💪', 'success')
    } catch {
      notify('Image téléchargée : publie-la sur Instagram 💪', 'success')
    }
    return
  } catch (err) {
    // Partage annulé par l'utilisateur : silence.
    if (err instanceof Error && err.name === 'AbortError') return
  }

  // 3. Dernier recours : texte seul dans le presse-papiers.
  try {
    await navigator.clipboard.writeText(text)
    notify('Récap copié dans le presse-papiers', 'success')
  } catch {
    notify('Partage impossible sur cet appareil', 'error')
  }
}
