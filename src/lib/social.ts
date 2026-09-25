/**
 * VeryHevy V2 — social minimal (Étape A).
 * Profils + follows type Instagram. Posts/sessions arrivent en C/D.
 */
import type { SocialProfile } from '@/types'
import { normalizeUsername } from '@/types'
import { getSupabase } from './supabase'

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

/** Mon profil (ligne profiles). Null si aucune ligne (ancien compte). */
export async function getMyProfile(): Promise<SocialProfile | null> {
  const sb = sbOrThrow()
  const id = await myId()
  const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Profil : ${error.message}`)
  return (data as SocialProfile | null) ?? null
}

/** Pseudo déjà pris ? (insensible à la casse). */
export async function isUsernameAvailable(wanted: string): Promise<boolean> {
  const sb = sbOrThrow()
  const clean = normalizeUsername(wanted)
  if (!clean) return false
  const { data, error } = await sb.rpc('is_username_available', { wanted: clean })
  if (error) throw new Error(`Pseudo : ${error.message}`)
  return Boolean(data)
}

/** Réserve mon pseudo (onboarding /bienvenue). Crée la ligne si absente. */
export async function claimUsername(wanted: string): Promise<SocialProfile> {
  const sb = sbOrThrow()
  const id = await myId()
  const username = normalizeUsername(wanted)
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    throw new Error('Pseudo : 3-20 caractères, minuscules, chiffres, . ou _')
  }
  const { data: { user } } = await sb.auth.getUser()
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const display =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    (user?.email?.split('@')[0] ?? 'Sportif')
  const avatar =
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined) ??
    null
  const { data, error } = await sb
    .from('profiles')
    .upsert(
      { id, username, display_name: display, avatar_url: avatar, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select('*')
    .single()
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      throw new Error('Ce pseudo est déjà pris')
    }
    throw new Error(`Pseudo : ${error.message}`)
  }
  return data as SocialProfile
}

/** Profil par pseudo exact (page /profil/:username). */
export async function fetchProfileByUsername(username: string): Promise<SocialProfile | null> {
  const sb = sbOrThrow()
  const clean = normalizeUsername(username)
  if (!clean) return null
  const { data, error } = await sb.from('profiles').select('*').ilike('username', clean).maybeSingle()
  if (error) throw new Error(`Profil : ${error.message}`)
  return (data as SocialProfile | null) ?? null
}

/** Recherche floue par pseudo : suggestions qui contiennent la saisie. */
export async function searchProfiles(query: string, limit = 8): Promise<SocialProfile[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const clean = normalizeUsername(query).replace(/[%_]/g, '')
  if (clean.length < 2) return []
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .not('username', 'is', null)
    .neq('id', me)
    .ilike('username', `%${clean}%`)
    .order('followers_count', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Recherche : ${error.message}`)
  return (data as SocialProfile[]) ?? []
}

/** MAJ de mon profil (bio, ville, visibilité, pseudo, nom affiché). */
export async function updateMyProfile(
  patch: Partial<Pick<SocialProfile, 'bio' | 'city' | 'visibility' | 'username' | 'display_name' | 'avatar_url'>>,
): Promise<SocialProfile> {
  const sb = sbOrThrow()
  const id = await myId()
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.bio !== undefined) clean.bio = patch.bio?.slice(0, 160) ?? null
  if (patch.city !== undefined) clean.city = patch.city?.slice(0, 80) ?? null
  if (patch.visibility !== undefined) clean.visibility = patch.visibility
  if (patch.display_name !== undefined) clean.display_name = patch.display_name?.slice(0, 60) ?? null
  if (patch.avatar_url !== undefined) clean.avatar_url = patch.avatar_url
  if (patch.username !== undefined) {
    if (patch.username === null) throw new Error('Pseudo requis')
    const username = normalizeUsername(patch.username)
    if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
      throw new Error('Pseudo : 3-20 caractères, minuscules, chiffres, . ou _')
    }
    clean.username = username
  }
  const { data, error } = await sb.from('profiles').update(clean).eq('id', id).select('*').single()
  if (error) {
    if (error.message.includes('duplicate') || error.message.includes('unique')) {
      throw new Error('Ce pseudo est déjà pris')
    }
    throw new Error(`Profil : ${error.message}`)
  }
  return data as SocialProfile
}

/** Ids des comptes que je suis (recommandations, badges Ami). */
export async function listMyFollowIds(): Promise<Set<string>> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb.from('follows').select('followed').eq('follower', me)
  if (error) throw new Error(`Follows : ${error.message}`)
  return new Set(((data as { followed: string }[] ?? []).map((f) => f.followed)))
}

/** Profils par ids (pseudo/avatar, jamais l'email). */
export async function fetchSocialProfiles(ids: string[]): Promise<Map<string, SocialProfile>> {
  const map = new Map<string, SocialProfile>()
  if (!ids.length) return map
  const sb = sbOrThrow()
  const { data, error } = await sb.from('profiles').select('*').in('id', ids)
  if (error) throw new Error(`Profils : ${error.message}`)
  for (const p of (data as SocialProfile[]) ?? []) map.set(p.id, p)
  return map
}

/** Suivre (compte public) : direct. Conservé pour compat interne. */
export async function followUser(targetId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  if (targetId === me) throw new Error('Impossible de se suivre soi-même')
  const { error } = await sb.from('follows').insert({ follower: me, followed: targetId })
  if (error && !error.message.includes('duplicate')) throw new Error(`Suivre : ${error.message}`)
}

export type FollowState = 'following' | 'requested' | 'none'

/** État de ma relation avec target. */
export async function followStatus(targetId: string): Promise<FollowState> {
  if (await amIFollowing(targetId)) return 'following'
  const sb = sbOrThrow()
  const me = await myId()
  const { data } = await sb
    .from('follow_requests')
    .select('requester')
    .eq('requester', me)
    .eq('target', targetId)
    .maybeSingle()
  return data ? 'requested' : 'none'
}

/**
 * Suivre : direct si le compte est public, demande d'ami + notification
 * si le compte est privé. Retourne l'état résultant.
 */
export async function requestFollow(targetId: string): Promise<FollowState> {
  const sb = sbOrThrow()
  const me = await myId()
  if (targetId === me) throw new Error('Impossible de se suivre soi-même')
  const { data: target } = await sb
    .from('profiles')
    .select('visibility,username')
    .eq('id', targetId)
    .maybeSingle()
  const t = target as { visibility: string | null; username: string | null } | null
  const { myUsername, sendNotification } = await import('./notifications')
  const mine = await myUsername()
  if (t?.visibility === 'private') {
    const { error } = await sb.from('follow_requests').insert({ requester: me, target: targetId })
    if (error && !error.message.includes('duplicate')) throw new Error(`Demande : ${error.message}`)
    await sendNotification(targetId, 'follow_request', { from_id: me, from_username: mine })
    return 'requested'
  }
  await followUser(targetId)
  await sendNotification(targetId, 'new_follower', { from_id: me, from_username: mine })
  return 'following'
}

export async function unfollowUser(targetId: string): Promise<void> {
  const sb = sbOrThrow()
  const me = await myId()
  const { error } = await sb.from('follows').delete().eq('follower', me).eq('followed', targetId)
  if (error) throw new Error(`Ne plus suivre : ${error.message}`)
}

/** Est-ce que je suis target ? */
export async function amIFollowing(targetId: string): Promise<boolean> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('follows')
    .select('followed')
    .eq('follower', me)
    .eq('followed', targetId)
    .maybeSingle()
  if (error) throw new Error(`Follow : ${error.message}`)
  return Boolean(data)
}
