import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Dumbbell, Heart, MessageCircle, Trash2 } from 'lucide-react'
import type { Post, PostComment, Workout } from '@/types'
import { useStore } from '@/store/store'
import { useAuth } from '@/lib/auth'
import {
  addComment,
  deleteComment,
  deletePost,
  displayAuthor,
  getPostWorkout,
  listComments,
  toggleLike,
} from '@/lib/posts'
import { workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { formatDate, formatDuration, formatVolume } from '@/lib/utils'
import { Button, Card, Input } from '@/components/ui'
import { cn } from '@/lib/utils'

function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-xl object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-accent-soft font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * Carte post du feed : auteur, photo, légende, résumé séance,
 * likes, commentaires, cloner sans démarrer.
 */
export function PostCard({ post, onChanged }: { post: Post; onChanged?: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const notify = useStore((s) => s.notify)
  const localWorkouts = useStore((s) => s.workouts)
  const startWorkout = useStore((s) => s.startWorkout)

  const [liked, setLiked] = useState(Boolean(post.liked_by_me))
  const [likes, setLikes] = useState(post.likes_count)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[] | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [remoteWorkout, setRemoteWorkout] = useState<Workout | null>(null)
  const [loadingWorkout, setLoadingWorkout] = useState(false)
  const [busy, setBusy] = useState(false)

  const mine = user?.id === post.user_id
  const localWorkout = post.workout_id ? localWorkouts.find((w) => w.id === post.workout_id) : undefined
  const workout = localWorkout ?? remoteWorkout

  const doLike = async () => {
    const prev = liked
    setLiked(!prev)
    setLikes((n) => n + (prev ? -1 : 1))
    try {
      const now = await toggleLike({ ...post, liked_by_me: prev })
      setLiked(now)
    } catch (err) {
      setLiked(prev)
      setLikes((n) => n + (prev ? 1 : -1))
      notify(err instanceof Error ? err.message : 'Like impossible', 'error')
    }
  }

  const openComments = async () => {
    const next = !showComments
    setShowComments(next)
    if (next && comments === null) {
      setLoadingComments(true)
      try {
        setComments(await listComments(post.id))
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Commentaires illisibles', 'error')
      } finally {
        setLoadingComments(false)
      }
    }
  }

  const send = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const c = await addComment(post.id, draft)
      setComments((list) => [...(list ?? []), c])
      setDraft('')
      onChanged?.()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Envoi impossible', 'error')
    } finally {
      setSending(false)
    }
  }

  const removeComment = async (id: string) => {
    try {
      await deleteComment(id)
      setComments((list) => (list ?? []).filter((c) => c.id !== id))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error')
    }
  }

  const removePost = async () => {
    if (!window.confirm('Supprimer ce post ?')) return
    try {
      await deletePost(post.id)
      notify('Post supprimé', 'info')
      onChanged?.()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error')
    }
  }

  const expandWorkout = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (!workout && post.workout_id) {
      setLoadingWorkout(true)
      try {
        setRemoteWorkout(await getPostWorkout(post))
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Séance illisible', 'error')
      } finally {
        setLoadingWorkout(false)
      }
    }
  }

  /** Cloner sans démarrer : crée la séance, reste sur le feed. */
  const clone = async () => {
    if (busy) return
    const st = useStore.getState()
    if (st.workouts.some((w) => w.status === 'active')) {
      notify('Termine ta séance en cours avant d’en cloner une', 'error')
      return
    }
    setBusy(true)
    try {
      let w: Workout | null | undefined = localWorkout
      if (!w && post.workout_id) w = await getPostWorkout(post)
      if (!w) throw new Error('Séance introuvable')
      startWorkout({
        name: w.name,
        exercises: w.exercises.map((we) => ({
          exerciseId: we.exerciseId,
          setCount: we.sets.length,
          restSeconds: we.restSeconds,
          exerciseName: we.exerciseName,
        })),
      })
      notify('Séance clonée ! Ouvre-la quand tu es à la salle 💪', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Clone impossible', 'error')
    } finally {
      setBusy(false)
    }
  }

  const authorName = displayAuthor(post.author)
  const profileLink = post.author?.username ? `/profil/${post.author.username}` : undefined

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 p-3">
        {profileLink ? (
          <Link to={profileLink}><Avatar url={post.author?.avatar_url} name={authorName} /></Link>
        ) : (
          <Avatar url={post.author?.avatar_url} name={authorName} />
        )}
        <div className="min-w-0 flex-1">
          {profileLink ? (
            <Link to={profileLink} className="block truncate text-sm font-extrabold hover:text-accent">
              {authorName}
            </Link>
          ) : (
            <p className="truncate text-sm font-extrabold">{authorName}</p>
          )}
          <p className="text-[11px] text-muted">
            {formatDate(post.created_at)} · {post.visibility === 'public' ? 'Public' : post.visibility === 'followers' ? 'Abonnés' : 'Privé'}
          </p>
        </div>
        {mine && (
          <button type="button" onClick={() => void removePost()} title="Supprimer" className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {post.photo_url && (
        <img src={post.photo_url} alt="" className="max-h-[480px] w-full object-cover" loading="lazy" />
      )}

      <div className="space-y-2.5 p-3">
        {post.caption && <p className="text-sm whitespace-pre-wrap">{post.caption}</p>}

        {post.workout_id && (
          <div>
            {!expanded ? (
              <button
                type="button"
                onClick={() => void expandWorkout()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-muted hover:text-ink"
              >
                <Dumbbell size={13} /> Voir la séance
              </button>
            ) : (
              <div className="rounded-xl bg-surface-2 p-2.5">
                {loadingWorkout ? (
                  <p className="text-xs text-muted">Chargement…</p>
                ) : workout ? (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-extrabold">{workout.name}</p>
                    <p className="text-[11px] text-muted">
                      {workoutSets(workout)} séries · {formatVolume(workoutVolume(workout), 'kg')} ·{' '}
                      {formatDuration(workoutDurationSeconds(workout), 'compact')}
                    </p>
                    <ul className="space-y-0.5">
                      {workout.exercises.slice(0, 6).map((we) => (
                        <li key={we.id} className="text-xs text-muted">
                          {we.exerciseName ?? 'Exercice'} · {we.sets.length} série(s)
                        </li>
                      ))}
                    </ul>
                    {workout.exercises.length > 6 && (
                      <p className="text-[11px] text-muted">+{workout.exercises.length - 6} exercice(s)</p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="primary" disabled={busy} onClick={() => void clone()}>
                        <Copy size={14} /> Cloner la séance
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/historique/${workout.id}`)} disabled={!localWorkout}>
                        Ouvrir
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Séance non partagée en détail.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 border-t border-line pt-2">
          <button
            type="button"
            onClick={() => void doLike()}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition-colors',
              liked ? 'text-danger' : 'text-muted hover:text-ink',
            )}
          >
            <Heart size={17} fill={liked ? 'currentColor' : 'none'} /> {likes || ''}
          </button>
          <button
            type="button"
            onClick={() => void openComments()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-muted hover:text-ink"
          >
            <MessageCircle size={17} /> {post.comments_count || ''}
          </button>
        </div>

        {showComments && (
          <div className="space-y-2">
            {loadingComments ? (
              <p className="text-xs text-muted">Chargement…</p>
            ) : (
              <div className="space-y-1.5">
                {(comments ?? []).map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <Avatar url={c.author?.avatar_url} name={displayAuthor(c.author)} size={28} />
                    <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-2.5 py-1.5">
                      <p className="text-[11px] font-extrabold">{displayAuthor(c.author)}</p>
                      <p className="text-[13px] whitespace-pre-wrap">{c.text}</p>
                    </div>
                    {(user?.id === c.user_id || mine) && (
                      <button type="button" onClick={() => void removeComment(c.id)} className="p-1 text-muted hover:text-danger">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}
                {(comments ?? []).length === 0 && (
                  <p className="text-xs text-muted">Aucun commentaire. Sois le premier 💬</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
                placeholder="Ajouter un commentaire…"
                maxLength={280}
              />
              <Button variant="primary" size="sm" disabled={sending || !draft.trim()} onClick={() => void send()}>
                OK
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
