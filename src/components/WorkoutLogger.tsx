import { useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Link2,
  Link2Off,
  MoreVertical,
  Plus,
  Replace,
  StickyNote,
  Trash2,
} from 'lucide-react'
import type { Exercise, SetType, Workout, WorkoutExercise, WorkoutSet } from '@/types'
import { SET_TYPE_META } from '@/types'
import { Button, CheckBadge, IconButton, Menu, NumberField, Textarea } from '@/components/ui'
import { CategoryBadge } from '@/components/ExerciseFormModal'
import { ExerciseAvatar } from '@/components/ExercisePicker'
import { useStore, trackingFieldsOf } from '@/store/store'
import { estimate1RM, lastPerformance, setVolume } from '@/lib/calc'
import { cn, displayToMeters, formatVolume, formatWeight, inputToKg, kgToInput, metersToDisplay } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/* Une ligne de série                                                  */
/* ------------------------------------------------------------------ */

interface SetRowProps {
  workoutId: string
  we: WorkoutExercise
  set: WorkoutSet
  index: number
  exercise: Exercise | undefined
  unit: 'kg' | 'lb'
  distanceUnit: 'km' | 'mi'
  showRpe: boolean
  onReplace: () => void
}

export function SetRow({ workoutId, we, set, index, exercise, unit, distanceUnit, showRpe, onReplace }: SetRowProps) {
  const updateSet = useStore((s) => s.updateSet)
  const removeSet = useStore((s) => s.removeSet)
  const duplicateSet = useStore((s) => s.duplicateWorkoutSet)
  const toggleSetCompleted = useStore((s) => s.toggleSetCompleted)
  const setSetType = useStore((s) => s.setSetType)

  const fields = trackingFieldsOf(exercise)
  const meta = SET_TYPE_META[set.type]
  const isWarmup = set.type === 'echauffement'

  const patch = (p: Partial<WorkoutSet>) => updateSet(workoutId, we.id, set.id, p)

  const distanceInDisplay = metersToDisplay(set.distance, distanceUnit)

  const cycleType = () => {
    const order: SetType[] = ['normal', 'echauffement', 'degressive', 'echec']
    const next = order[(order.indexOf(set.type) + 1) % order.length]
    setSetType(workoutId, we.id, set.id, next)
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg px-1 py-1 transition-colors',
        set.completed ? 'bg-success/5' : 'hover:bg-surface-2',
        isWarmup && 'opacity-80',
      )}
    >
      <CheckBadge done={set.completed} onClick={() => toggleSetCompleted(workoutId, we.id, set.id)} size={30} />

      <button
        type="button"
        onClick={cycleType}
        title={`Type : ${meta.label}`}
        style={{ color: meta.color }}
        className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-[11px] font-extrabold"
      >
        {meta.short || index + 1}
      </button>

      {fields.map((field) => {
        if (field === 'weight') {
          return (
            <NumberField
              key={field}
              ariaLabel={`Poids série ${index + 1}`}
              value={kgToInput(set.weight, unit)}
              onChange={(v) => patch({ weight: inputToKg(v, unit) })}
              step={unit === 'lb' ? 5 : exercise?.tracking === 'bodyweight_reps' ? 5 : 2.5}
              decimals={unit === 'kg' ? 2 : 1}
              placeholder={exercise?.tracking === 'bodyweight_reps' ? 'PDC' : '0'}
              suffix={unit}
              className="h-9 flex-[1.15] border-transparent bg-surface-2/70"
            />
          )
        }
        if (field === 'reps') {
          return (
            <NumberField
              key={field}
              ariaLabel={`Répétitions série ${index + 1}`}
              value={set.reps}
              onChange={(v) => patch({ reps: v })}
              step={1}
              decimals={0}
              placeholder="0"
              className="h-9 flex-1 border-transparent bg-surface-2/70"
            />
          )
        }
        if (field === 'duration') {
          return (
            <NumberField
              key={field}
              ariaLabel={`Durée série ${index + 1}`}
              value={set.duration}
              onChange={(v) => patch({ duration: v })}
              step={5}
              decimals={0}
              placeholder="0"
              suffix="s"
              className="h-9 flex-1 border-transparent bg-surface-2/70"
            />
          )
        }
        return (
          <NumberField
            key={field}
            ariaLabel={`Distance série ${index + 1}`}
            value={distanceInDisplay}
            onChange={(v) =>
              patch({ distance: displayToMeters(v, distanceUnit) })
            }
            step={0.1}
            decimals={2}
            placeholder="0"
            suffix={distanceUnit}
            className="h-9 flex-[1.15] border-transparent bg-surface-2/70"
          />
        )
      })}

      {showRpe && (
        <NumberField
          ariaLabel={`RPE série ${index + 1}`}
          value={set.rpe}
          onChange={(v) => patch({ rpe: v })}
          step={0.5}
          min={1}
          max={10}
          decimals={1}
          placeholder="RPE"
          className="h-9 w-16 border-transparent bg-surface-2/70"
        />
      )}

      <Menu
        align="right"
        trigger={({ toggle }) => (
          <IconButton
            label="Options de la série"
            onClick={toggle}
            className="h-8 w-8 opacity-50 group-hover:opacity-100"
          >
            <MoreVertical size={15} />
          </IconButton>
        )}
        items={[
          { label: 'Dupliquer la série', icon: <Copy size={14} />, onClick: () => duplicateSet(workoutId, we.id, set.id) },
          { label: 'Remplacer l’exercice', icon: <Replace size={14} />, onClick: onReplace },
          { label: 'Supprimer la série', icon: <Trash2 size={14} />, danger: true, onClick: () => removeSet(workoutId, we.id, set.id) },
        ]}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Carte d'un exercice dans la séance                                  */
/* ------------------------------------------------------------------ */

interface CardProps {
  workout: Workout
  we: WorkoutExercise
  exercise: Exercise | undefined
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  onReplace: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onSuperset?: () => void
  isSuperset?: boolean
  linkAction?: React.ReactNode
}

export function WorkoutExerciseCard({
  workout,
  we,
  exercise,
  dragHandleProps,
  onReplace,
  onMoveUp,
  onMoveDown,
  onSuperset,
  isSuperset,
  linkAction,
}: CardProps) {
  const settings = useStore((s) => s.settings)
  const addSet = useStore((s) => s.addSet)
  const updateWorkoutExercise = useStore((s) => s.updateWorkoutExercise)
  const removeWorkoutExercise = useStore((s) => s.removeWorkoutExercise)
  const completeAllSets = useStore((s) => s.completeAllSets)
  const workouts = useStore((s) => s.workouts)
  const startRest = useStore((s) => s.startRest)
  const [showNotes, setShowNotes] = useState(Boolean(we.notes))

  const reference = useMemo(
    () => (exercise ? lastPerformance(workouts, exercise.id, workout.id) : undefined),
    [workouts, exercise, workout.id],
  )

  const doneSets = we.sets.filter((s) => s.completed)
  const volume = doneSets.reduce((n, s) => n + setVolume(s), 0)
  const bestE1rm = Math.max(0, ...doneSets.map((s) => estimate1RM(s.weight, s.reps)))
  const allDone = we.sets.length > 0 && doneSets.length === we.sets.length

  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border bg-surface transition-colors',
        isSuperset ? 'border-info/50' : 'border-line',
      )}
    >
      {/* En-tête */}
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <button
          {...dragHandleProps}
          className="mt-1 -ml-1 flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted/50 touch-none hover:text-muted active:cursor-grabbing"
          aria-label="Réordonner"
        >
          <GripVertical size={16} />
        </button>

        <button type="button" onClick={onReplace} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          {exercise && <ExerciseAvatar exercise={exercise} size={36} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold">{exercise?.name ?? 'Exercice supprimé'}</span>
              {isSuperset && <Link2 size={12} className="shrink-0 text-info" />}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              {exercise && <CategoryBadge category={exercise.category} />}
              {reference && reference.sets.length > 0 && (
                <span className="tabular">
                  Précédent :{' '}
                  {reference.sets
                    .slice(0, 3)
                    .map((s) =>
                      [s.weight ? formatWeight(s.weight, settings.unit, false) : null, s.reps, s.duration ? `${s.duration}s` : null]
                        .filter(Boolean)
                        .join('×'),
                    )
                    .join(' · ')}
                </span>
              )}
            </span>
          </span>
        </button>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <IconButton label="Options de l’exercice" onClick={toggle}>
              <MoreVertical size={17} />
            </IconButton>
          )}
          items={[
            { label: 'Remplacer l’exercice', icon: <Replace size={14} />, onClick: onReplace },
            { label: 'Déplacer vers le haut', icon: <ArrowUp size={14} />, onClick: () => onMoveUp?.(), hidden: !onMoveUp },
            { label: 'Déplacer vers le bas', icon: <ArrowDown size={14} />, onClick: () => onMoveDown?.(), hidden: !onMoveDown },
            {
              label: isSuperset ? 'Retirer du superset' : 'Créer un superset',
              icon: isSuperset ? <Link2Off size={14} /> : <Link2 size={14} />,
              onClick: () => onSuperset?.(),
              hidden: !onSuperset,
            },
            {
              label: we.notes ? 'Modifier la note' : 'Ajouter une note',
              icon: <StickyNote size={14} />,
              onClick: () => setShowNotes(true),
            },
            {
              label: 'Supprimer l’exercice',
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => removeWorkoutExercise(workout.id, we.id),
            },
          ]}
        />
      </header>

      {/* Colonnes */}
      <div className="flex items-center gap-1 px-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
        <span className="w-[30px]" />
        <span className="w-6 text-center">#</span>
        {trackingFieldsOf(exercise).map((f) => (
          <span key={f} className={cn('flex-1 text-center', f === 'weight' || f === 'distance' ? 'flex-[1.15]' : '')}>
            {{ weight: settings.unit, reps: 'reps', duration: 'durée', distance: settings.distanceUnit }[f]}
          </span>
        ))}
        {settings.showRpe && <span className="w-16 text-center">rpe</span>}
        <span className="w-8" />
      </div>

      {/* Séries */}
      <div className="space-y-0.5 px-2 pb-1">
        {we.sets.map((set, i) => (
          <SetRow
            key={set.id}
            workoutId={workout.id}
            we={we}
            set={set}
            index={i}
            exercise={exercise}
            unit={settings.unit}
            distanceUnit={settings.distanceUnit}
            showRpe={settings.showRpe}
            onReplace={onReplace}
          />
        ))}
      </div>

      {showNotes && (
        <div className="px-3 pb-2">
          <Textarea
            autoFocus={!we.notes}
            value={we.notes ?? ''}
            placeholder="Note sur cet exercice (sensation, réglage machine…)"
            className="min-h-16 text-[13px]"
            onChange={(e) => updateWorkoutExercise(workout.id, we.id, { notes: e.target.value })}
            onBlur={() => {
              if (!we.notes?.trim()) setShowNotes(false)
            }}
          />
        </div>
      )}

      {/* Pied de carte */}
      <footer className="flex items-center gap-2 border-t border-line bg-surface-2/40 px-2 py-2">
        {linkAction}
        <Button size="sm" variant="ghost" onClick={() => addSet(workout.id, we.id)} className="text-accent">
          <Plus size={14} /> Série
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => completeAllSets(workout.id, we.id)}
          className={cn(allDone ? 'text-warning' : 'text-success')}
        >
          {allDone ? 'Tout décocher' : 'Tout valider'}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => startRest(we.restSeconds, { label: exercise?.name, exerciseId: exercise?.id })}
            className="tabular rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
            title="Lancer le repos"
          >
            ⏱ {we.restSeconds}s
          </button>
          {volume > 0 && <span className="tabular text-[11px] text-muted">{formatVolume(volume, settings.unit)}</span>}
          {bestE1rm > 0 && (
            <span className="tabular text-[11px] font-semibold text-accent" title="1RM estimé de la séance">
              ~{formatWeight(bestE1rm, settings.unit)}
            </span>
          )}
        </div>
      </footer>
    </section>
  )
}