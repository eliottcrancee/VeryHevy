import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookmarkPlus, Dumbbell, Flag, Heart, MessageCircle, Pencil, Play, Trash2 } from 'lucide-react'
import type { Post, PostComment, PostVisibility, Workout } from '@/types'
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
  updatePost,
} from '@/lib/posts'
import { workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { formatDate, formatDuration, formatVolume } from '@/lib/utils'
import { Button, Card, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { ReportDialog } from '@/components/ReportDialog'
import { t, useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { uid } from '@/lib/utils'

function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/**
 * Carte post du feed : auteur, photo, légende, résumé séance,
 * likes, commentaires et réutilisation de la séance.
 */
function WorkoutDetail({
  name,
  sets,
  volume,
  seconds,
  exercises,
  busy,
  onSave,
  onStart,
  onOpen,
}: {
  name: string
  sets: number
  volume: number
  seconds: number
  exercises: { name: string; count: number }[]
  busy: boolean
  onSave: () => void
  onStart: () => void
  onOpen?: () => void
}) {
  useLang()
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <div className="space-y-1.5">
        <p className="text-[13px] font-extrabold">{name}</p>
        <p className="text-[11px] text-muted">
          {t('post.setsCount', { count: sets })} · {formatVolume(volume, 'kg')} · {formatDuration(seconds, 'compact')}
        </p>
        <ul className="space-y-0.5">
          {exercises.slice(0, 6).map((e, i) => (
            <li key={i} className="text-xs text-muted">
              {e.name} · {t('post.setCount', { count: e.count })}
            </li>
          ))}
        </ul>
        {exercises.length > 6 && (
          <p className="text-[11px] text-muted">{t('post.moreExercises', { count: exercises.length - 6 })}</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="primary" disabled={busy} onClick={onSave}>
            <BookmarkPlus size={14} /> {t('post.saveAsProgram')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onStart}>
            <Play size={14} /> {t('post.startNow')}
          </Button>
          {onOpen && (
            <Button size="sm" variant="ghost" onClick={onOpen}>
              {t('post.open')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function PostCard({ post, onChanged }: { post: Post; onChanged?: () => void }) {
  const { user } = useAuth()
  useLang()
  const navigate = useNavigate()
  const notify = useStore((s) => s.notify)
  const localWorkouts = useStore((s) => s.workouts)

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
  const [reportOpen, setReportOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [visibility, setVisibility] = useState<PostVisibility>(post.visibility)

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
      notify(err instanceof Error ? err.message : t('post.likeFailed'), 'error')
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
        notify(err instanceof Error ? err.message : t('post.commentsFailed'), 'error')
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
      notify(err instanceof Error ? err.message : t('post.sendFailed'), 'error')
    } finally {
      setSending(false)
    }
  }

  const removeComment = async (id: string) => {
    try {
      await deleteComment(id)
      setComments((list) => (list ?? []).filter((c) => c.id !== id))
    } catch (err) {
      notify(err instanceof Error ? err.message : t('post.deleteFailed'), 'error')
    }
  }

  const removePost = async () => {
    if (!window.confirm(t('post.deleteConfirm'))) return
    try {
      await deletePost(post.id)
      notify(t('post.deleted'), 'info')
      onChanged?.()
    } catch (err) {
      notify(err instanceof Error ? err.message : t('post.deleteFailed'), 'error')
    }
  }

  const savePost = async () => {
    setBusy(true)
    try {
      await updatePost(post.id, caption, visibility)
      setEditOpen(false)
      notify(t('post.updated'), 'success')
      onChanged?.()
    } catch (err) { notify(err instanceof Error ? err.message : t('post.updateFailed'), 'error') }
    finally { setBusy(false) }
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
        notify(err instanceof Error ? err.message : t('post.workoutFailed'), 'error')
      } finally {
        setLoadingWorkout(false)
      }
    }
  }

  /** Un programme se sauvegarde sans créer de séance active. */
  const cloneSource = async (source: {
    name: string
    exercises: { exerciseId?: string; name: string; sets: { reps?: number | null; weight?: number | null; duration?: number | null }[] }[]
  }, start: boolean) => {
    if (busy) return
    const st = useStore.getState()
    if (start && st.workouts.some((w) => w.status === 'active')) {
      notify(t('post.finishCurrentFirst'), 'error')
      return
    }
    setBusy(true)
    try {
      const exercises = source.exercises.map((e) => {
          const found =
            (e.exerciseId ? st.exercises.find((x) => x.id === e.exerciseId) : undefined) ??
            st.exercises.find((x) => x.name.toLowerCase() === e.name.toLowerCase())
          return {
            exerciseId:
              found?.id ??
              e.exerciseId ??
              `ext-${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
            sets: e.sets.length ? e.sets : [{}],
            exerciseName: e.name,
          }
        })
      if (start) {
        st.startWorkout({ name: source.name, exercises: exercises.map((e) => ({
          exerciseId: e.exerciseId, exerciseName: e.exerciseName, setCount: e.sets.length,
        })) })
        navigate('/seance')
      } else {
        st.createRoutine({
          name: source.name,
          description: t('post.savedFromPost'),
          exercises: exercises.map((e) => ({
            id: uid('re'), exerciseId: e.exerciseId, exerciseName: e.exerciseName,
            restSeconds: st.settings.defaultRestSeconds,
            sets: e.sets.map((s) => ({ type: 'normal' as const,
              reps: s.reps ?? undefined, weight: s.weight ?? undefined,
              duration: s.duration ?? undefined })),
          })),
        })
        notify(t('post.programSaved'), 'success')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t('post.copyFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const clone = async (start: boolean) => {
    const snap = post.workout_snapshot
    if (snap) {
      await cloneSource({
        name: snap.name,
        exercises: snap.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name, sets: e.sets })),
      }, start)
      return
    }
    let w: Workout | null | undefined = localWorkout
    if (!w && post.workout_id) w = await getPostWorkout(post)
    if (!w) {
      notify(t('post.workoutMissing'), 'error')
      return
    }
    await cloneSource({
      name: w.name,
      exercises: w.exercises.map((we) => ({
        exerciseId: we.exerciseId,
        name: we.exerciseName ?? t('lib.exerciseFallback'),
        sets: we.sets,
      })),
    }, start)
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
            {formatDate(post.created_at)} · {post.visibility === 'public' ? t('post.visPublic') : post.visibility === 'followers' ? t('post.visFollowers') : t('post.visPrivate')}
          </p>
        </div>
        {mine ? <div className="flex">
          <button type="button" onClick={() => setEditOpen(true)} aria-label={t('post.editAria')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-accent"><Pencil size={16} /></button>
          <button type="button" onClick={() => void removePost()} aria-label={t('post.deleteAria')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={16} /></button>
        </div> : <button type="button" onClick={() => setReportOpen(true)} aria-label={t('post.reportAria')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"><Flag size={16} /></button>}
      </div>

      {post.photo_url && (
        <img src={post.photo_url} alt="" className="max-h-[480px] w-full object-cover" loading="lazy" />
      )}

      <div className="space-y-2.5 p-3">
        {post.caption && <p className="text-sm whitespace-pre-wrap">{post.caption}</p>}

        {post.workout_snapshot ? (
          /* Détail toujours visible (snapshot figé à la publication). */
          <WorkoutDetail
            name={post.workout_snapshot.name}
            sets={post.workout_snapshot.sets}
            volume={post.workout_snapshot.volume}
            seconds={post.workout_snapshot.seconds}
            exercises={post.workout_snapshot.exercises.map((e) => ({ name: e.name, count: e.sets.length }))}
            busy={busy}
            onSave={() => void clone(false)}
            onStart={() => void clone(true)}
          />
        ) : localWorkout ? (
          /* Ancien post de ma propre séance : détail local, visible aussi. */
          <WorkoutDetail
            name={localWorkout.name}
            sets={workoutSets(localWorkout)}
            volume={workoutVolume(localWorkout)}
            seconds={workoutDurationSeconds(localWorkout)}
            exercises={localWorkout.exercises.map((we) => ({ name: we.exerciseName ?? t('lib.exerciseFallback'), count: we.sets.length }))}
            busy={busy}
            onSave={() => void clone(false)}
            onStart={() => void clone(true)}
            onOpen={() => navigate(`/historique/${localWorkout.id}`)}
          />
        ) : post.workout_id ? (
          /* Ancien post d'un autre compte : repli lecture distante. */
          <div>
            {!expanded ? (
              <button
                type="button"
                onClick={() => void expandWorkout()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-muted hover:text-ink"
              >
                <Dumbbell size={13} /> {t('post.viewWorkout')}
              </button>
            ) : (
              <div className="rounded-xl bg-surface-2 p-2.5">
                {loadingWorkout ? (
                  <p className="text-xs text-muted">{t('common.loading')}</p>
                ) : workout ? (
                  <WorkoutDetail
                    name={workout.name}
                    sets={workoutSets(workout)}
                    volume={workoutVolume(workout)}
                    seconds={workoutDurationSeconds(workout)}
                    exercises={workout.exercises.map((we) => ({ name: we.exerciseName ?? t('lib.exerciseFallback'), count: we.sets.length }))}
                    busy={busy}
                    onSave={() => void clone(false)}
                    onStart={() => void clone(true)}
                  />
                ) : (
                  <p className="text-xs text-muted">{t('post.workoutNotShared')}</p>
                )}
              </div>
            )}
          </div>
        ) : null}

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
              <p className="text-xs text-muted">{t('common.loading')}</p>
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
                  <p className="text-xs text-muted">{t('post.noComments')}</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
                placeholder={t('post.addComment')}
                maxLength={280}
              />
              <Button variant="primary" size="sm" disabled={sending || !draft.trim()} onClick={() => void send()}>
                OK
              </Button>
            </div>
          </div>
        )}
      </div>
      <ReportDialog open={reportOpen} targetType="post" targetId={post.id} onClose={() => setReportOpen(false)} />
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t('post.editTitle')}>
        <div className="space-y-3">
          <Field label={t('post.textLabel')}><Textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} rows={4} /></Field>
          <Field label={t('post.visibilityField')}><Select value={visibility} onChange={(e) => setVisibility(e.target.value as PostVisibility)}>
            <option value="public">{t('post.visPublic')}</option><option value="followers">{t('post.visFollowers')}</option><option value="private">{t('post.visOnlyMe')}</option>
          </Select></Field>
          <Button block variant="primary" disabled={busy} onClick={() => void savePost()}>{t('common.save')}</Button>
        </div>
      </Modal>
    </Card>
  )
}
