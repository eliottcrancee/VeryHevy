/**
 * Sessions carto (Explorer) : 3 types — invite (privée, invités seuls),
 * open (sur proposition, hôte anonyme), public (demande + validation).
 */
import type { SessionVisibility, SocialProfile, SportSession } from '@/types'
import { getSupabase } from './supabase'
import { fetchSocialProfiles } from './social'
import { t } from './i18n'

function sbOrThrow() {
  const sb = getSupabase()
  if (!sb) throw new Error(t('session.errCloud'))
  return sb
}

async function myId(): Promise<string> {
  const sb = sbOrThrow()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) throw new Error(t('session.errNotLogged'))
  return session.user.id
}

/** Une séance est "passée" 3 h après son début (fin de la découverte). */
export const SESSION_PAST_AFTER_MS = 3 * 3600 * 1000

export function isSessionPast(s: Pick<SportSession, 'starts_at'>): boolean {
  return new Date(s.starts_at).getTime() < Date.now() - SESSION_PAST_AFTER_MS
}

async function enrich(list: SportSession[], me: string): Promise<SportSession[]> {
  if (!list.length) return list
  const hosts = await fetchSocialProfiles([...new Set(list.map((s) => s.host).filter(Boolean))])
  const sb = sbOrThrow()
  const { data: joins } = await sb
    .from('session_joins')
    .select('session_id')
    .eq('user_id', me)
    .in('session_id', list.map((s) => s.id))
  const joined = new Set(((joins as { session_id: string }[] ?? []).map((j) => j.session_id)))
  return list.map((s) => {
    const member = s.host === me || joined.has(s.id)
    // Anonymat des sessions "sur proposition" : l'hôte n'est révélé
    // qu'aux membres (et à lui-même). Les autres voient "anonyme".
    const host_profile = s.visibility === 'open' && !member ? null : (hosts.get(s.host) ?? null)
    return { ...s, host_profile, joined_by_me: joined.has(s.id) }
  })
}

/** Sessions visibles à venir (open/public + mes invite/rejointes via RLS). */
export async function listSessions(): Promise<SportSession[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const all: SportSession[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await sb.rpc('visible_sessions', { p_limit: 500, p_offset: offset })
    if (error) throw new Error(t('session.errList', { msg: error.message }))
    const page = (data as SportSession[]) ?? []
    all.push(...page)
    if (page.length < 500) break
  }
  return enrich(all, me)
}

/** Séances passées me concernant (créées ou rejointes) : historique. */
export async function listPastSessions(limit = 100): Promise<SportSession[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb.rpc('visible_sessions', { p_past: true, p_limit: limit })
  if (error) throw new Error(t('session.errList', { msg: error.message }))
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
  visibility: SessionVisibility
}): Promise<SportSession> {
  const sb = sbOrThrow()
  const me = await myId()
  const title = input.title.trim().slice(0, 80)
  if (!title) throw new Error(t('session.errTitleRequired'))
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error(t('session.errPointRequired'))
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
    })
    .select('id,title,gym_name,lat,lng,starts_at,spots_total,spots_taken,level,description,visibility,created_at')
    .single()
  if (error) throw new Error(t('session.errCreate', { msg: error.message }))
  return { ...(data as SportSession), host: me, address_text: input.address_text ?? '' }
}

export async function leaveSession(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('session_joins').delete().eq('session_id', sessionId).eq('user_id', me)
  if (error) throw new Error(t('session.errLeave', { msg: error.message }))
}

export async function updateSession(sessionId: string, input: Pick<SportSession,
  'title' | 'gym_name' | 'address_text' | 'starts_at' | 'spots_total' | 'level' | 'description' | 'visibility'>): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('sessions').update({
    title: input.title.trim().slice(0, 80),
    gym_name: input.gym_name.trim().slice(0, 120),
    address_text: input.address_text.trim().slice(0, 200),
    starts_at: input.starts_at,
    spots_total: input.spots_total,
    level: input.level,
    description: input.description.trim().slice(0, 500),
    visibility: input.visibility,
  }).eq('id', sessionId)
  if (error) throw new Error(t('session.errUpdate', { msg: error.message }))
}

export async function deleteSession(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('sessions').delete().eq('id', sessionId)
  if (error) throw new Error(t('session.errDelete', { msg: error.message }))
}

/** Personnes que je suis + qui me suivent (candidats à l'invitation). */
export async function listInviteCandidates(): Promise<SocialProfile[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const [a, b] = await Promise.all([
    sb.from('follows').select('followed').eq('follower', me),
    sb.from('follows').select('follower').eq('followed', me),
  ])
  if (a.error) throw new Error(t('session.errContacts', { msg: a.error.message }))
  if (b.error) throw new Error(t('session.errContacts', { msg: b.error.message }))
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
  if (!res.ok) throw new Error(t('session.errPlaceSearch'))
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[]
  return rows.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
}
