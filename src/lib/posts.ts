/**
 * Posts & feed : photo optionnelle (Storage post-photos), likes,
 * commentaires, snapshot workout pour réutiliser une séance.
 */
import type { Post, PostComment, PostPhoto, PostVisibility, Routine, SocialProfile, Workout, WorkoutSnapshot } from '@/types'
import { getSupabase } from './supabase'
import { t } from './i18n'
import { fetchSocialProfiles } from './social'
import { workoutDurationSeconds, workoutSets, workoutVolume } from './calc'

function sbOrThrow() {
  const sb = getSupabase()
  if (!sb) throw new Error(t('lib.cloudOff'))
  return sb
}

async function myId(): Promise<string> {
  const sb = sbOrThrow()
  const { data: { session } } = await sb.auth.getSession()
  if (!session?.user) throw new Error(t('lib.notConnected'))
  return session.user.id
}

/* ------------------------------ photo ------------------------------ */

/** Redimensionne côté client (max 1600px, JPEG 0.82) pour limiter le poids. */
export function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error(t('lib.noCanvas')))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t('lib.compressFailed')))), 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(t('lib.imageUnreadable')))
    }
    img.src = url
  })
}

async function uploadPostPhoto(file: File, userId: string): Promise<string> {
  const sb = sbOrThrow()
  if (file.size > 8 * 1024 * 1024) throw new Error(t('lib.photoHeavy'))
  const blob = await compressImage(file)
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await sb.storage.from('post-photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(t('lib.uploadError', { msg: error.message }))
  return path
}

function photoPath(value: string | null | undefined): string | null {
  if (!value) return null
  const marker = '/post-photos/'
  const at = value.indexOf(marker)
  return at >= 0 ? decodeURIComponent(value.slice(at + marker.length).split('?')[0]) : value
}

async function withSignedPhotos(posts: Post[]): Promise<Post[]> {
  const storage = sbOrThrow().storage.from('post-photos')
  return Promise.all(posts.map(async (post) => {
    const path = photoPath(post.photo_url)
    if (!path) return post
    const { data, error } = await storage.createSignedUrl(path, 3600)
    return { ...post, photo_url: error ? null : data.signedUrl }
  }))
}

/* ------------------------------ posts ------------------------------ */

export function buildWorkoutSnapshot(w: Workout): WorkoutSnapshot {
  const doneExercises = w.exercises.map((we) => ({ ...we, sets: we.sets.filter((s) => s.completed) }))
  const done = { ...w, exercises: doneExercises }
  return {
    name: w.name,
    sets: workoutSets(done),
    volume: workoutVolume(done),
    seconds: workoutDurationSeconds(w),
    exercises: doneExercises
      .filter((we) => we.sets.length > 0)
      .map((we) => ({
        exerciseId: we.exerciseId,
        name: we.exerciseName ?? t('lib.exerciseFallback'),
        sets: we.sets.map((s) => ({ reps: s.reps ?? null, weight: s.weight ?? null, duration: s.duration ?? null })),
      })),
  }
}

export async function createPost(input: {
  workout_id?: string | null
  snapshot?: WorkoutSnapshot | null
  caption: string
  visibility: PostVisibility
  photoFile?: File | null
}): Promise<Post> {
  const sb = sbOrThrow()
  const me = await myId()
  const caption = input.caption.trim().slice(0, 500)
  let photo_url: string | null = null
  if (input.photoFile) photo_url = await uploadPostPhoto(input.photoFile, me)
  const { data, error } = await sb
    .from('posts')
    .insert({
      user_id: me,
      workout_id: input.workout_id ?? null,
      workout_snapshot: input.snapshot ?? null,
      caption,
      visibility: input.visibility,
      photo_url,
    })
    .select('*')
    .single()
  if (error) {
    if (photo_url) void sb.storage.from('post-photos').remove([photo_url])
    throw new Error(t('lib.postError', { msg: error.message }))
  }
  return (await withSignedPhotos([data as Post]))[0]
}

/** Feed : mes posts + ceux de mes follows, ordre chrono. */
export async function listFeed(limit = 20, offset = 0): Promise<Post[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data: follows, error: fErr } = await sb.from('follows').select('followed').eq('follower', me)
  if (fErr) throw new Error(t('lib.feedError', { msg: fErr.message }))
  const ids = [me, ...((follows as { followed: string }[] ?? []).map((f) => f.followed))]
  const { data, error } = await sb
    .from('posts')
    .select('*')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(t('lib.feedError', { msg: error.message }))
  const posts = (data as Post[]) ?? []
  if (!posts.length) return posts

  const authors = await fetchSocialProfiles([...new Set(posts.map((p) => p.user_id))])
  const { data: likes } = await sb
    .from('post_likes')
    .select('post_id')
    .eq('user_id', me)
    .in('post_id', posts.map((p) => p.id))
  const liked = new Set(((likes as { post_id: string }[] ?? []).map((l) => l.post_id)))
  return withSignedPhotos(posts.map((p) => ({
    ...p,
    author: authors.get(p.user_id) ?? null,
    liked_by_me: liked.has(p.id),
  })))
}

/** Quelques publications publiques pour lancer la découverte d'un nouveau compte. */
export async function listDiscoverPosts(limit = 6): Promise<Post[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb.from('posts').select('*')
    .eq('visibility', 'public').neq('user_id', me)
    .order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(t('lib.discoverError', { msg: error.message }))
  const posts = (data as Post[]) ?? []
  if (!posts.length) return []
  const authors = await fetchSocialProfiles([...new Set(posts.map((p) => p.user_id))])
  const { data: likes } = await sb.from('post_likes').select('post_id')
    .eq('user_id', me).in('post_id', posts.map((p) => p.id))
  const liked = new Set(((likes as { post_id: string }[] ?? []).map((l) => l.post_id)))
  return withSignedPhotos(posts.map((p) => ({ ...p,
    author: authors.get(p.user_id) ?? null, liked_by_me: liked.has(p.id),
  })))
}

/** Posts d'un utilisateur (profil public) : RLS filtre selon visibilité. */
export async function listUserPosts(userId: string, limit = 20, offset = 0): Promise<Post[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(t('lib.postsError', { msg: error.message }))
  const posts = (data as Post[]) ?? []
  if (!posts.length) return posts
  const authors = await fetchSocialProfiles([userId])
  const { data: likes } = await sb
    .from('post_likes')
    .select('post_id')
    .eq('user_id', me)
    .in('post_id', posts.map((p) => p.id))
  const liked = new Set(((likes as { post_id: string }[] ?? []).map((l) => l.post_id)))
  return withSignedPhotos(posts.map((p) => ({
    ...p,
    author: authors.get(p.user_id) ?? null,
    liked_by_me: liked.has(p.id),
  })))
}

/** Mes posts (onglet Posts du Profil). */
export async function listMyPosts(limit = 20, offset = 0): Promise<Post[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('posts')
    .select('*')
    .eq('user_id', me)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(t('lib.postsError', { msg: error.message }))
  const authors = await fetchSocialProfiles([me])
  return withSignedPhotos(((data as Post[]) ?? []).map((p) => ({ ...p, author: authors.get(p.user_id) ?? null, liked_by_me: false })))
}

export async function deletePost(postId: string): Promise<void> {
  const sb = sbOrThrow()
  const { data } = await sb.from('posts').select('photo_url').eq('id', postId).maybeSingle()
  const { error } = await sb.from('posts').delete().eq('id', postId)
  if (error) throw new Error(t('lib.deleteError', { msg: error.message }))
  const path = photoPath((data as { photo_url?: string } | null)?.photo_url)
  if (path) await sb.storage.from('post-photos').remove([path])
}

export async function updatePost(
  postId: string,
  caption: string,
  visibility: PostVisibility,
  photoFile?: File | null,
  removePhoto = false,
): Promise<void> {
  const sb = sbOrThrow()
  const patch: Record<string, unknown> = { caption: caption.trim().slice(0, 500), visibility }
  let uploading = false
  if (photoFile) {
    patch.photo_url = await uploadPostPhoto(photoFile, await myId())
    uploading = true
  } else if (removePhoto) {
    patch.photo_url = null
  }
  // Ancienne image : supprimée du Storage une fois la mise à jour réussie.
  let previous: string | null = null
  if (patch.photo_url !== undefined) {
    const { data: current } = await sb.from('posts').select('photo_url').eq('id', postId).maybeSingle()
    previous = photoPath((current as { photo_url?: string | null } | null)?.photo_url)
  }
  const { error } = await sb.from('posts').update(patch).eq('id', postId)
  if (error) {
    if (uploading && typeof patch.photo_url === 'string') {
      void sb.storage.from('post-photos').remove([patch.photo_url])
    }
    throw new Error(t('lib.editError', { msg: error.message }))
  }
  if (previous && previous !== patch.photo_url) {
    await sb.storage.from('post-photos').remove([previous])
  }
}

/* ------------------------------ likes ------------------------------ */

/** Profils des personnes qui ont aimé un post (appui long sur le cœur). */
export async function listLikers(postId: string, limit = 100): Promise<SocialProfile[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb
    .from('post_likes')
    .select('user_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(t('lib.likersError', { msg: error.message }))
  const ids = [...new Set(((data as { user_id: string }[] | null) ?? []).map((l) => l.user_id))]
  if (!ids.length) return []
  const profiles = await fetchSocialProfiles(ids)
  return ids.map((id) => profiles.get(id)).filter((p): p is SocialProfile => Boolean(p))
}

export async function toggleLike(post: Post): Promise<boolean> {
  const sb = sbOrThrow()
  const me = await myId()
  if (post.liked_by_me) {
    const { error } = await sb.from('post_likes').delete().eq('post_id', post.id).eq('user_id', me)
    if (error) throw new Error(t('lib.unlikeError', { msg: error.message }))
    return false
  }
  const { error } = await sb.from('post_likes').insert({ post_id: post.id, user_id: me })
  if (error && !error.message.includes('duplicate')) throw new Error(t('lib.likeError', { msg: error.message }))
  return true
}

/* ---------------------------- commentaires ---------------------------- */

export async function listComments(postId: string): Promise<PostComment[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(t('lib.commentsError', { msg: error.message }))
  const list = (data as PostComment[]) ?? []
  const authors = await fetchSocialProfiles([...new Set(list.map((c) => c.user_id))])
  return list.map((c) => ({ ...c, author: authors.get(c.user_id) ?? null }))
}

export async function addComment(postId: string, text: string): Promise<PostComment> {
  const sb = sbOrThrow()
  const me = await myId()
  const clean = text.trim().slice(0, 280)
  if (!clean) throw new Error(t('lib.emptyComment'))
  const { data, error } = await sb
    .from('post_comments')
    .insert({ post_id: postId, user_id: me, text: clean })
    .select('*')
    .single()
  if (error) throw new Error(t('lib.commentError', { msg: error.message }))
  const authors = await fetchSocialProfiles([me])
  return { ...(data as PostComment), author: authors.get(me) ?? null }
}

export async function deleteComment(commentId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('post_comments').delete().eq('id', commentId)
  if (error) throw new Error(t('lib.deleteError', { msg: error.message }))
}

/* ------------------------- workout d'un post ------------------------- */

/** Données d'entraînement liées à un post (pour résumé + clone). */
export async function getPostWorkout(post: Pick<Post, 'user_id' | 'workout_id'>): Promise<Workout | null> {
  if (!post.workout_id) return null
  const sb = sbOrThrow()
  const { data, error } = await sb
    .from('workouts')
    .select('data')
    .eq('user_id', post.user_id)
    .eq('id', post.workout_id)
    .maybeSingle()
  if (error) throw new Error(t('lib.workoutError', { msg: error.message }))
  return ((data as { data: Workout } | null)?.data ?? null) as Workout | null
}

/**
 * Séances complètes d'un profil suivi (RPC `shared_workouts`) :
 * l'abonné a accès à l'historique et aux stats du compte qu'il suit.
 * Requiert `supabase/schema_followers_access.sql` (étape 13).
 */
export async function listUserWorkouts(userId: string, limit = 500): Promise<Workout[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb.rpc('shared_workouts', { target: userId, p_limit: limit })
  if (error) throw new Error(t('lib.workoutError', { msg: error.message }))
  return ((data as { data: Workout }[] | null) ?? []).map((row) => row.data)
}

/**
 * Photos d'un profil consulté (carrousel) : les posts visibles selon la RLS,
 * avec des URLs signées 1 h comme pour le feed.
 */
export async function listUserPhotos(userId: string, limit = 40): Promise<PostPhoto[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb
    .from('posts')
    .select('id,photo_url')
    .eq('user_id', userId)
    .not('photo_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(t('lib.postsError', { msg: error.message }))
  const rows = (data as { id: string; photo_url: string | null }[] | null) ?? []
  const storage = sb.storage.from('post-photos')
  const out: PostPhoto[] = []
  for (const row of rows) {
    const path = photoPath(row.photo_url)
    if (!path) continue
    const { data: signed, error: signErr } = await storage.createSignedUrl(path, 3600)
    if (!signErr && signed) out.push({ id: row.id, url: signed.signedUrl })
  }
  return out
}

/**
 * Programmes d'un profil consulté (RPC `shared_routines`) : lisibles et
 * copiables quand le profil est public ou qu'on le suit.
 * Requiert `supabase/schema_shared_profile.sql` (étape 14).
 */
export async function listUserRoutines(userId: string): Promise<Routine[]> {
  const sb = sbOrThrow()
  const { data, error } = await sb.rpc('shared_routines', { target: userId })
  if (error) throw new Error(t('lib.routinesError', { msg: error.message }))
  return ((data as { data: Routine }[] | null) ?? []).map((row) => row.data)
}

export function displayAuthor(a?: SocialProfile | null, fallback = t('lib.athlete')): string {
  return a?.display_name?.trim() || (a?.username ? `@${a.username}` : fallback)
}
