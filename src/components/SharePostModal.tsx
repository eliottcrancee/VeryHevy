import { useEffect, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Field, Button, Modal, Select, Textarea } from '@/components/ui'
import { useStore } from '@/store/store'
import type { PostVisibility } from '@/types'
import { buildWorkoutSnapshot, createPost } from '@/lib/posts'

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
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
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
      notify('Publié dans le feed 🎉', 'success')
      onClose()
      onPublished?.()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Publication impossible', 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Publier dans le feed">
      <div className="space-y-3">
        <Field label="Photo (optionnelle)" hint="JPG/PNG, max 8 Mo — compressée automatiquement">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 transition-colors hover:bg-surface-2">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <ImagePlus size={20} />
            </span>
            <span className="min-w-0 flex-1 text-sm text-muted">
              {file ? file.name : 'Choisir une photo de séance…'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>
        {preview && (
          <img src={preview} alt="" className="max-h-64 w-full rounded-xl object-cover" />
        )}
        <Field label="Légende" hint="500 caractères max">
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Bonne séance ! +5kg au DC 💪"
          />
        </Field>
        <Field label="Qui peut voir ?">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as PostVisibility)}>
            <option value="followers">Abonnés (recommandé)</option>
            <option value="public">Public</option>
            <option value="private">Privé (moi uniquement)</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={onClose}>Annuler</Button>
          <Button variant="primary" block disabled={publishing} onClick={() => void publish()}>
            {publishing ? 'Publication…' : 'Publier'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
