/**
 * Match + chat : candidatures/demandes sur sessions open/public,
 * invitations sur sessions invite, discussion 1-1. Anonymat : inscrits
 * visibles par les membres uniquement (+ profils publics via RPC).
 */
import type { SocialProfile } from '@/types'
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

export interface SessionRequest {
  session_id: string
  user_id: string
  message: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  author?: SocialProfile | null
}

/* ---------------------------- candidatures ---------------------------- */

export async function sendRequest(sessionId: string, message = ''): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('session_requests').insert({
    session_id: sessionId,
    user_id: me,
    message: message.trim().slice(0, 280),
    status: 'pending',
  })
  if (error && !error.message.includes('duplicate')) throw new Error(`Demande : ${error.message}`)
}

export async function myRequestStatus(sessionId: string): Promise<SessionRequest | null> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('session_requests')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', me)
    .maybeSingle()
  if (error) throw new Error(`Demande : ${error.message}`)
  return (data as SessionRequest | null) ?? null
}

export async function withdrawRequest(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('session_requests').delete().eq('session_id', sessionId).eq('user_id', me)
  if (error) throw new Error(`Retrait : ${error.message}`)
}

export async function listRequests(sessionId: string): Promise<SessionRequest[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb
    .from('session_requests')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Candidatures : ${error.message}`)
  const list = (data as SessionRequest[]) ?? []
  const authors = await fetchSocialProfiles([...new Set(list.map((r) => r.user_id))])
  return list.map((r) => ({ ...r, author: authors.get(r.user_id) ?? null }))
}

/** Accepter = inscrit le membre (compteur auto via trigger). */
export async function acceptRequest(sessionId: string, userId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error: jErr } = await sb.from('session_joins').insert({ session_id: sessionId, user_id: userId })
  if (jErr && !jErr.message.includes('duplicate')) throw new Error(`Acceptation : ${jErr.message}`)
  const { error } = await sb
    .from('session_requests')
    .update({ status: 'accepted' })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
  if (error) throw new Error(`Acceptation : ${error.message}`)
}

export async function declineRequest(sessionId: string, userId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb
    .from('session_requests')
    .update({ status: 'declined' })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
  if (error) throw new Error(`Refus : ${error.message}`)
}

/* ---------------------------- invitations ---------------------------- */
/* Sessions invite (📩 Entre amis) : l'hôte invite → notif → accept (direct). */

export interface SessionInvite {
  session_id: string
  user_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  author?: SocialProfile | null
}

/** Inviter (hôte) + notifier l'invité. */
export async function sendInvite(sessionId: string, userId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('session_invites').insert({
    session_id: sessionId,
    user_id: userId,
    status: 'pending',
  })
  if (error && !error.message.includes('duplicate')) throw new Error(`Invitation : ${error.message}`)
}

export interface MyInvite {
  invite: SessionInvite
  session: { id: string; title: string; starts_at: string; gym_name: string }
  host: SocialProfile | null
}

/** Mes invitations en attente (sessions privées d'amis). */
export async function listMyInvites(): Promise<MyInvite[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('session_invites')
    .select('*')
    .eq('user_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Invitations : ${error.message}`)
  const invites = (data as SessionInvite[]) ?? []
  if (!invites.length) return []
  const rows = await Promise.all(invites.map((i) =>
    sb.rpc('visible_sessions', { p_session_id: i.session_id }),
  ))
  const list = rows.flatMap((r) => (r.data as { id: string; title: string; starts_at: string; gym_name: string; host: string }[] | null) ?? [])
  const hosts = await fetchSocialProfiles([...new Set(list.map((s) => s.host))])
  const byId = new Map(list.map((s) => [s.id, s]))
  return invites.flatMap((inv) => {
    const s = byId.get(inv.session_id)
    if (!s) return []
    return [{ invite: inv, session: s, host: hosts.get(s.host) ?? null }]
  })
}

/** Invités d'une session (hôte) : pending d'abord, avec profils. */
export async function listSessionInvites(sessionId: string): Promise<SessionInvite[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb
    .from('session_invites')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Invités : ${error.message}`)
  const list = (data as SessionInvite[]) ?? []
  const authors = await fetchSocialProfiles([...new Set(list.map((r) => r.user_id))])
  return list.map((r) => ({ ...r, author: authors.get(r.user_id) ?? null }))
}

/** Mon statut d'invitation sur une session (ou null). */
export async function myInviteStatus(sessionId: string): Promise<SessionInvite | null> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('session_invites')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', me)
    .maybeSingle()
  if (error) throw new Error(`Invitation : ${error.message}`)
  return (data as SessionInvite | null) ?? null
}

/** Accepter une invitation : statut + inscription directe. */
export async function acceptInvite(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error: uErr } = await sb
    .from('session_invites')
    .update({ status: 'accepted' })
    .eq('session_id', sessionId)
    .eq('user_id', me)
  if (uErr) throw new Error(`Acceptation : ${uErr.message}`)
  const { error: jErr } = await sb.from('session_joins').insert({ session_id: sessionId, user_id: me })
  if (jErr && !jErr.message.includes('duplicate')) throw new Error(`Inscription : ${jErr.message}`)
}

/** Refuser une invitation (+ notifie l'hôte). */
export async function declineInvite(sessionId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb
    .from('session_invites')
    .update({ status: 'declined' })
    .eq('session_id', sessionId)
    .eq('user_id', me)
  if (error) throw new Error(`Refus : ${error.message}`)
}

/** Retirer une invitation (hôte). */
export async function cancelInvite(sessionId: string, userId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('session_invites').delete().eq('session_id', sessionId).eq('user_id', userId)
  if (error) throw new Error(`Retrait : ${error.message}`)
}

export interface MyPendingRequest {
  request: SessionRequest
  session: { id: string; title: string; starts_at: string; gym_name: string; visibility: string }
}

/** Mes candidatures/demandes en attente (toutes sessions). */
export async function listMyPendingRequests(): Promise<MyPendingRequest[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('session_requests')
    .select('*')
    .eq('user_id', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Demandes : ${error.message}`)
  const reqs = (data as SessionRequest[]) ?? []
  if (!reqs.length) return []
  const { data: sessions } = await sb
    .from('sessions')
    .select('id,title,starts_at,gym_name,visibility')
    .in('id', reqs.map((r) => r.session_id))
  const byId = new Map(
    ((sessions as MyPendingRequest['session'][] ?? [])).map((s) => [s.id, s]),
  )
  return reqs.flatMap((request) => {
    const session = byId.get(request.session_id)
    if (!session) return []
    return [{ request, session }]
  })
}

/* ------------------------------ membres ------------------------------ */

export interface SessionMember {
  user_id: string
  profile: SocialProfile | null
  /** Candidature d'origine (message de présentation). */
  requestMessage?: string
}

/** Inscrits avec profils (hôte + membres uniquement, cf. RLS). */
export async function listMembers(sessionId: string): Promise<SessionMember[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb.from('session_joins').select('user_id').eq('session_id', sessionId)
  if (error) throw new Error(`Membres : ${error.message}`)
  const ids = ((data as { user_id: string }[] ?? []).map((r) => r.user_id))
  if (!ids.length) return []
  const [profiles, reqs] = await Promise.all([
    fetchSocialProfiles(ids),
    sb.from('session_requests').select('user_id,message').eq('session_id', sessionId).in('user_id', ids),
  ])
  const msgs = new Map(((reqs.data as { user_id: string; message: string }[] ?? []).map((r) => [r.user_id, r.message])))
  return ids.map((id) => ({ user_id: id, profile: profiles.get(id) ?? null, requestMessage: msgs.get(id) }))
}

/** Participants au profil public (teaser, tout connecté). */
export async function listPublicParticipants(sessionId: string): Promise<SocialProfile[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb.rpc('session_public_participants', { sid: sessionId })
  if (error) return []
  return ((data as { user_id: string; username: string; display_name: string; avatar_url: string }[] ?? []).map((r) => ({
    id: r.user_id,
    username: r.username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    followers_count: 0,
    following_count: 0,
  })))
}

/* ------------------------------- chat ------------------------------- */
/* Conversations par paire d'utilisateurs : la session n'est qu'un
   contexte d'ouverture (titre affiché). Supprimer une session ne
   supprime plus la discussion (session_id SET NULL). */

export interface ChatMessage {
  id: string
  session_id: string | null
  from_id: string
  to_id: string
  text: string
  created_at: string
}

export interface Thread {
  session_id: string | null
  session_title: string
  other_id: string
  other: SocialProfile | null
  last: ChatMessage
  count: number
}

/** Mes conversations (1 par correspondant, dernier message d'abord). */
export async function listThreads(): Promise<Thread[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const all: ChatMessage[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await sb.from('messages').select('*')
      .or(`from_id.eq.${me},to_id.eq.${me}`)
      .order('created_at', { ascending: false }).range(offset, offset + 499)
    if (error) throw new Error(`Messages : ${error.message}`)
    const page = (data as ChatMessage[]) ?? []
    all.push(...page)
    if (page.length < 500) break
  }
  const byOther = new Map<string, ChatMessage[]>()
  for (const m of all) {
    const other = m.from_id === me ? m.to_id : m.from_id
    const entry = byOther.get(other) ?? []
    entry.push(m)
    byOther.set(other, entry)
  }
  const sessionIds = [...new Set(all.map((m) => m.session_id).filter((s): s is string => Boolean(s)))]
  const [{ data: sess }, profiles] = await Promise.all([
    sessionIds.length
      ? sb.from('sessions').select('id,title').in('id', sessionIds)
      : Promise.resolve({ data: [] }),
    fetchSocialProfiles([...byOther.keys()]),
  ])
  const titles = new Map(((sess as { id: string; title: string }[] ?? []).map((s) => [s.id, s.title])))
  return [...byOther.entries()].map(([other, msgs]) => {
    const sid = msgs[0]?.session_id ?? null
    return {
      session_id: sid,
      session_title: sid ? (titles.get(sid) ?? 'Séance supprimée') : 'Message direct',
      other_id: other,
      other: profiles.get(other) ?? null,
      last: msgs[0],
      count: msgs.length,
    }
  })
}

/** Discussion avec un correspondant (toutes sessions confondues). */
export async function listMessages(otherId: string, limit = 200): Promise<ChatMessage[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('messages')
    .select('*')
    .or(`and(from_id.eq.${me},to_id.eq.${otherId}),and(from_id.eq.${otherId},to_id.eq.${me})`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Discussion : ${error.message}`)
  return ((data as ChatMessage[]) ?? []).reverse()
}

/** Envoyer (sessionId optionnel : simple contexte). Repli sans session
 *  si celle-ci a été supprimée entre-temps (FK). */
export async function sendMessage(toId: string, text: string, sessionId?: string | null): Promise<ChatMessage> {
  const sb = sbOrThrow()
  const me = await myId()
  const clean = text.trim().slice(0, 1000)
  if (!clean) throw new Error('Message vide')
  const attempt = async (sid: string | null) => {
    const { data, error } = await sb
      .from('messages')
      .insert({ session_id: sid, from_id: me, to_id: toId, text: clean })
      .select('*')
      .single()
    if (error) throw error
    return data as ChatMessage
  }
  try {
    return await attempt(sessionId ?? null)
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    if (sessionId && /foreign key|violates|session/i.test(msg)) {
      try {
        return await attempt(null)
      } catch {
        /* fallthrough : erreur d'origine ci-dessous */
      }
    }
    throw new Error(`Envoi : ${msg || 'impossible'}`)
  }
}

export function displayNameOf(p?: SocialProfile | null, fallback = 'Sportif'): string {
  return p?.display_name?.trim() || (p?.username ? `@${p.username}` : fallback)
}
