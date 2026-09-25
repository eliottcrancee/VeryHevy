import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type {
  GymBroGoal,
  GymBroLevel,
  GymBroMatch,
  GymBroMessage,
  GymBroPerson,
  GymBroSession,
  GymBroSlot,
} from '@/lib/gymbro'
import { GYMBRO_AUTOREPLIES, GYMBRO_SEED_PEOPLE, GYMBRO_SEED_SESSIONS } from '@/lib/gymbro'
import { uid } from '@/lib/utils'

export interface GymBroMyProfile {
  pseudo: string
  area: string
  level: GymBroLevel
  goals: GymBroGoal[]
  slots: GymBroSlot[]
  sessionsPerWeek: number
  bio: string
  avatar: string
  color: string
  canSpot: boolean
  visible: boolean
}

interface GymBroState {
  mine: GymBroMyProfile
  likes: string[]
  passes: string[]
  matches: GymBroMatch[]
  messages: Record<string, GymBroMessage[]>
  sessions: GymBroSession[]
  joinedSessions: string[]
  seededAt: string | null

  setMine: (patch: Partial<GymBroMyProfile>) => void
  toggleGoal: (g: GymBroGoal) => void
  toggleSlot: (s: GymBroSlot) => void
  ensureSeed: () => void
  like: (p: GymBroPerson) => boolean
  pass: (id: string) => void
  unmatch: (id: string) => void
  sendMessage: (personId: string, text: string) => void
  createSession: (input: {
    title: string
    date: string
    place: string
    area: string
    level: GymBroSession['level']
    spotsTotal: number
    tags: GymBroGoal[]
    description: string
  }) => string
  deleteSession: (id: string) => void
  joinSession: (id: string) => void
  leaveSession: (id: string) => void
  resetDemo: () => void
}

const DEFAULT_MINE: GymBroMyProfile = {
  pseudo: 'Toi',
  area: 'Centre-ville',
  level: 'intermédiaire',
  goals: ['hypertrophie', 'motivation', 'poids-libres'],
  slots: ['soir', 'week-end'],
  sessionsPerWeek: 4,
  bio: 'Cherche un gymbro régulier pour progresser, surtout poids libres en sécurité.',
  avatar: '💪',
  color: '#4f83ff',
  canSpot: true,
  visible: true,
}

const AVATARS = ['💪', '🦍', '🔥', '⚡', '🐻', '🦊', '🦁', '🌙']

export const useGymBro = create<GymBroState>()(
  persist(
    (set, get) => ({
      mine: DEFAULT_MINE,
      likes: [],
      passes: [],
      matches: [],
      messages: {},
      sessions: [],
      joinedSessions: [],
      seededAt: null,

      setMine: (patch) => set((s) => ({ mine: { ...s.mine, ...patch } })),
      toggleGoal: (g) =>
        set((s) => ({
          mine: {
            ...s.mine,
            goals: s.mine.goals.includes(g) ? s.mine.goals.filter((x) => x !== g) : [...s.mine.goals, g].slice(0, 4),
          },
        })),
      toggleSlot: (sl) =>
        set((s) => ({
          mine: {
            ...s.mine,
            slots: s.mine.slots.includes(sl) ? s.mine.slots.filter((x) => x !== sl) : [...s.mine.slots, sl],
          },
        })),

      ensureSeed: () => {
        if (get().seededAt) {
          // réinjecte les sessions seed manquantes (id stable)
          set((s) => {
            const known = new Set(s.sessions.map((x) => x.id))
            const missing = GYMBRO_SEED_SESSIONS.filter((x) => !known.has(x.id))
            return missing.length ? { sessions: [...missing, ...s.sessions] } : s
          })
          return
        }
        set({
          sessions: GYMBRO_SEED_SESSIONS.map((s) => ({ ...s })),
          seededAt: new Date().toISOString(),
        })
      },

      like: (p) => {
        const { likes, matches, messages } = get()
        if (likes.includes(p.id) || matches.some((m) => m.personId === p.id)) return matches.some((m) => m.personId === p.id)
        const isMatch = p.likesYou
        const at = new Date().toISOString()
        set({
          likes: [...likes, p.id],
          matches: isMatch ? [...matches, { personId: p.id, at }] : matches,
          messages: isMatch
            ? {
                ...messages,
                [p.id]: [
                  {
                    id: uid('m'),
                    fromMe: false,
                    text: `Salut ${get().mine.pseudo} ! Match 🤝 Chaud pour une séance ensemble cette semaine ?`,
                    at,
                  },
                ],
              }
            : messages,
        })
        return isMatch
      },

      pass: (id) => set((s) => (s.passes.includes(id) ? s : { passes: [...s.passes, id] })),

      unmatch: (id) =>
        set((s) => ({
          matches: s.matches.filter((m) => m.personId !== id),
          likes: s.likes.filter((x) => x !== id),
          passes: [...s.passes, id],
        })),

      sendMessage: (personId, text) => {
        const clean = text.trim()
        if (!clean) return
        const at = new Date().toISOString()
        const msg: GymBroMessage = { id: uid('m'), fromMe: true, text: clean, at }
        set((s) => ({
          messages: { ...s.messages, [personId]: [...(s.messages[personId] ?? []), msg] },
        }))
        // réponse démo locale (ambiance, pas de réseau)
        const person = GYMBRO_SEED_PEOPLE.find((p) => p.id === personId)
        if (person) {
          const reply = GYMBRO_AUTOREPLIES[Math.floor(Math.random() * GYMBRO_AUTOREPLIES.length)]
          setTimeout(() => {
            useGymBro.setState((s) => ({
              messages: {
                ...s.messages,
                [personId]: [...(s.messages[personId] ?? []), { id: uid('m'), fromMe: false, text: reply, at: new Date().toISOString() }],
              },
            }))
          }, 1200)
        }
      },

      createSession: (input) => {
        const { mine } = get()
        const id = uid('gs')
        const session: GymBroSession = {
          id,
          ...input,
          spotsTaken: 0,
          hostId: 'me',
          hostPseudo: mine.pseudo || 'Toi',
          hostAvatar: mine.avatar,
          hostColor: mine.color,
          mine: true,
        }
        set((s) => ({ sessions: [session, ...s.sessions] }))
        return id
      },

      deleteSession: (id) =>
        set((s) => ({
          sessions: s.sessions.filter((x) => x.id !== id),
          joinedSessions: s.joinedSessions.filter((x) => x !== id),
        })),

      joinSession: (id) =>
        set((s) => {
          if (s.joinedSessions.includes(id)) return s
          return {
            joinedSessions: [...s.joinedSessions, id],
            sessions: s.sessions.map((x) => (x.id === id ? { ...x, spotsTaken: Math.min(x.spotsTotal, x.spotsTaken + 1) } : x)),
          }
        }),

      leaveSession: (id) =>
        set((s) => ({
          joinedSessions: s.joinedSessions.filter((x) => x !== id),
          sessions: s.sessions.map((x) =>
            x.id === id ? { ...x, spotsTaken: Math.max(0, x.spotsTaken - 1) } : x,
          ),
        })),

      resetDemo: () =>
        set({
          likes: [],
          passes: [],
          matches: [],
          messages: {},
          sessions: GYMBRO_SEED_SESSIONS.map((s) => ({ ...s })),
          joinedSessions: [],
          seededAt: new Date().toISOString(),
        }),
    }),
    {
      name: 'veryhevy-gymbro-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        mine: s.mine,
        likes: s.likes,
        passes: s.passes,
        matches: s.matches,
        messages: s.messages,
        sessions: s.sessions,
        joinedSessions: s.joinedSessions,
        seededAt: s.seededAt,
      }),
    },
  ),
)

export { AVATARS }
export type { GymBroPerson }
