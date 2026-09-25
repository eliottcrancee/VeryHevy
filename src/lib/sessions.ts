/**
 * Sessions carto (Explorer) : proposées sur la carte, publiques ou
 * privées sur invitation. Lieux = salles saisies par les users.
 */
import type { SocialProfile, SportSession } from '@/types'
import { getSupabase } from './supabase'
import { fetchSocialProfiles } from './social'

function sbOrThrow() {
  const sb = getSupabase()
  if (!sb) throw new Error('Cloud non configuré')
  return sb
}

async function myId(): Promise<string> {
  const sb = sbOrThrow()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) throw new Error('Non connecté')
  return session.user.id
}

async function enrich(list: SportSession[], me: string): Promise<SportSession[]> {
  if (!list.length) return list
  const hosts = await fetchSocialProfiles([...new Set(list.map((s) => s.host))])
  const sb = sbOrThrow()
  const { data: joins } = await sb
    .from('session_joins')
    .select('session_id')
    .eq('user_id', me)
    .in('session_id', list.map((s) => s.id))
  const joined = new Set(((joins as { session_id: string }[] ?? []).map((j) => j.session_id)))
  return list.map((s) => ({ ...s, host_profile: hosts.get(s.host) ?? null, joined_by_me: joined.has(s.id) }))
}

/** Sessions visibles à venir (publiques + mes privées/invitées/rejointes via RLS). */
export async function listSessions(limit = 200): Promise<SportSession[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('sessions')
    .select('*')
    .gte('starts_at', new Date(Date.now() - 3 * 3600 * 1000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Sessions : ${error.message}`)
  return enrich((data as SportSession[]) ?? [], me)
}

export async function createSession(input: {
  title: string
  gym_name: string
  address_text?: string
  lat: number
  lng: number
  starts_at: string
  spots_total: number
  level?: string
  description?: string
  visibility: 'public' | 'private'
  invited?: string[]
}): Promise<SportSession> {
  const sb = sbOrThrow()
  const me = await myId()
  const title = input.title.trim().slice(0, 80)
  if (!title) throw new Error('Titre requis')
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error('Point carte requis')
  const { data, error } = await sb
    .from('sessions')
    .insert({
      host: me,
      title,
      gym_name: input.gym_name.trim().slice(0, 120),
      address_text: (input.address_text ?? '').slice(0, 200),
      lat: input.lat,
      lng: input.lng,
      starts_at: input.starts_at,
      spots_total: Math.max(2, Math.min(8, input.spots_total)),
      level: input.level ?? 'tous',
      description: (input.description ?? '').slice(0, 500),
      visibility: input.visibility,
      invited: input.invited ?? [],
    })
    .select('*')
    .single()
  if (error) throw new Error(`Création : ${error.message}`)
  return data as SportSession
}

export async function joinSession(session: SportSession): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  if (session.host === me) return
  if (session.spots_taken >= session.spots_total) throw new Error('Session complète')
  const { error } = await sb.from('session_joins').insert({ session_id: session.id, user_id: me })
  if (error && !error.message.includes('duplicate')) throw new Error(`Inscription : ${error.message}`)
}

export async function leaveSession(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('session_joins').delete().eq('session_id', sessionId).eq('user_id', me)
  if (error) throw new Error(`Désinscription : ${error.message}`)
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('sessions').delete().eq('id', sessionId)
  if (error) throw new Error(`Suppression : ${error.message}`)
}

/** Inviter des abonnés à une session privée (host uniquement). */
export async function inviteToSession(sessionId: string, userIds: string[]): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('sessions').update({ invited: userIds }).eq('id', sessionId)
  if (error) throw new Error(`Invitation : ${error.message}`)
}

/** Personnes que je suis + qui me suivent (candidats à l'invitation). */
export async function listInviteCandidates(): Promise<SocialProfile[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const [a, b] = await Promise.all([
    sb.from('follows').select('followed').eq('follower', me),
    sb.from('follows').select('follower').eq('followed', me),
  ])
  if (a.error) throw new Error(`Contacts : ${a.error.message}`)
  if (b.error) throw new Error(`Contacts : ${b.error.message}`)
  const ids = [...new Set([
    ...((a.data as { followed: string }[] ?? []).map((r) => r.followed)),
    ...((b.data as { follower: string }[] ?? []).map((r) => r.follower)),
  ])].filter((id) => id !== me)
  return [...(await fetchSocialProfiles(ids)).values()]
}

/* ------------------------- géocodage OSM ------------------------- */

export interface PlaceResult {
  label: string
  lat: number
  lng: number
}

/** Recherche salle/ville via Nominatim OSM (limite courtoise, debouncée côté UI). */
export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=fr&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Recherche de lieu impossible')
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[]
  return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
}
