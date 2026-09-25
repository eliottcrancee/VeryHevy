/**
 * Social V1 : amis (Supabase).
 *
 * - Ajout par email exact (RPC find_user_by_email, aucun annuaire public).
 * - Si l'autre m'a déjà demandé → acceptation auto (pas de doublon inversé).
 * - Lecture des séances d'un ami accepté (RLS « friend workouts »).
 * - Les données d'un ami ne rentrent JAMAIS dans le store local.
 */
import type { Workout } from '@/types'
import { getSupabase } from './supabase'

export interface FriendProfile {
  id: string
  display_name: string | null
  avatar_url: string | null
}

export interface Friendship {
  id: string
  requester: string
  addressee: string
  status: 'pending' | 'accepted'
  created_at: string
  /** Profil de l'AUTRE personne (résolu côté client). */
  other?: FriendProfile
}

function supabaseOrThrow() {
  const sb = getSupabase()
  if (!sb) throw new Error('Cloud non configuré')
  return sb
}

async function myId(): Promise<string> {
  const sb = supabaseOrThrow()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) throw new Error('Non connecté')
  return session.user.id
}

/** Recherche un utilisateur par email exact (pseudo + avatar, jamais l'email). */
export async function findUserByEmail(email: string): Promise<FriendProfile | null> {
  const sb = supabaseOrThrow()
  const { data, error } = await sb.rpc('find_user_by_email', { search_email: email.trim() })
  if (error) throw new Error(`Recherche : ${error.message}`)
  const row = (data as FriendProfile[] | null)?.[0] ?? null
  return row
}

/** Toutes mes relations (demandes envoyées/reçues + amis), avec profils résolus. */
export async function listFriendships(): Promise<Friendship[]> {
  const sb = supabaseOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('friendships')
    .select('id,requester,addressee,status,created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Amis : ${error.message}`)
  const list = (data as Friendship[]) ?? []
  const ids = [...new Set(list.map((f) => (f.requester === me ? f.addressee : f.requester)))]
  const profiles = await fetchProfiles(ids)
  return list.map((f) => ({
    ...f,
    other: profiles.get(f.requester === me ? f.addressee : f.requester),
  }))
}

export async function fetchProfiles(ids: string[]): Promise<Map<string, FriendProfile>> {
  const map = new Map<string, FriendProfile>()
  if (!ids.length) return map
  const sb = supabaseOrThrow()
  const { data, error } = await sb.from('public_profiles').select('id,display_name,avatar_url').in('id', ids)
  if (error) throw new Error(`Profils : ${error.message}`)
  for (const p of (data as FriendProfile[]) ?? []) map.set(p.id, p)
  return map
}

/** Demande en ami (accepte auto si l'autre m'avait déjà demandé). */
export async function sendFriendRequest(addresseeId: string): Promise<'sent' | 'accepted'> {
  const sb = supabaseOrThrow()
  const me = await myId()
  if (addresseeId === me) throw new Error('Impossible de s’ajouter soi-même en ami')
  // Une relation existe déjà dans un sens ou l'autre ?
  const { data: existing, error: readErr } = await sb
    .from('friendships')
    .select('id,requester,addressee,status')
    .or(`and(requester.eq.${me},addressee.eq.${addresseeId}),and(requester.eq.${addresseeId},addressee.eq.${me})`)
    .limit(2)
  if (readErr) throw new Error(`Vérification : ${readErr.message}`)
  const rows = (existing as Friendship[]) ?? []
  if (rows.some((r) => r.status === 'accepted')) throw new Error('Vous êtes déjà amis')
  if (rows.some((r) => r.status === 'pending' && r.requester === me)) throw new Error('Demande déjà envoyée')
  const reverse = rows.find((r) => r.status === 'pending' && r.requester === addresseeId)
  if (reverse) {
    const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', reverse.id)
    if (error) throw new Error(`Acceptation : ${error.message}`)
    return 'accepted'
  }
  const { error } = await sb.from('friendships').insert({ requester: me, addressee: addresseeId, status: 'pending' })
  if (error) throw new Error(`Envoi : ${error.message}`)
  return 'sent'
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const sb = supabaseOrThrow()
  const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
  if (error) throw new Error(`Acceptation : ${error.message}`)
}

/** Refuser (demande reçue), annuler (demande envoyée) ou retirer (ami) : même suppression. */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const sb = supabaseOrThrow()
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId)
  if (error) throw new Error(`Suppression : ${error.message}`)
}

/** Dernières séances TERMINÉES d'un ami (lecture seule). */
export async function getFriendWorkouts(friendId: string, limit = 20): Promise<Workout[]> {
  const sb = supabaseOrThrow()
  const { data, error } = await sb
    .from('workouts')
    .select('data')
    .eq('user_id', friendId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(50, Math.max(1, limit)))
  if (error) throw new Error(`Séances de l’ami : ${error.message}`)
  return ((data as { data: Workout }[]) ?? [])
    .map((r) => r.data)
    .filter((w) => w && w.status === 'completed')
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
}

export function displayNameOf(p?: FriendProfile | null, fallback = 'Ami'): string {
  return p?.display_name?.trim() || fallback
}
