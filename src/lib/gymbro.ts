/* ------------------------------------------------------------------
   GymBro — rencontres de partenaires d'entraînement (100 % local,
   aucune salle scrapée : les lieux sont saisis librement).
------------------------------------------------------------------ */

export type GymBroLevel = 'débutant' | 'intermédiaire' | 'confirmé' | 'compétiteur'
export type GymBroGoal = 'force' | 'hypertrophie' | 'poids-libres' | 'pareur' | 'cardio' | 'mobilité' | 'motivation' | 'compétition'
export type GymBroSlot = 'matin' | 'midi' | 'soir' | 'week-end'

export const GYMBRO_LEVELS: GymBroLevel[] = ['débutant', 'intermédiaire', 'confirmé', 'compétiteur']

export const GYMBRO_GOALS: Record<GymBroGoal, { label: string; emoji: string }> = {
  force: { label: 'Force', emoji: '💪' },
  hypertrophie: { label: 'Hypertrophie', emoji: '🏋️' },
  'poids-libres': { label: 'Poids libres', emoji: '🏋️‍♂️' },
  pareur: { label: 'Pareur sécu', emoji: '🛡️' },
  cardio: { label: 'Cardio', emoji: '🏃' },
  mobilité: { label: 'Mobilité', emoji: '🧘' },
  motivation: { label: 'Motivation', emoji: '🔥' },
  compétition: { label: 'Compétition', emoji: '🥇' },
}

export const GYMBRO_SLOTS: Record<GymBroSlot, { label: string; emoji: string }> = {
  matin: { label: 'Matin', emoji: '🌅' },
  midi: { label: 'Midi', emoji: '☀️' },
  soir: { label: 'Soir', emoji: '🌙' },
  'week-end': { label: 'Week-end', emoji: '📅' },
}

export interface GymBroPerson {
  id: string
  pseudo: string
  age: number
  /** Quartier / ville saisi librement (démo). */
  area: string
  level: GymBroLevel
  goals: GymBroGoal[]
  slots: GymBroSlot[]
  sessionsPerWeek: number
  bio: string
  avatar: string
  color: string
  /** Le profil fictif vous a déjà liké → un like mutuel crée un match. */
  likesYou: boolean
  /** Le profil peut assurer la pare au bench / squat. */
  canSpot: boolean
  benchKg?: number
}

export interface GymBroSession {
  id: string
  title: string
  /** ISO */
  date: string
  /** Lieu saisi librement par l'organisateur, ex. « ma salle habituelle ». */
  place: string
  area: string
  level: GymBroLevel | 'tous'
  spotsTotal: number
  spotsTaken: number
  tags: GymBroGoal[]
  description: string
  hostId: string
  hostPseudo: string
  hostAvatar: string
  hostColor: string
  mine?: boolean
  joined?: boolean
}

export interface GymBroMessage {
  id: string
  fromMe: boolean
  text: string
  at: string
}

export interface GymBroMatch {
  personId: string
  at: string
}

export function gymbroCompat(mine: { goals: GymBroGoal[]; slots: GymBroSlot[]; level: GymBroLevel }, other: GymBroPerson): number {
  const goalOverlap = other.goals.filter((g) => mine.goals.includes(g)).length
  const slotOverlap = other.slots.filter((s) => mine.slots.includes(s)).length
  const levelBonus =
    mine.level === other.level ? 12 : Math.abs(GYMBRO_LEVELS.indexOf(mine.level) - GYMBRO_LEVELS.indexOf(other.level)) === 1 ? 6 : 0
  const score = 38 + Math.min(30, goalOverlap * 12) + Math.min(20, slotOverlap * 8) + levelBonus + (other.canSpot ? 4 : 0)
  return Math.max(42, Math.min(98, Math.round(score)))
}

export function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `Aujourd'hui · ${time}`
  if (isTomorrow) return `Demain · ${time}`
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`
}

function nextAt(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const GYMBRO_SEED_PEOPLE: GymBroPerson[] = [
  {
    id: 'gb-lina', pseudo: 'Lina', age: 27, area: 'Centre-ville', level: 'intermédiaire',
    goals: ['hypertrophie', 'motivation', 'mobilité'], slots: ['soir', 'week-end'], sessionsPerWeek: 4,
    bio: 'Team leg day 🦵 Cherche une partenaire régulière pour rester constante, ambiance sérieuse mais fun.',
    avatar: '🦊', color: '#f472b6', likesYou: true, canSpot: false, benchKg: 45,
  },
  {
    id: 'gb-mehdi', pseudo: 'Mehdi', age: 31, area: 'Nord gare', level: 'confirmé',
    goals: ['force', 'poids-libres', 'pareur'], slots: ['matin', 'week-end'], sessionsPerWeek: 5,
    bio: 'Bench 130, squat 170. Je pare proprement et je cherche un bro pour les grosses barres en sécurité.',
    avatar: '🦍', color: '#4f83ff', likesYou: true, canSpot: true, benchKg: 130,
  },
  {
    id: 'gb-sarah', pseudo: 'Sarah', age: 24, area: 'Quartier fac', level: 'débutant',
    goals: ['motivation', 'hypertrophie', 'cardio'], slots: ['midi', 'soir'], sessionsPerWeek: 3,
    bio: 'Reprise après 1 an d’arrêt. Je veux quelqu’un de patient pour m’entraîner 3×/sem sans pression.',
    avatar: '🌙', color: '#9333ea', likesYou: false, canSpot: false,
  },
  {
    id: 'gb-thomas', pseudo: 'Thomas', age: 29, area: 'Sud', level: 'intermédiaire',
    goals: ['poids-libres', 'force', 'pareur'], slots: ['soir'], sessionsPerWeek: 4,
    bio: 'Push/pull/legs. Dispo les soirs vers 19h, je peux parer au DC et au squat. Objectif 100 au bench.',
    avatar: '🐻', color: '#ea580c', likesYou: true, canSpot: true, benchKg: 95,
  },
  {
    id: 'gb-ines', pseudo: 'Inès', age: 26, area: 'Est', level: 'confirmé',
    goals: ['compétition', 'force', 'motivation'], slots: ['matin', 'midi'], sessionsPerWeek: 6,
    bio: 'Prépa powerlifting. Cherche partenaire matinale ultra régulière, technique et rigueur.',
    avatar: '⚡', color: '#eab308', likesYou: false, canSpot: true, benchKg: 85,
  },
  {
    id: 'gb-karim', pseudo: 'Karim', age: 34, area: 'Ouest', level: 'intermédiaire',
    goals: ['hypertrophie', 'cardio', 'motivation'], slots: ['week-end', 'soir'], sessionsPerWeek: 3,
    bio: 'Papa débordé, dispo week-end + 1 soir. Séances efficaces 1h, supersets et bonne humeur.',
    avatar: '🦁', color: '#16a34a', likesYou: false, canSpot: false, benchKg: 80,
  },
  {
    id: 'gb-chloe', pseudo: 'Chloé', age: 22, area: 'Centre-ville', level: 'débutant',
    goals: ['mobilité', 'motivation', 'cardio'], slots: ['matin', 'week-end'], sessionsPerWeek: 2,
    bio: 'Glutes + mobilité + un peu de cardio. Je débute les poids libres, cherche marraine chill.',
    avatar: '🌸', color: '#0d9488', likesYou: true, canSpot: false,
  },
  {
    id: 'gb-hugo', pseudo: 'Hugo', age: 30, area: 'Nord gare', level: 'compétiteur',
    goals: ['force', 'compétition', 'pareur'], slots: ['soir', 'week-end'], sessionsPerWeek: 5,
    bio: 'Strongman amateur 🪨 Log, yoke, farmers. Viens si tu veux tester le lourd en sécurité.',
    avatar: '🪨', color: '#78716c', likesYou: false, canSpot: true, benchKg: 150,
  },
]

export const GYMBRO_SEED_SESSIONS: GymBroSession[] = [
  {
    id: 'gs-push', title: 'Push lourd — pecs / épaules / triceps', date: nextAt(0, 19),
    place: 'Ma salle habituelle (précisée en match)', area: 'Centre-ville', level: 'tous',
    spotsTotal: 3, spotsTaken: 1, tags: ['poids-libres', 'pareur', 'hypertrophie'],
    description: 'DC barre + développé haltères + dips. Je peux parer, on tourne sur les charges. 1h15 max.',
    hostId: 'gb-mehdi', hostPseudo: 'Mehdi', hostAvatar: '🦍', hostColor: '#4f83ff',
  },
  {
    id: 'gs-legs', title: 'Leg day — squat & co', date: nextAt(1, 18, 30),
    place: 'À définir ensemble', area: 'Sud', level: 'intermédiaire',
    spotsTotal: 4, spotsTaken: 2, tags: ['force', 'motivation'],
    description: 'Squat lourd puis volume jambes. Niveau inter bienvenu, on s’adapte. Filles bienvenues 🦵',
    hostId: 'gb-lina', hostPseudo: 'Lina', hostAvatar: '🦊', hostColor: '#f472b6',
  },
  {
    id: 'gs-strong', title: 'Découverte strongman (log & farmers)', date: nextAt(2, 10),
    place: 'Box extérieur (adresse en privé)', area: 'Ouest', level: 'tous',
    spotsTotal: 6, spotsTaken: 3, tags: ['poids-libres', 'motivation', 'pareur'],
    description: 'Initiation sécurisée au matériel strongman. Zéro niveau requis, juste l’envie de forcer.',
    hostId: 'gb-hugo', hostPseudo: 'Hugo', hostAvatar: '🪨', hostColor: '#78716c',
  },
  {
    id: 'gs-morning', title: 'Upper matinal avant le taf', date: nextAt(1, 7, 15),
    place: 'Salle 24/7 du quartier', area: 'Nord gare', level: 'tous',
    spotsTotal: 2, spotsTaken: 0, tags: ['hypertrophie', 'motivation', 'cardio'],
    description: 'Séance 55 min chrono : dos/épaules + 10 min de finisher. Douche sur place.',
    hostId: 'gb-ines', hostPseudo: 'Inès', hostAvatar: '⚡', hostColor: '#eab308',
  },
]

export const GYMBRO_ICEBREAKERS = [
  'Salut ! Tu t’entraînes plutôt quels jours ? 💪',
  'Hello ! Chaud pour une séance test cette semaine ?',
  'Salut ! Tu cherches plutôt lourd / pareur ou régularité ?',
]

export const GYMBRO_AUTOREPLIES = [
  'Grave chaud ! Tu es dispo plutôt soir ou week-end ? 🔥',
  'Yes ! C’est quoi ton programme en ce moment ?',
  'Avec plaisir ! Séance test légère pour se jauger ? 🙂',
  'Top ! Je peux parer au bench si besoin 🛡️',
]
