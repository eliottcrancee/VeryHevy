import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Exercise, ExerciseCategory, ExerciseLevel, TrackingType } from '@/types'
import {
  CATEGORY_META,
  EQUIPMENT_LIST,
  MUSCLE_GROUPS,
  TRACKING_TYPES,
} from '@/types'
import { Button, Checkbox, Field, IconButton, Input, Modal, Select, Textarea } from '@/components/ui'
import { Chip } from '@/components/ui'
import { useStore } from '@/store/store'
import { cn, tintBg, tintText } from '@/lib/utils'

const LEVELS: ExerciseLevel[] = ['débutant', 'intermédiaire', 'avancé']

interface Props {
  open: boolean
  onClose: () => void
  /** Exercice à modifier, sinon création. */
  exercise?: Exercise
  onCreated?: (exercise: Exercise) => void
}

export function ExerciseFormModal({ open, onClose, exercise, onCreated }: Props) {
  const addExercise = useStore((s) => s.addExercise)
  const updateExercise = useStore((s) => s.updateExercise)
  const deleteExercise = useStore((s) => s.deleteExercise)
  const notify = useStore((s) => s.notify)

  const readOnly = Boolean(exercise && !exercise.isCustom)

  const [name, setName] = useState('')
  const [altName, setAltName] = useState('')
  const [category, setCategory] = useState<ExerciseCategory>('muscu')
  const [tracking, setTracking] = useState<TrackingType>('weight_reps')
  const [primary, setPrimary] = useState<string[]>([])
  const [secondary, setSecondary] = useState<string[]>([])
  const [equipment, setEquipment] = useState<string>('barre')
  const [level, setLevel] = useState<ExerciseLevel>('intermédiaire')
  const [tips, setTips] = useState('')
  const [instructions, setInstructions] = useState('')
  const [images, setImages] = useState('')
  const [favorite, setFavorite] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(exercise?.name ?? '')
    setAltName(exercise?.altName ?? '')
    setCategory(exercise?.category ?? 'muscu')
    setTracking(exercise?.tracking ?? 'weight_reps')
    setPrimary(exercise?.primaryMuscles ?? [])
    setSecondary(exercise?.secondaryMuscles ?? [])
    setEquipment(exercise?.equipment ?? 'barre')
    setLevel(exercise?.level ?? 'intermédiaire')
    setTips(exercise?.tips ?? '')
    setInstructions((exercise?.instructions ?? []).join('\n'))
    setImages((exercise?.images ?? []).join('\n'))
    setFavorite(exercise?.isFavorite ?? false)
  }, [open, exercise])

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  const save = () => {
    if (!name.trim()) return
    const payload = {
      name,
      altName: altName.trim() || undefined,
      category,
      tracking,
      primaryMuscles: primary,
      secondaryMuscles: secondary,
      equipment,
      level,
      tips: tips.trim() || undefined,
      instructions: instructions
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      images: images
        .split(/[\n,]/)
        .map((l) => l.trim())
        .filter(Boolean),
      isFavorite: favorite,
    }
    if (exercise) {
      if (!exercise.isCustom) {
        // Base intégrée en lecture seule : on crée une copie personnalisée.
        const created = addExercise({ ...payload, name: `${name.trim()} (copie)` })
        onCreated?.(created)
        notify('Copie personnalisée créée', 'success')
        onClose()
        return
      }
      updateExercise(exercise.id, payload)
    } else {
      const created = addExercise(payload)
      onCreated?.(created)
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exercise ? 'Modifier l’exercice' : 'Nouvel exercice'}
      size="lg"
      footer={
        <div className="flex items-center gap-2">
          {exercise && exercise.isCustom && (
            <IconButton
              label="Supprimer"
              className="h-10 w-10 border border-line text-danger"
              onClick={() => {
                deleteExercise(exercise.id)
                onClose()
              }}
            >
              <Trash2 size={17} />
            </IconButton>
          )}
          <Button className="flex-1" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" className="flex-1" onClick={save} disabled={!name.trim()}>
            {exercise ? (readOnly ? 'Dupliquer et enregistrer' : 'Enregistrer') : 'Créer'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {readOnly && (
          <p className="rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5 text-[13px] font-medium text-accent">
            Exercice de la base VeryHevy (lecture seule). L’enregistrement créera une copie personnalisée
            modifiable.
          </p>
        )}
        <Field label="Nom de l’exercice">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Développé incliné" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catégorie">
            <Select value={category} onChange={(e) => setCategory(e.target.value as ExerciseCategory)}>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.emoji} {meta.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Matériel">
            <Select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              {EQUIPMENT_LIST.map((eq) => (
                <option key={eq} value={eq}>
                  {eq}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Suivi"
          hint={`Colonnes enregistrées : ${TRACKING_TYPES[tracking].fields
            .map((f) => ({ weight: 'poids', reps: 'reps', duration: 'durée', distance: 'distance' })[f])
            .join(' + ')}`}
        >
          <Select value={tracking} onChange={(e) => setTracking(e.target.value as TrackingType)}>
            {Object.entries(TRACKING_TYPES).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Niveau">
          <div className="flex gap-2">
            {LEVELS.map((l) => (
              <Chip key={l} active={level === l} onClick={() => setLevel(l)}>
                {l}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Muscles principaux">
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.map((m) => (
              <Chip key={m} active={primary.includes(m)} onClick={() => toggle(primary, setPrimary, m)}>
                {m}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Muscles secondaires">
          <div className="flex flex-wrap gap-1.5">
            {MUSCLE_GROUPS.filter((m) => !primary.includes(m)).map((m) => (
              <Chip key={m} active={secondary.includes(m)} onClick={() => toggle(secondary, setSecondary, m)}>
                {m}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="Nom alternatif (recherche)">
          <Input value={altName} onChange={(e) => setAltName(e.target.value)} placeholder="Ex. Bench press" />
        </Field>

        <Field label="Conseil / note technique">
          <Textarea
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            placeholder="Un point clé d’exécution à retenir…"
            className="min-h-16"
          />
        </Field>

        <Field label="Instructions (une par ligne)">
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </Field>

        <Field label="Images (URL, une par ligne)">
          <Textarea value={images} onChange={(e) => setImages(e.target.value)} className="min-h-16" />
        </Field>

        <Checkbox checked={favorite} onChange={setFavorite} label="Ajouter aux favoris" />
      </div>
    </Modal>
  )
}

export function CategoryBadge({ category, className }: { category: ExerciseCategory; className?: string }) {
  const meta = CATEGORY_META[category]
  return (
    <span
      className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold', className)}
      style={{ color: tintText(meta.color), background: tintBg(meta.color) }}
    >
      {meta.emoji} {meta.label}
    </span>
  )
}