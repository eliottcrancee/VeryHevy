import { memo, useCallback, useMemo, useState } from 'react'
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
import { Button, CheckBadge, DurationField, IconButton, Menu, Modal, NumberField, Textarea } from '@/components/ui'
import { CategoryBadge } from '@/components/ExerciseFormModal'
import { ExerciseAvatar } from '@/components/ExercisePicker'
import { t, useLang } from '@/lib/i18n'
import { useStore, trackingFieldsOf } from '@/store/store'
import { estimate1RM, isSetValidatable, lastPerformance, lastPerformanceInTemplate, setVolume } from '@/lib/calc'
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

/**
 * Un champ de saisie isolé : ne s'abonne qu'à SA valeur primitive dans le
 * store, avec un callback stable. Pendant la frappe, seul ce mini composant
 * se re-rend (pas toute la page) — indispensable au clavier sur téléphone.
 */
const SetFieldInput = memo(function SetFieldInput({
  workoutId,
  weId,
  setId,
  index,
  field,
  exercise,
  unit,
  distanceUnit,
}: {
  workoutId: string
  weId: string
  setId: string
  index: number
  field: 'weight' | 'reps' | 'duration' | 'distance' | 'rpe'
  exercise: Exercise | undefined
  unit: 'kg' | 'lb'
  distanceUnit: 'km' | 'mi'
}) {
  const updateSet = useStore((s) => s.updateSet)
  const raw = useStore((s) => {
    const st = s.workouts
      .find((w) => w.id === workoutId)
      ?.exercises.find((e) => e.id === weId)
      ?.sets.find((x) => x.id === setId)
    if (!st) return undefined
    switch (field) {
      case 'weight':
        return st.weight
      case 'reps':
        return st.reps
      case 'duration':
        return st.duration
      case 'distance':
        return st.distance
      case 'rpe':
        return st.rpe
    }
  })
  // Fantôme = valeur pré-remplie jamais touchée (et série non validée).
  const touched = useStore((s) => {
    const st = s.workouts
      .find((w) => w.id === workoutId)
      ?.exercises.find((e) => e.id === weId)
      ?.sets.find((x) => x.id === setId)
    return st?.touched?.[field] ?? false
  })
  const completed = useStore((s) => {
    const st = s.workouts
      .find((w) => w.id === workoutId)
      ?.exercises.find((e) => e.id === weId)
      ?.sets.find((x) => x.id === setId)
    return st?.completed ?? false
  })
  const phantom = raw !== undefined && !touched && !completed

  const handleNumber = useCallback(
    (v: number | undefined) => {
      switch (field) {
        case 'weight':
          updateSet(workoutId, weId, setId, { weight: inputToKg(v, unit) })
          break
        case 'reps':
          updateSet(workoutId, weId, setId, { reps: v })
          break
        case 'distance':
          updateSet(workoutId, weId, setId, { distance: displayToMeters(v, distanceUnit) })
          break
        case 'rpe':
          updateSet(workoutId, weId, setId, { rpe: v })
          break
        case 'duration':
          updateSet(workoutId, weId, setId, { duration: v })
          break
      }
    },
    [updateSet, workoutId, weId, setId, field, unit, distanceUnit],
  )

  if (field === 'duration') {
    return (
      <DurationField
        value={raw}
        onChange={handleNumber}
        ariaLabel={`Durée série ${index + 1}`}
        phantom={phantom}
        className="min-w-0 flex-1 border-transparent bg-surface-2/70"
      />
    )
  }

  const label = `Série ${index + 1}`
  switch (field) {
    case 'weight':
      return (
        <NumberField
          compact
          stepless
          ariaLabel={`Poids ${label.toLowerCase()}`}
          value={kgToInput(raw, unit)}
          onChange={handleNumber}
          decimals={unit === 'kg' ? 2 : 1}
          placeholder={exercise?.tracking === 'bodyweight_reps' ? 'PDC' : '0'}
          phantom={phantom}
          className="h-9 min-w-0 flex-[1.15] border-transparent bg-surface-2/70"
        />
      )
    case 'reps':
      return (
        <NumberField
          compact
          stepless
          ariaLabel={`Répétitions ${label.toLowerCase()}`}
          value={raw}
          onChange={handleNumber}
          decimals={0}
          placeholder="0"
          phantom={phantom}
          className="h-9 min-w-0 flex-1 border-transparent bg-surface-2/70"
        />
      )
    case 'distance':
      return (
        <NumberField
          compact
          stepless
          ariaLabel={`Distance ${label.toLowerCase()}`}
          value={metersToDisplay(raw, distanceUnit)}
          onChange={handleNumber}
          decimals={2}
          placeholder="0"
          phantom={phantom}
          className="h-9 min-w-0 flex-[1.15] border-transparent bg-surface-2/70"
        />
      )
    case 'rpe':
      return (
        <NumberField
          compact
          stepless
          ariaLabel={`RPE ${label.toLowerCase()}`}
          value={raw}
          onChange={handleNumber}
          min={1}
          max={10}
          decimals={1}
          placeholder="RPE"
          phantom={phantom}
          className="h-9 w-14 shrink-0 border-transparent bg-surface-2/70"
        />
      )
  }
  return null
})

export function SetRow({ workoutId, we, set, index, exercise, unit, distanceUnit, showRpe, onReplace }: SetRowProps) {
  useLang()
  const removeSet = useStore((s) => s.removeSet)
  const duplicateSet = useStore((s) => s.duplicateWorkoutSet)
  const toggleSetCompleted = useStore((s) => s.toggleSetCompleted)
  const setSetType = useStore((s) => s.setSetType)

  const fields = trackingFieldsOf(exercise)
  const meta = SET_TYPE_META[set.type]
  const isWarmup = set.type === 'echauffement'

  const cycleType = () => {
    const order: SetType[] = ['normal', 'echauffement', 'degressive', 'echec']
    const next = order[(order.indexOf(set.type) + 1) % order.length]
    setSetType(workoutId, we.id, set.id, next)
  }

  return (
    <div
      className={cn(
        'group flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 transition-colors',
        set.completed ? 'bg-success/5' : 'hover:bg-surface-2',
        isWarmup && 'opacity-80',
      )}
    >
      {/* Menu à gauche (3 points), validation à droite : le pouce garde la
          case de validation en bord d'écran, la saisie reste au centre. */}
      <Menu
        align="left"
        trigger={({ toggle }) => (
          <IconButton
            label={t('logger.setOptions')}
            onClick={toggle}
            className="h-8 w-8 shrink-0 opacity-50 group-hover:opacity-100"
          >
            <MoreVertical size={15} />
          </IconButton>
        )}
        items={[
          { label: `Type : ${meta.label} (changer)`, onClick: cycleType },
          { label: t('logger.duplicateSet'), icon: <Copy size={14} />, onClick: () => duplicateSet(workoutId, we.id, set.id) },
          { label: t('logger.replaceExercise'), icon: <Replace size={14} />, onClick: onReplace },
          { label: t('logger.removeSet'), icon: <Trash2 size={14} />, danger: true, onClick: () => removeSet(workoutId, we.id, set.id) },
        ]}
      />

      {/* N° de série (comme E / D / X), toucher pour changer le type. */}
      <button
        type="button"
        onClick={cycleType}
        title={`Série ${index + 1} · ${meta.label} (toucher pour changer le type)`}
        style={{ color: meta.color }}
        className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-[12px] font-extrabold transition-colors hover:bg-surface-3"
      >
        {meta.short || index + 1}
      </button>

      {fields.map((field) => (
        <SetFieldInput
          key={field}
          workoutId={workoutId}
          weId={we.id}
          setId={set.id}
          index={index}
          field={field}
          exercise={exercise}
          unit={unit}
          distanceUnit={distanceUnit}
        />
      ))}

      {showRpe && (
        <SetFieldInput
          workoutId={workoutId}
          weId={we.id}
          setId={set.id}
          index={index}
          field="rpe"
          exercise={exercise}
          unit={unit}
          distanceUnit={distanceUnit}
        />
      )}

      <span className="ml-auto shrink-0 pl-0.5">
        <CheckBadge
          done={set.completed}
          disabled={!set.completed && !isSetValidatable(set)}
          onClick={() => toggleSetCompleted(workoutId, we.id, set.id)}
          size={32}
          title={
            set.completed
              ? t('logger.setCheckedHint')
              : isSetValidatable(set)
                ? `Série ${index + 1} — toucher pour valider`
                : `Série ${index + 1} — renseigne reps, durée ou distance pour valider`
          }
        />
      </span>
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
  useLang()
  const settings = useStore((s) => s.settings)
  const addSet = useStore((s) => s.addSet)
  const updateWorkoutExercise = useStore((s) => s.updateWorkoutExercise)
  const removeWorkoutExercise = useStore((s) => s.removeWorkoutExercise)
  const completeAllSets = useStore((s) => s.completeAllSets)
  const workouts = useStore((s) => s.workouts)
  const startRest = useStore((s) => s.startRest)
  const [showNotes, setShowNotes] = useState(Boolean(we.notes))
  const [restEditOpen, setRestEditOpen] = useState(false)
  const [restDraft, setRestDraft] = useState(we.restSeconds)

  // Rappel « précédent » : en priorité la dernière fois DANS CE programme,
  // sinon la dernière performance globale.
  const reference = useMemo(() => {
    if (!exercise) return undefined
    return (
      lastPerformanceInTemplate(workouts, exercise.id, workout.templateId, workout.id) ??
      lastPerformance(workouts, exercise.id, workout.id)
    )
  }, [workouts, exercise, workout.id, workout.templateId])

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
          aria-label={t('logger.reorder')}
        >
          <GripVertical size={16} />
        </button>

        <button type="button" onClick={onReplace} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          {exercise && <ExerciseAvatar exercise={exercise} size={36} />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-bold">{exercise?.name ?? we.exerciseName ?? 'Exercice supprimé'}</span>
              {isSuperset && <Link2 size={12} className="shrink-0 text-info" />}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              {exercise && <CategoryBadge category={exercise.category} />}
              {reference && reference.sets.length > 0 && (
                <span className="tabular">
                  Précédent{reference.workout.templateId && reference.workout.templateId === workout.templateId ? ' (ce programme)' : ''} :{' '}
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
            <IconButton label={t('logger.setOptions')} onClick={toggle}>
              <MoreVertical size={17} />
            </IconButton>
          )}
          items={[
            { label: t('logger.replaceExercise'), icon: <Replace size={14} />, onClick: onReplace },
            { label: t('logger.moveUp'), icon: <ArrowUp size={14} />, onClick: () => onMoveUp?.(), hidden: !onMoveUp },
            { label: t('logger.moveDown'), icon: <ArrowDown size={14} />, onClick: () => onMoveDown?.(), hidden: !onMoveDown },
            {
              label: isSuperset ? t('logger.supersetRemove') : t('logger.supersetAdd'),
              icon: isSuperset ? <Link2Off size={14} /> : <Link2 size={14} />,
              onClick: () => onSuperset?.(),
              hidden: !onSuperset,
            },
            {
              label: we.notes ? t('logger.noteEdit') : t('logger.noteAdd'),
              icon: <StickyNote size={14} />,
              onClick: () => setShowNotes(true),
            },
            {
              label: t('logger.removeExercise'),
              icon: <Trash2 size={14} />,
              danger: true,
              onClick: () => removeWorkoutExercise(workout.id, we.id),
            },
          ]}
        />
      </header>

      {/* Colonnes — les unités (kg / lb / km / mi) ne sont écrites qu'ici,
          au-dessus des champs, pour laisser toute la largeur à la saisie. */}
      <div className="flex items-center gap-1 px-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
        <span className="w-8" />
        <span className="w-6 text-center">#</span>
        {trackingFieldsOf(exercise).map((f) => (
          <span key={f} className={cn('min-w-0 flex-1 text-center', f === 'weight' || f === 'distance' ? 'flex-[1.15]' : '')}>
            {{ weight: settings.unit, reps: 'reps', duration: 'durée', distance: settings.distanceUnit }[f]}
          </span>
        ))}
        {settings.showRpe && <span className="w-14 shrink-0 text-center">rpe</span>}
        <span className="w-[34px]" />
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
            placeholder={t('logger.notePlaceholder')}
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
          {allDone ? t('logger.uncheckAll') : t('logger.checkAll')}
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setRestDraft(we.restSeconds)
              setRestEditOpen(true)
            }}
            className="tabular rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
            title={t('logger.restEdit')}
          >
            ⏱ {we.restSeconds}s
          </button>
          <button
            type="button"
            onClick={() => startRest(we.restSeconds, { label: exercise?.name, exerciseId: exercise?.id })}
            className="tabular flex h-7 min-w-7 items-center justify-center rounded-lg bg-surface-2 px-2 text-[11px] font-semibold text-accent transition-colors hover:brightness-110"
            title={t('logger.restStart')}
            aria-label={t('logger.restStart')}
          >
            ▶
          </button>
          {volume > 0 && <span className="tabular text-[11px] text-muted">{formatVolume(volume, settings.unit)}</span>}
          {bestE1rm > 0 && (
            <span className="tabular text-[11px] font-semibold text-accent" title="1RM estimé de la séance">
              ~{formatWeight(bestE1rm, settings.unit)}
            </span>
          )}
        </div>
      </footer>

      {/* Édition du temps de repos (le ▶ lance le chrono sans ouvrir) */}
      <Modal
        open={restEditOpen}
        onClose={() => setRestEditOpen(false)}
        title={`Repos — ${exercise?.name ?? 'exercice'}`}
        size="sm"
      >
        <p className="mb-2 text-xs font-semibold text-muted">Temps de repos par défaut pour cet exercice</p>
        <NumberField
          value={restDraft}
          onChange={(v) => setRestDraft(v ?? 0)}
          step={15}
          min={0}
          max={600}
          decimals={0}
          suffix="s"
          ariaLabel={t('logger.restAria')}
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[30, 60, 90, 120, 180].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRestDraft(s)}
              className={cn(
                'tabular rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
                restDraft === s
                  ? 'border-accent-solid bg-accent-solid text-accent-contrast'
                  : 'border-line bg-surface-2 text-muted hover:text-ink',
              )}
            >
              {s}s
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setRestEditOpen(false)}>
            Annuler
          </Button>
          <Button
            block
            onClick={() => {
              updateWorkoutExercise(workout.id, we.id, { restSeconds: Math.max(0, Math.round(restDraft)) })
              setRestEditOpen(false)
            }}
          >
            Enregistrer
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              const secs = Math.max(0, Math.round(restDraft))
              updateWorkoutExercise(workout.id, we.id, { restSeconds: secs })
              setRestEditOpen(false)
              if (secs > 0) startRest(secs, { label: exercise?.name, exerciseId: exercise?.id })
            }}
          >
            ▶ Lancer
          </Button>
        </div>
      </Modal>
    </section>
  )
}