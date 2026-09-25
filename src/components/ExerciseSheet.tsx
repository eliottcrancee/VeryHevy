import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lightbulb, Plus, Trophy } from 'lucide-react'
import type { PersonalRecord } from '@/lib/calc'
import { CATEGORY_META } from '@/types'
import { useStore, selectActiveWorkout } from '@/store/store'
import { Button, Modal, Stat } from '@/components/ui'
import { arcWorkouts, getPersonalRecords } from '@/lib/calc'
import { formatDistance, formatDuration, formatVolume, formatWeight, tintBg, tintText } from '@/lib/utils'
import { t, tx, useLang } from '@/lib/i18n'

/** Clé i18n du libellé de chaque type de record. */
export const RECORD_LABEL_KEYS: Record<PersonalRecord['kind'], string> = {
  weight: 'workout.recWeight',
  e1rm: 'workout.recE1rm',
  reps: 'workout.recReps',
  volume: 'workout.recVolume',
  duration: 'workout.recDuration',
  distance: 'workout.recDistance',
}

/**
 * Fiche exercice en modale : ouverte depuis la séance en cours ou l'éditeur de
 * programme en tapant le nom / l'icône d'un exo (au lieu de le remplacer).
 * Même contenu essentiel que la page `/exercices/:id` sans quitter la séance ;
 * un bouton mène à la fiche complète (graphes + historique).
 */
export function ExerciseSheet({
  exerciseId,
  onClose,
}: {
  exerciseId: string | null
  onClose: () => void
}) {
  useLang()
  const navigate = useNavigate()
  const exercise = useStore((s) => (exerciseId ? s.exercises.find((e) => e.id === exerciseId) : undefined))
  const workouts = useStore((s) => s.workouts)
  const settings = useStore((s) => s.settings)
  const activeWorkout = useStore(selectActiveWorkout)
  const addExerciseToWorkout = useStore((s) => s.addExerciseToWorkout)
  const notify = useStore((s) => s.notify)

  const records = useMemo(
    () =>
      exercise ? getPersonalRecords(arcWorkouts(workouts, settings.recordsSince), exercise.id) : [],
    [exercise, workouts, settings.recordsSince],
  )

  if (!exercise) return null

  const meta = CATEGORY_META[exercise.category]
  const inWorkout = Boolean(activeWorkout?.exercises.some((we) => we.exerciseId === exercise.id))

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row">
      {activeWorkout && !inWorkout && (
        <Button
          variant="primary"
          block
          onClick={() => {
            addExerciseToWorkout(activeWorkout.id, exercise.id)
            notify(t('exercise.addedToWorkout', { name: exercise.name }), 'success')
            onClose()
          }}
        >
          <Plus size={15} /> {t('exercise.addToWorkout')}
        </Button>
      )}
      <Button
        block
        variant={activeWorkout && !inWorkout ? 'secondary' : 'primary'}
        onClick={() => {
          onClose()
          navigate(`/exercices/${exercise.id}`)
        }}
      >
        {t('exercise.openFull')}
      </Button>
    </div>
  )

  return (
    <Modal open onClose={onClose} title={exercise.name} size="lg" footer={footer}>
      <div className="space-y-4">
        {exercise.images.length > 0 && (
          <img
            src={exercise.images[0]}
            alt=""
            loading="lazy"
            className="aspect-[4/3] w-full rounded-xl border border-line bg-surface-2 object-cover"
          />
        )}

        <div className="flex flex-wrap gap-1.5">
          <span
            className="rounded-lg px-2 py-1 text-[11px] font-bold"
            style={{ color: tintText(meta.color), background: tintBg(meta.color, 15) }}
          >
            {meta.emoji} {tx('cat', exercise.category)}
          </span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
            {tx('equip', exercise.equipment)}
          </span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
            {tx('level', exercise.level)}
          </span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
            {tx('track', exercise.tracking)}
          </span>
          {exercise.isCustom && (
            <span className="rounded-lg bg-accent-soft px-2 py-1 text-[11px] font-bold text-accent">
              {t('exercise.customBadge')}
            </span>
          )}
        </div>

        {/* Muscles travaillés */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('exercise.musclesUsed')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {exercise.primaryMuscles.map((m) => (
              <span key={m} className="rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-bold text-accent">
                {tx('muscle', m)}
              </span>
            ))}
            {exercise.secondaryMuscles.map((m) => (
              <span key={m} className="rounded-lg bg-surface-2 px-2 py-1 text-[12px] text-muted">
                {tx('muscle', m)}
              </span>
            ))}
            {!exercise.primaryMuscles.length && !exercise.secondaryMuscles.length && (
              <span className="text-sm text-muted">{t('exercise.notSpecified')}</span>
            )}
          </div>
        </div>

        {exercise.tips && (
          <div className="flex items-start gap-2 rounded-xl border border-accent-line bg-accent-soft p-3">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[13px] font-medium">{exercise.tips}</p>
          </div>
        )}

        {/* Records (arc en cours) */}
        {records.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
              {t('exercise.prTitle')}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {records.map((r) => (
                <Stat
                  key={r.kind}
                  compact
                  label={t(RECORD_LABEL_KEYS[r.kind])}
                  icon={<Trophy size={11} />}
                  value={
                    r.kind === 'weight' || r.kind === 'e1rm'
                      ? formatWeight(r.value, settings.unit)
                      : r.kind === 'duration'
                        ? formatDuration(r.value)
                        : r.kind === 'distance'
                          ? formatDistance(r.value, settings.distanceUnit)
                          : r.kind === 'volume'
                            ? formatVolume(r.value, settings.unit)
                            : Math.round(r.value).toLocaleString('fr-FR')
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* Exécution */}
        <div>
          <p className="mb-1.5 text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('exercise.execution')}
          </p>
          {exercise.instructions.length ? (
            <ol className="space-y-2">
              {exercise.instructions.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-muted">{step}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">{t('exercise.noInstructions')}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}