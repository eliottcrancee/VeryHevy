import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  return prefix ? `${prefix}_${raw}` : raw
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

export const round = (v: number, decimals = 1) => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

/* ------------------------------- Unités ------------------------------- */

export const KG_TO_LB = 2.2046226218

export function kgToDisplay(kg: number, unit: 'kg' | 'lb') {
  return unit === 'kg' ? kg : kg * KG_TO_LB
}

export function displayToKg(value: number, unit: 'kg' | 'lb') {
  return unit === 'kg' ? value : value / KG_TO_LB
}

export function formatWeight(kg: number | undefined, unit: 'kg' | 'lb', withUnit = true) {
  if (kg === undefined || kg === null || Number.isNaN(kg)) return '—'
  const v = kgToDisplay(kg, unit)
  const s = v % 1 === 0 ? String(v) : v.toFixed(1)
  return withUnit ? `${s} ${unit}` : s
}

/** Volume d'entraînement (kg × reps) formaté dans l'unité choisie. */
export function formatVolume(kgVolume: number, unit: 'kg' | 'lb'): string {
  if (!Number.isFinite(kgVolume)) return '—'
  return `${Math.round(kgToDisplay(kgVolume, unit)).toLocaleString('fr-FR')} ${unit}`
}

/** kg (canonique, stocké en base) → valeur à afficher dans un champ de saisie. */
export function kgToInput(kg: number | undefined, unit: 'kg' | 'lb'): number | undefined {
  if (kg === undefined || kg === null || Number.isNaN(kg)) return undefined
  return round(kgToDisplay(kg, unit), unit === 'kg' ? 2 : 1)
}

/** Valeur saisie dans l'unité affichée → kg (canonique). */
export function inputToKg(value: number | undefined, unit: 'kg' | 'lb'): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined
  return round(displayToKg(value, unit), 3)
}

/** Mètres (canonique) → valeur à afficher dans un champ de saisie de distance. */
export function metersToDisplay(meters: number | undefined, unit: 'km' | 'mi'): number | undefined {
  if (meters === undefined || meters === null || Number.isNaN(meters)) return undefined
  const factor = unit === 'km' ? 1000 : 1609.344
  return round(meters / factor, 2)
}

/** Valeur saisie dans l'unité de distance affichée → mètres (canonique). */
export function displayToMeters(value: number | undefined, unit: 'km' | 'mi'): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined
  const factor = unit === 'km' ? 1000 : 1609.344
  return Math.round(value * factor)
}

export function formatDistance(meters: number | undefined, unit: 'km' | 'mi') {
  if (meters === undefined || meters === null || Number.isNaN(meters)) return '—'
  const isKm = unit === 'km'
  const value = isKm ? meters / 1000 : meters / 1609.344
  const suffix = isKm ? 'km' : 'mi'
  if (value === 0) return `0 ${suffix}`
  if (value < 1) return `${Math.round(isKm ? meters : meters * 3.28084)} ${isKm ? 'm' : 'ft'}`
  return `${round(value, 2)} ${suffix}`
}

/** secondes → "1 h 05" / "12:30" / "45 s" */
export function formatDuration(seconds: number | undefined, style: 'clock' | 'compact' = 'clock') {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (style === 'compact') {
    if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`
    if (m > 0) return `${m} min`
    return `${sec} s`
  }
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Pour les saisies MM:SS → secondes */
export function parseClock(input: string): number | undefined {
  const t = input.trim()
  if (!t) return undefined
  if (!t.includes(':')) {
    const n = Number(t)
    if (Number.isNaN(n)) return undefined
    // une valeur seule est interprétée comme des minutes si > 10, sinon des secondes
    return n > 10 ? n * 60 : n
  }
  const parts = t.split(':').map((p) => Number(p || 0))
  if (parts.some((n) => Number.isNaN(n))) return undefined
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return undefined
}

export function formatNumber(v: number | undefined, decimals = 1) {
  if (v === undefined || v === null || Number.isNaN(v)) return '—'
  return v % 1 === 0 ? String(v) : v.toFixed(decimals)
}

/* ------------------------------- Dates ------------------------------- */

export function toDateKey(iso: string | number | Date): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function formatDate(iso: string, mode: 'short' | 'long' | 'day' = 'short') {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = toDateKey(d) === toDateKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay) return "Aujourd'hui"
  if (toDateKey(d) === toDateKey(yesterday)) return 'Hier'

  const opts: Intl.DateTimeFormatOptions =
    mode === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : mode === 'day'
        ? { weekday: 'long' }
        : { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }
  return new Intl.DateTimeFormat('fr-FR', opts).format(d)
}

export function formatTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso, 'short')} · ${formatTime(iso)}`
}

/** Lundi comme premier jour de la semaine. */
export function startOfWeek(date: Date, firstDay: 0 | 1 = 1): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const diff = (d.getDay() - firstDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/* ------------------------------- Divers ------------------------------- */

export function pluralize(n: number, singular: string, plural?: string) {
  return `${n} ${n > 1 ? (plural ?? `${singular}s`) : singular}`
}

export function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

/** Couleur de texte lisible dérivée d'une couleur d'accent (thème clair/sombre). */
export function tintText(color: string) {
  return `color-mix(in srgb, ${color} var(--tint-a), var(--tint-b))`
}

/** Fond translucide dérivé d'une couleur. */
export function tintBg(color: string, pct = 16) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

/** Beep de fin de repos (WebAudio, aucun asset requis). */
export function playBeep(times = 2) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const now = ctx.currentTime
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = i === times - 1 ? 1046 : 880
      gain.gain.setValueAtTime(0.0001, now + i * 0.22)
      gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.22 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.19)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.22)
      osc.stop(now + i * 0.22 + 0.2)
    }
    setTimeout(() => ctx.close(), 1200)
  } catch {
    /* silencieux */
  }
}

export function vibrate(pattern: number | number[] = 90) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* noop */
  }
}

/** État de l'autorisation « notifications » (ou 'unsupported'). */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  try {
    if (!('Notification' in window)) return 'unsupported'
    return Notification.permission
  } catch {
    return 'unsupported'
  }
}

/**
 * Notification système « repos terminé » (téléphone/PC, même écran éteint
 * côté Android). À n'appeler qu'après un geste ou un minuteur utilisateur :
 * silencieuse si l'autorisation n'est pas accordée (voir Réglages).
 */
export function showRestNotification(label?: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    new Notification('Repos terminé 💪', {
      body: label ? `${label} — à vous !` : 'À vous !',
      tag: 'veryhevy-rest',
      icon: './icon.svg',
      requireInteraction: true,
    })
  } catch {
    /* notifications indisponibles */
  }
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}