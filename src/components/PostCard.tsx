import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookmarkPlus, ChevronRight, Dumbbell, Flag, Heart, ImagePlus, MessageCircle, MoreVertical, Pencil, Play, Trash2 } from 'lucide-react'
import type { Post, PostComment, PostVisibility, SocialProfile, Workout } from '@/types'
import { useStore } from '@/store/store'
import { useAuth } from '@/lib/auth'
import {
  addComment,
  deleteComment,
  deletePost,
  displayAuthor,
  getPostWorkout,
  listComments,
  listLikers,
  toggleLike,
  updatePost,
} from '@/lib/posts'
import { estimate1RM, workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { formatDate, formatDistance, formatDuration, formatVolume, formatWeight } from '@/lib/utils'
import { Button, Card, Field, Input, Menu, Modal, Select, Textarea } from '@/components/ui'
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

/*
 * Carte post du feed : auteur, photo, légende, résumé séance (cliquable →
 * détail complet avec séries et 1RM estimé), likes (appui long = qui a aimé),
 * commentaires et réutilisation de la séance.
 */

/** Détail séance normalisé (snapshot figé ou séance locale/ancienne). */
type DetailSet = { reps: number | null; weight: number | null; duration: number | null; distance?: number | null }
type PostWorkoutDetail = {
  name: string
  sets: number
  volume: number
  seconds: number
  exercises: { name: string; sets: DetailSet[] }[]
}

/** Meilleur 1RM estimé d'un exercice (0 si non calculable). */
function bestE1RM(sets: DetailSet[]): number {
  return sets.reduce((best, s) => Math.max(best, estimate1RM(s.weight ?? undefined, s.reps ?? undefined)), 0)
}

/** Une série en clair : « 8 reps × 60 kg », « 45 s », « 2 km »… */
function describeSet(s: DetailSet, unit: 'kg' | 'lb', distanceUnit: 'km' | 'mi'): string {
  const parts: string[] = []
  if (s.reps) parts.push(`${s.reps} reps`)
  if (s.weight) parts.push(formatWeight(s.weight, unit))
  if (s.duration) parts.push(formatDuration(s.duration, 'compact'))
  if (s.distance) parts.push(formatDistance(s.distance, distanceUnit))
  return parts.length ? parts.join(' × ') : '—'
}

/**
 * Résumé séance d'un post : nom + chiffres cliquables (ouvre le détail),
 * liste des exercices avec leur 1RM estimé, actions (enregistrer / démarrer)
 * regroupées dans un menu 3 points.
 */
function WorkoutDetail({
  detail,
  busy,
  onOpen,
  onSave,
  onStart,
}: {
  detail: PostWorkoutDetail
  busy: boolean
  onOpen: () => void
  onSave: () => void
  onStart: () => void
}) {
  useLang()
  const settings = useStore((s) => s.settings)
  return (
    <div className="relative rounded-xl bg-surface-2 p-2.5">
      <button type="button" onClick={onOpen} title={t('post.detailTitle')} className="block w-full text-left">
        <span className="block truncate pr-7 text-[13px] font-extrabold">{detail.name}</span>
        <span className="mt-0.5 block text-[11px] text-muted">
          {t('post.setsCount', { count: detail.sets })} · {formatVolume(detail.volume, settings.unit)} · {formatDuration(detail.seconds, 'compact')}
        </span>
        {detail.exercises.slice(0, 6).map((e, i) => {
          const e1rm = bestE1RM(e.sets)
          return (
            <span key={i} className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="min-w-0 flex-1 truncate">
                {e.name} · {t('post.setCount', { count: e.sets.length })}
              </span>
              {e1rm > 0 && (
                <span className="tabular shrink-0 text-right text-[11px] font-bold text-accent">
                  {t('post.e1rm', { w: formatWeight(e1rm, settings.unit) })}
                </span>
              )}
            </span>
          )
        })}
        {detail.exercises.length > 6 && (
          <span className="mt-0.5 block text-[11px] text-muted">
            {t('post.moreExercises', { count: detail.exercises.length - 6 })}
          </span>
        )}
        <span className="mt-1 flex items-center gap-0.5 text-[11px] font-bold text-accent">
          {t('post.seeDetail')} <ChevronRight size={13} />
        </span>
      </button>
      {/* Menu posé en absolu : les lignes d'exercices courent jusqu'au bord
          droit du bloc, donc les 1RM restent alignés à droite. */}
      <div className="absolute top-1 right-1">
        <Menu
          align="right"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={t('post.options')}
              className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-ink"
            >
              <MoreVertical size={16} />
            </button>
          )}
          items={[
            { label: t('post.saveAsProgram'), icon: <BookmarkPlus size={15} />, onClick: onSave },
            { label: t('post.startNow'), icon: <Play size={15} />, onClick: onStart },
          ]}
        />
      </div>
      {busy && <p className="mt-1 text-[11px] text-muted">{t('common.loading')}</p>}
    </div>
  )
}

/** Feuille « Détail de la séance » : chaque série en clair + 1RM estimé. */
function WorkoutSheet({ open, detail, onClose }: {
  open: boolean
  detail: PostWorkoutDetail | null
  onClose: () => void
}) {
  useLang()
  const settings = useStore((s) => s.settings)
  if (!detail) return null
  return (
    <Modal open={open} onClose={onClose} title={t('post.detailTitle')}>
      <div className="space-y-3">
        <div>
          <p className="text-sm font-extrabold">{detail.name}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('post.setsCount', { count: detail.sets })} · {formatVolume(detail.volume, settings.unit)} · {formatDuration(detail.seconds, 'compact')}
          </p>
        </div>
        <div className="space-y-2.5">
          {detail.exercises.map((e, i) => {
            const e1rm = bestE1RM(e.sets)
            return (
              <div key={i} className="rounded-xl border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-[13px] font-bold">{e.name}</p>
                  {e1rm > 0 && (
                    <span className="tabular shrink-0 rounded-lg bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                      {t('post.e1rm', { w: formatWeight(e1rm, settings.unit) })}
                    </span>
                  )}
                </div>
                <ul className="mt-1 space-y-0.5">
                  {e.sets.map((s, j) => (
                    <li key={j} className="flex items-center gap-2 text-[11px] text-muted">
                      <span className="tabular w-4 shrink-0 font-bold">{j + 1}</span>
                      <span className="tabular">{describeSet(s, settings.unit, settings.distanceUnit)}</span>
                    </li>
                  ))}
                  {e.sets.length === 0 && <li className="text-[11px] text-muted">{t('post.noSet')}</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

/** Qui a aimé ce post (appui long sur le cœur). */
function LikersModal({ open, likers, loading, onClose }: {
  open: boolean
  likers: SocialProfile[] | null
  loading: boolean
  onClose: () => void
}) {
  useLang()
  const list = likers ?? []
  return (
    <Modal open={open} onClose={onClose} title={t('post.likers')}>
      {loading ? (
        <p className="text-sm text-muted">{t('common.loading')}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t('post.likersEmpty')}</p>
      ) : (
        <ul className="space-y-1">
          {list.map((p) => (
            <li key={p.id}>
              {p.username ? (
                <Link
                  to={`/profil/${p.username}`}
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-surface-2"
                >
                  <Avatar url={p.avatar_url} name={displayAuthor(p)} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold">{displayAuthor(p)}</span>
                    <span className="block truncate text-[11px] text-muted">@{p.username}</span>
                  </span>
                </Link>
              ) : (
                <div className="flex items-center gap-2.5 px-1.5 py-1.5">
                  <Avatar url={p.avatar_url} name={displayAuthor(p)} size={34} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{displayAuthor(p)}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
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
  const [remoteWorkout, setRemoteWorkout] = useState<Workout | null>(null)
  const [loadingWorkout, setLoadingWorkout] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [visibility, setVisibility] = useState<PostVisibility>(post.visibility)
  // Feuille de détail séance + liste des personnes qui ont aimé.
  const [sheetOpen, setSheetOpen] = useState(false)
  const [likersOpen, setLikersOpen] = useState(false)
  const [likers, setLikers] = useState<SocialProfile[] | null>(null)
  const [loadingLikers, setLoadingLikers] = useState(false)
  // Appui long sur le cœur : distingué du clic simple.
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)
  // Photo remplacée / retirée depuis la modale d'édition.
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)

  const mine = user?.id === post.user_id
  const localWorkout = post.workout_id ? localWorkouts.find((w) => w.id === post.workout_id) : undefined
  const workout = localWorkout ?? remoteWorkout

  /** Détail complet de la séance (snapshot figé ou séance connue localement). */
  const detail = useMemo<PostWorkoutDetail | null>(() => {
    const snap = post.workout_snapshot
    if (snap) {
      return {
        name: snap.name,
        sets: snap.sets,
        volume: snap.volume,
        seconds: snap.seconds,
        exercises: snap.exercises.map((e) => ({
          name: e.name,
          sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight, duration: s.duration })),
        })),
      }
    }
    if (!workout) return null
    return {
      name: workout.name,
      sets: workoutSets(workout),
      volume: workoutVolume(workout),
      seconds: workoutDurationSeconds(workout),
      exercises: workout.exercises.map((we) => ({
        name: we.exerciseName ?? t('lib.exerciseFallback'),
        sets: we.sets
          .filter((s) => s.completed)
          .map((s) => ({
            reps: s.reps ?? null,
            weight: s.weight ?? null,
            duration: s.duration ?? null,
            distance: s.distance ?? null,
          })),
      })),
    }
  }, [post.workout_snapshot, workout])

  const doLike = async () => {
    const prev = liked
    setLiked(!prev)
    setLikes((n) => n + (prev ? -1 : 1))
    try {
      const now = await toggleLike({ ...post, liked_by_me: prev })
      setLiked(now)
      setLikers(null) // la liste se rechargera au prochain appui long
    } catch (err) {
      setLiked(prev)
      setLikes((n) => n + (prev ? 1 : -1))
      notify(err instanceof Error ? err.message : t('post.likeFailed'), 'error')
    }
  }

  /** Appui long sur le cœur : qui a aimé ce post. */
  const openLikers = async () => {
    setLikersOpen(true)
    if (likers !== null) return
    setLoadingLikers(true)
    try {
      setLikers(await listLikers(post.id))
    } catch (err) {
      notify(err instanceof Error ? err.message : t('post.likeFailed'), 'error')
    } finally {
      setLoadingLikers(false)
    }
  }

  const startLikePress = () => {
    longPressed.current = false
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      void openLikers()
    }, 450)
  }

  const endLikePress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const clickLike = () => {
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    void doLike()
  }

  /** Ouvre le détail : rapport complet pour ma séance, feuille sinon. */
  const openDetail = async () => {
    if (localWorkout) {
      navigate(`/historique/${localWorkout.id}`)
      return
    }
    if (!workout && post.workout_id) {
      setLoadingWorkout(true)
      try {
        setRemoteWorkout(await getPostWorkout(post))
      } catch (err) {
        notify(err instanceof Error ? err.message : t('post.workoutFailed'), 'error')
        return
      } finally {
        setLoadingWorkout(false)
      }
    }
    setSheetOpen(true)
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
      await updatePost(post.id, caption, visibility, photoFile, removePhoto)
      setEditOpen(false)
      setPhotoFile(null)
      setRemovePhoto(false)
      notify(t('post.updated'), 'success')
      onChanged?.()
    } catch (err) { notify(err instanceof Error ? err.message : t('post.updateFailed'), 'error') }
    finally { setBusy(false) }
  }

  /** Aperçu local de la nouvelle photo choisie. */
  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null)
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  const openEdit = () => {
    setCaption(post.caption)
    setVisibility(post.visibility)
    setPhotoFile(null)
    setRemovePhoto(false)
    setEditOpen(true)
  }

  /** Fermeture sans enregistrer : on annule aussi le changement de photo. */
  const closeEdit = () => {
    setEditOpen(false)
    setPhotoFile(null)
    setRemovePhoto(false)
  }

  const shownPhoto = photoPreview ?? (!removePhoto ? post.photo_url ?? null : null)

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
          <button type="button" onClick={openEdit} aria-label={t('post.editAria')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-accent"><Pencil size={16} /></button>
          <button type="button" onClick={() => void removePost()} aria-label={t('post.deleteAria')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"><Trash2 size={16} /></button>
        </div> : <button type="button" onClick={() => setReportOpen(true)} aria-label={t('post.reportAria')} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-danger"><Flag size={16} /></button>}
      </div>

      {shownPhoto && (
        <img src={shownPhoto} alt="" className="max-h-[480px] w-full object-cover" loading="lazy" />
      )}

      <div className="space-y-2.5 p-3">
        {post.caption && <p className="text-sm whitespace-pre-wrap">{post.caption}</p>}

        {detail ? (
          /* Résumé figé (snapshot) ou séance locale : le bloc ouvre le détail. */
          <WorkoutDetail
            detail={detail}
            busy={busy}
            onOpen={() => void openDetail()}
            onSave={() => void clone(false)}
            onStart={() => void clone(true)}
          />
        ) : post.workout_id ? (
          /* Ancien post sans résumé : lecture distante puis détail. */
          <button
            type="button"
            onClick={() => void openDetail()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-muted hover:text-ink"
          >
            <Dumbbell size={13} /> {loadingWorkout ? t('common.loading') : t('post.viewWorkout')}
          </button>
        ) : null}

        <div className="flex items-center gap-1 border-t border-line pt-2">
          <button
            type="button"
            onClick={clickLike}
            onPointerDown={startLikePress}
            onPointerUp={endLikePress}
            onPointerLeave={endLikePress}
            onPointerCancel={endLikePress}
            onContextMenu={(e) => e.preventDefault()}
            title={t('post.longPressLikes')}
            aria-label={t('post.likers')}
            className={cn(
              'inline-flex touch-manipulation items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition-colors select-none',
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
      <WorkoutSheet open={sheetOpen} detail={detail} onClose={() => setSheetOpen(false)} />
      <LikersModal
        open={likersOpen}
        likers={likers}
        loading={loadingLikers}
        onClose={() => setLikersOpen(false)}
      />
      <Modal open={editOpen} onClose={closeEdit} title={t('post.editTitle')}>
        <div className="space-y-3">
          <Field label={t('post.photoLabel')} hint={t('post.photoHint')}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-2.5 transition-colors hover:bg-surface-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft text-accent">
                {shownPhoto ? (
                  <img src={shownPhoto} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus size={18} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted">
                {photoFile
                  ? photoFile.name
                  : post.photo_url && !removePhoto
                    ? t('post.changePhoto')
                    : t('post.choosePhoto')}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  setPhotoFile(e.target.files?.[0] ?? null)
                  setRemovePhoto(false)
                }}
              />
            </label>
          </Field>
          {post.photo_url && !photoFile && (
            <Button size="sm" variant="ghost" block onClick={() => setRemovePhoto((v) => !v)}>
              {removePhoto ? t('post.keepPhoto') : t('post.removePhoto')}
            </Button>
          )}
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
