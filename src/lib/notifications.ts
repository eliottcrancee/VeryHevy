/**
 * Centre de notifications : demandes d'amis (comptes privés),
 * candidatures séances, accepts. La cloche affiche un point rouge
 * tant qu'il reste des non-lues.
 */
import type { AppNotification, FollowRequest } from '@/types'
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

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', me)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(t('chat.errNotifications', { msg: error.message }))
  return (data as AppNotification[]) ?? []
}

export async function countUnread(): Promise<number> {
  const sb = sbOrThrow()
  const me = await myId()
  const { count, error } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me)
    .is('read_at', null)
  if (error) return 0
  return count ?? 0
}

export async function countUnreadMessages(): Promise<number> {
  const sb = sbOrThrow()
  const me = await myId()
  const { count, error } = await sb.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me).eq('type', 'message').is('read_at', null)
  if (error) return 0
  return count ?? 0
}

export async function markMessagesRead(otherId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  await sb.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', me).eq('type', 'message').is('read_at', null)
    .contains('payload', { from_id: otherId })
}

export async function markAllRead(): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', me)
    .is('read_at', null)
  if (error) throw new Error(t('chat.errNotifications', { msg: error.message }))
}

export async function markOneRead(id: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', me)
}

/* ------------------------- demandes d'amis ------------------------- */

export async function listIncomingFollowRequests(): Promise<FollowRequest[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('follow_requests')
    .select('*')
    .eq('target', me)
    .order('created_at', { ascending: false })
  if (error) throw new Error(t('chat.errDemands', { msg: error.message }))
  const list = (data as FollowRequest[]) ?? []
  const profiles = await fetchSocialProfiles([...new Set(list.map((r) => r.requester))])
  return list.map((r) => ({ ...r, profile: profiles.get(r.requester) ?? null }))
}

export async function listOutgoingFollowRequests(): Promise<FollowRequest[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('follow_requests')
    .select('*')
    .eq('requester', me)
    .order('created_at', { ascending: false })
  if (error) throw new Error(t('chat.errDemands', { msg: error.message }))
  const list = (data as FollowRequest[]) ?? []
  const profiles = await fetchSocialProfiles([...new Set(list.map((r) => r.target))])
  return list.map((r) => ({ ...r, profile: profiles.get(r.target) ?? null }))
}

/** Accepter (je suis le destinataire) : crée le follow via RPC. */
export async function acceptFollowRequest(requesterId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.rpc('accept_follow_request', { req: requesterId })
  if (error) throw new Error(t('chat.errAccept', { msg: error.message }))
}

/** Refuser (je suis le destinataire). */
export async function declineFollowRequest(requesterId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('follow_requests').delete().eq('requester', requesterId).eq('target', me)
  if (error) throw new Error(t('chat.errDecline', { msg: error.message }))
}

/** Annuler ma demande envoyée. */
export async function cancelFollowRequest(targetId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('follow_requests').delete().eq('requester', me).eq('target', targetId)
  if (error) throw new Error(t('chat.errCancel', { msg: error.message }))
}
