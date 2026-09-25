import type { Post, SocialProfile, SportSession } from '@/types'
import { listDiscoverPosts, listFeed, listMyPosts } from './posts'
import { listSessions } from './sessions'
import { getMyProfile } from './social'

const MAX_AGE_MS = 60_000

type CacheEntry<T> = { value?: T; at: number; pending?: Promise<T> }
const cache = new Map<string, CacheEntry<unknown>>()

function peek<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined
}

function load<T>(key: string, fetcher: () => Promise<T>, refresh = false): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (entry?.pending) return entry.pending
  if (!refresh && entry?.value !== undefined && Date.now() - entry.at < MAX_AGE_MS) {
    return Promise.resolve(entry.value)
  }
  const pending = fetcher().then((value) => {
    cache.set(key, { value, at: Date.now() })
    return value
  }).catch((error) => {
    if (entry?.value !== undefined) cache.set(key, entry)
    else cache.delete(key)
    throw error
  })
  cache.set(key, { value: entry?.value, at: entry?.at ?? 0, pending })
  return pending
}

export type HomePreview = { posts: Post[]; discover: Post[] }

export const peekHome = (uid: string) => peek<HomePreview>(`home:${uid}`)
export const loadHome = (uid: string, refresh = false) => load(`home:${uid}`, async () => {
  const posts = await listFeed(20, 0)
  return { posts, discover: posts.length ? [] : await listDiscoverPosts() }
}, refresh)

export const peekSessions = (uid: string) => peek<SportSession[]>(`sessions:${uid}`)
export const loadSessions = (uid: string, refresh = false) =>
  load(`sessions:${uid}`, listSessions, refresh)

export const peekMyProfile = (uid: string) => peek<SocialProfile | null>(`profile:${uid}`)
export const loadMyProfile = (uid: string, refresh = false) =>
  load(`profile:${uid}`, getMyProfile, refresh)

export const peekMyPosts = (uid: string) => peek<Post[]>(`my-posts:${uid}`)
export const loadMyPosts = (uid: string, refresh = false) =>
  load(`my-posts:${uid}`, () => listMyPosts(20, 0), refresh)
