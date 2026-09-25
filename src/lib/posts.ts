/**
 * VeryHevy V2 — posts & feed (Étape C).
 * Photo optionnelle (Storage post-photos), likes, commentaires,
 * lecture workout auteur pour « Cloner sans démarrer ».
 */
import type { Post, PostComment, PostVisibility, SocialProfile, Workout, WorkoutSnapshot } from '@/types'
import { getSupabase } from './supabase'
import { fetchSocialProfiles } from './social'
import { workoutDurationSeconds, workoutSets, workoutVolume } from './calc'

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
        reject(new Error('Canvas indisponible'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Compression impossible'))), 'image/jpeg', quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible'))
    }
    img.src = url
  })
}

async function uploadPostPhoto(file: File, userId: string): Promise<string> {
  const sb = sbOrThrow()
  if (file.size > 8 * 1024 * 1024) throw new Error('Photo trop lourde (max 8 Mo)')
  const blob = await compressImage(file)
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await sb.storage.from('post-photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error(`Upload : ${error.message}`)
  return sb.storage.from('post-photos').getPublicUrl(path).data.publicUrl
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
        name: we.exerciseName ?? 'Exercice',
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
  if (error) throw new Error(`Publication : ${error.message}`)
  return data as Post
}

/** Feed : mes posts + ceux de mes follows, ordre chrono. */
export async function listFeed(limit = 20, offset = 0): Promise<Post[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data: follows, error: fErr } = await sb.from('follows').select('followed').eq('follower', me)
  if (fErr) throw new Error(`Feed : ${fErr.message}`)
  const ids = [me, ...((follows as { followed: string }[] ?? []).map((f) => f.followed))]
  const { data, error } = await sb
    .from('posts')
    .select('*')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`Feed : ${error.message}`)
  const posts = (data as Post[]) ?? []
  if (!posts.length) return posts

  const authors = await fetchSocialProfiles([...new Set(posts.map((p) => p.user_id))])
  const { data: likes } = await sb
    .from('post_likes')
    .select('post_id')
    .eq('user_id', me)
    .in('post_id', posts.map((p) => p.id))
  const liked = new Set(((likes as { post_id: string }[] ?? []).map((l) => l.post_id)))
  return posts.map((p) => ({
    ...p,
    author: authors.get(p.user_id) ?? null,
    liked_by_me: liked.has(p.id),
  }))
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
  if (error) throw new Error(`Posts : ${error.message}`)
  const posts = (data as Post[]) ?? []
  if (!posts.length) return posts
  const authors = await fetchSocialProfiles([userId])
  const { data: likes } = await sb
    .from('post_likes')
    .select('post_id')
    .eq('user_id', me)
    .in('post_id', posts.map((p) => p.id))
  const liked = new Set(((likes as { post_id: string }[] ?? []).map((l) => l.post_id)))
  return posts.map((p) => ({
    ...p,
    author: authors.get(p.user_id) ?? null,
    liked_by_me: liked.has(p.id),
  }))
}

/** Mes posts (onglet Séances du Profil, Étape C+). */
export async function listMyPosts(limit = 20, offset = 0): Promise<Post[]> {
  const sb = sbOrThrow()
  const me = await myId()
  const { data, error } = await sb
    .from('posts')
    .select('*')
    .eq('user_id', me)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(`Posts : ${error.message}`)
  const authors = await fetchSocialProfiles([me])
  return ((data as Post[]) ?? []).map((p) => ({ ...p, author: authors.get(p.user_id) ?? null, liked_by_me: false }))
}

export async function deletePost(postId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('posts').delete().eq('id', postId)
  if (error) throw new Error(`Suppression : ${error.message}`)
}

/* ------------------------------ likes ------------------------------ */

export async function toggleLike(post: Post): Promise<boolean> {
  const sb = sbOrThrow()
  const me = await myId()
  if (post.liked_by_me) {
    const { error } = await sb.from('post_likes').delete().eq('post_id', post.id).eq('user_id', me)
    if (error) throw new Error(`Unlike : ${error.message}`)
    return false
  }
  const { error } = await sb.from('post_likes').insert({ post_id: post.id, user_id: me })
  if (error && !error.message.includes('duplicate')) throw new Error(`Like : ${error.message}`)
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
  if (error) throw new Error(`Commentaires : ${error.message}`)
  const list = (data as PostComment[]) ?? []
  const authors = await fetchSocialProfiles([...new Set(list.map((c) => c.user_id))])
  return list.map((c) => ({ ...c, author: authors.get(c.user_id) ?? null }))
}

export async function addComment(postId: string, text: string): Promise<PostComment> {
  const sb = sbOrThrow()
  const me = await myId()
  const clean = text.trim().slice(0, 280)
  if (!clean) throw new Error('Commentaire vide')
  const { data, error } = await sb
    .from('post_comments')
    .insert({ post_id: postId, user_id: me, text: clean })
    .select('*')
    .single()
  if (error) throw new Error(`Commentaire : ${error.message}`)
  const authors = await fetchSocialProfiles([me])
  return { ...(data as PostComment), author: authors.get(me) ?? null }
}

export async function deleteComment(commentId: string): Promise<void> {
  const sb = sbOrThrow()
  const { error } = await sb.from('post_comments').delete().eq('id', commentId)
  if (error) throw new Error(`Suppression : ${error.message}`)
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
  if (error) throw new Error(`Séance : ${error.message}`)
  return ((data as { data: Workout } | null)?.data ?? null) as Workout | null
}

export function displayAuthor(a?: SocialProfile | null, fallback = 'Sportif'): string {
  if (a?.username) return `@${a.username}`
  return a?.display_name?.trim() || fallback
}
