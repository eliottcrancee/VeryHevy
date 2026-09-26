import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Field, Button, Modal, Select, Textarea } from '@/components/ui'
import { useStore } from '@/store/store'
import { t, useLang } from '@/lib/i18n'
import type { PostVisibility } from '@/types'
import { buildWorkoutSnapshot, createPost, decodableImage } from '@/lib/posts'

/**
 * Publier une séance en post (photo optionnelle + légende + visibilité).
 * Utilisé fin de séance et depuis le rapport.
 */
export function SharePostModal({
  open,
  workoutId,
  onClose,
  onPublished,
}: {
  open: boolean
  workoutId: string | null
  onClose: () => void
  onPublished?: () => void
}) {
  const settings = useStore((s) => s.settings)
  const notify = useStore((s) => s.notify)
  useLang()
  const [caption, setCaption] = useState('')
  const [visibility, setVisibility] = useState<PostVisibility>(settings.defaultPostVisibility)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (open) {
      setCaption('')
      setVisibility(settings.defaultPostVisibility)
      setFile(null)
      setPreview(null)
    }
  }, [open, settings.defaultPostVisibility])

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    /* Aperçu : un HEIC est converti pour rester visible partout. */
    let cancelled = false
    let url: string | null = null
    decodableImage(file)
      .then((source) => {
        if (cancelled) return
        url = URL.createObjectURL(source)
        setPreview(url)
      })
      .catch(() => { if (!cancelled) setPreview(null) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  if (!open || !workoutId) return null

  const publish = async () => {
    setPublishing(true)
    try {
      // Snapshot figé : le détail reste visible par les abonnés
      // même si la séance locale n'est pas (ou plus) synchronisée.
      const w = workoutId ? useStore.getState().workouts.find((x) => x.id === workoutId) : undefined
      await createPost({
        workout_id: workoutId,
        snapshot: w ? buildWorkoutSnapshot(w) : null,
        caption,
        visibility,
        photoFile: file,
      })
      notify(t('post.published'), 'success')
      onClose()
      onPublished?.()
    } catch (err) {
      notify(err instanceof Error ? err.message : t('post.publishFailed'), 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('post.shareTitle')}>
      <div className="space-y-3">
        <Field label={t('post.photoLabel')} hint={t('post.photoHint')}>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 transition-colors hover:bg-surface-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <ImagePlus size={20} />
            </span>
            <span className="min-w-0 flex-1 text-sm text-muted">
              {file ? file.name : t('post.choosePhoto')}
            </span>
            <input
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>
        {preview && (
          /* Aperçu fidèle : ratio naturel, pas de rognage (recadrage
             seulement au-delà d'un ratio excessif). */
          <img src={preview} alt="" className="block max-h-[55vh] w-full rounded-xl bg-surface-2 object-contain" />
        )}
        <Field label={t('post.captionLabel')} hint={t('post.captionHint')}>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={t('post.captionPlaceholder')}
          />
        </Field>
        <Field label={t('post.visibilityLabel')}>
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as PostVisibility)}>
            <option value="followers">{t('post.visFollowersRecommended')}</option>
            <option value="public">{t('post.visPublic')}</option>
            <option value="private">{t('post.visPrivateOnlyMe')}</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" block disabled={publishing} onClick={() => void publish()}>
            {publishing ? t('post.publishing') : t('post.publish')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
