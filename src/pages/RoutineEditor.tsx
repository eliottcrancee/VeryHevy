import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Copy, GripVertical, MoreVertical, Play, Plus, Replace, Trash2 } from 'lucide-react'
import type { RoutineExercise, SetType } from '@/types'
import { SET_TYPE_META } from '@/types'
import { useStore, trackingFieldsOf } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import {
  Button,
  Card,
  DurationField,
  EmptyState,
  Field,
  ColorPicker,
  IconButton,
  Input,
  Menu,
  NumberField,
  Textarea,
} from '@/components/ui'
import { ExercisePicker, ExerciseAvatar } from '@/components/ExercisePicker'
import { CategoryBadge } from '@/components/ExerciseFormModal'
import { useBottomBar } from '@/hooks/app'
import { cn, displayToMeters, inputToKg, kgToInput, metersToDisplay } from '@/lib/utils'
import { t, tx, useLang } from '@/lib/i18n'

/* ------------------------------------------------------------------ */

function SortableRow({ id, children }: { id: string; children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && 'relative z-20 opacity-90')}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

/* ------------------------------------------------------------------ */

export default function RoutineEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useLang()
  const routine = useStore((s) => s.routines.find((r) => r.id === id))
  const exercises = useStore((s) => s.exercises)
  const updateRoutine = useStore((s) => s.updateRoutine)
  const deleteRoutine = useStore((s) => s.deleteRoutine)
  const duplicateRoutine = useStore((s) => s.duplicateRoutine)
  const addExerciseToRoutine = useStore((s) => s.addExerciseToRoutine)
  const removeRoutineExercise = useStore((s) => s.removeRoutineExercise)
  const updateRoutineExercise = useStore((s) => s.updateRoutineExercise)
  const moveRoutineExercise = useStore((s) => s.moveRoutineExercise)
  const startWorkout = useStore((s) => s.startWorkout)
  const notify = useStore((s) => s.notify)
  const settings = useStore((s) => s.settings)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const bottomBarRef = useBottomBar()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!routine) {
    return (
      <div>
        <PageHeader title={t('routine.programTitle')} back="/programmes" />
        <Page>
          <Card>
            <EmptyState
              icon={<Trash2 size={24} />}
              title={t('routine.notFound')}
              action={
                <Button variant="primary" onClick={() => navigate('/programmes')}>
                  {t('routine.backToList')}
                </Button>
              }
            />
          </Card>
        </Page>
      </div>
    )
  }

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]))

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const toIndex = routine.exercises.findIndex((x) => x.id === over.id)
    if (toIndex >= 0) moveRoutineExercise(routine.id, String(active.id), toIndex)
  }

  const updateSets = (re: RoutineExercise, index: number, patch: Partial<RoutineExercise['sets'][number]>) => {
    updateRoutineExercise(routine.id, re.id, {
      sets: re.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    })
  }

  return (
    <div>
      <PageHeader
        back="/programmes"
        title={t('routine.editTitle')}
        subtitle={t('routine.exNum', { n: routine.exercises.length })}
        actions={
          <>
            <IconButton label={t('routine.duplicate')} onClick={() => navigate(`/programmes/${duplicateRoutine(routine.id)}`)}>
              <Copy size={17} />
            </IconButton>
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <IconButton label={t('workout.optionsMenu')} onClick={toggle}>
                  <MoreVertical size={18} />
                </IconButton>
              )}
              items={[
                {
                  label: t('routine.deleteProgram'),
                  icon: <Trash2 size={15} />,
                  danger: true,
                  onClick: () => {
                    deleteRoutine(routine.id)
                    navigate('/programmes')
                  },
                },
              ]}
            />
          </>
        }
      />

      <Page className="max-w-3xl space-y-4">
        <Card className="space-y-4 p-4">
          <Field label={t('routine.name')}>
            <Input value={routine.name} onChange={(e) => updateRoutine(routine.id, { name: e.target.value })} />
          </Field>
          <Field label={t('routine.description')}>
            <Textarea
              value={routine.description ?? ''}
              onChange={(e) => updateRoutine(routine.id, { description: e.target.value })}
              className="min-h-16"
              placeholder={t('routine.descHint')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('routine.folder')}>
              <Input
                value={routine.folder ?? ''}
                onChange={(e) => updateRoutine(routine.id, { folder: e.target.value })}
                placeholder={t('routine.folderEx')}
              />
            </Field>
            <Field label={t('routine.color')}>
              <div className="pt-1.5">
                <ColorPicker
                  value={routine.color}
                  onChange={(color) => updateRoutine(routine.id, { color })}
                  label={t('routine.color')}
                />
              </div>
            </Field>
          </div>
        </Card>

        {routine.exercises.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Plus size={24} />}
              title={t('routine.emptyProgram')}
              message={t('routine.emptyProgramHint')}
              action={
                <Button variant="primary" onClick={() => setPickerOpen(true)}>
                  <Plus size={16} /> {t('routine.addExercises')}
                </Button>
              }
            />
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={routine.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {routine.exercises.map((re, index) => {
                  const ex = exerciseMap.get(re.exerciseId)
                  const fields = trackingFieldsOf(ex)
                  return (
                    <SortableRow key={re.id} id={re.id}>
                      {(handle) => (
                        <Card className="overflow-hidden">
                          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                            <button
                              {...handle}
                              className="-ml-1 flex h-8 w-6 cursor-grab items-center justify-center text-muted/50 touch-none active:cursor-grabbing"
                              aria-label={t('routine.reorder')}
                            >
                              <GripVertical size={16} />
                            </button>
                            {ex && <ExerciseAvatar exercise={ex} size={32} />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{ex?.name ?? re.exerciseName ?? t('workout.deletedExercise')}</p>
                              {ex && <CategoryBadge category={ex.category} />}
                            </div>
                            <Menu
                              align="right"
                              trigger={({ toggle }) => (
                                <IconButton label={t('workout.optionsMenu')} onClick={toggle}>
                                  <MoreVertical size={16} />
                                </IconButton>
                              )}
                              items={[
                                { label: t('routine.replace'), icon: <Replace size={14} />, onClick: () => setReplaceTarget(re.id) },
                                {
                                  label: t('routine.moveUp'),
                                  icon: null,
                                  hidden: index === 0,
                                  onClick: () => moveRoutineExercise(routine.id, re.id, index - 1),
                                },
                                {
                                  label: t('routine.moveDown'),
                                  icon: null,
                                  hidden: index === routine.exercises.length - 1,
                                  onClick: () => moveRoutineExercise(routine.id, re.id, index + 1),
                                },
                                {
                                  label: t('common.delete'),
                                  icon: <Trash2 size={14} />,
                                  danger: true,
                                  onClick: () => removeRoutineExercise(routine.id, re.id),
                                },
                              ]}
                            />
                          </div>

                          <div className="space-y-1 p-3">
                            {re.sets.map((set, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const order: SetType[] = ['normal', 'echauffement', 'degressive', 'echec']
                                    const next = order[(order.indexOf(set.type) + 1) % order.length]
                                    updateSets(re, i, { type: next })
                                  }}
                                  style={{ color: SET_TYPE_META[set.type].color }}
                                  title={t('routine.setTypeLabel', { type: tx('set', set.type) })}
                                  aria-label={t('routine.setTypeLabel', { type: tx('set', set.type) })}
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[11px] font-extrabold transition-colors hover:bg-surface-3"
                                >
                                  {SET_TYPE_META[set.type].short || i + 1}
                                </button>

                                {fields.includes('weight') && (
                                  <NumberField
                                    className="h-9 flex-1 border-transparent bg-surface-2/60"
                                    value={kgToInput(set.weight, settings.unit)}
                                    onChange={(v) => updateSets(re, i, { weight: inputToKg(v, settings.unit) })}
                                    step={settings.unit === 'lb' ? 5 : 2.5}
                                    decimals={settings.unit === 'kg' ? 2 : 1}
                                    placeholder={settings.unit}
                                    suffix={settings.unit}
                                    ariaLabel={t('routine.loadAria', { n: i + 1 })}
                                  />
                                )}
                                {fields.includes('reps') && (
                                  <NumberField
                                    className="h-9 flex-1 border-transparent bg-surface-2/60"
                                    value={set.reps}
                                    onChange={(v) => updateSets(re, i, { reps: v })}
                                    step={1}
                                    decimals={0}
                                    placeholder={t('routine.repsPh')}
                                    ariaLabel={t('routine.repsAria', { n: i + 1 })}
                                  />
                                )}
                                {fields.includes('duration') && (
                                  <DurationField
                                    value={set.duration}
                                    onChange={(v) => updateSets(re, i, { duration: v })}
                                    ariaLabel={t('routine.durationAria', { n: i + 1 })}
                                    className="min-w-0 flex-1 border-transparent bg-surface-2/60"
                                  />
                                )}
                                {fields.includes('distance') && (
                                  <NumberField
                                    className="h-9 flex-1 border-transparent bg-surface-2/60"
                                    value={metersToDisplay(set.distance, settings.distanceUnit)}
                                    onChange={(v) => updateSets(re, i, { distance: displayToMeters(v, settings.distanceUnit) })}
                                    step={settings.distanceUnit === 'km' ? 0.1 : 0.05}
                                    decimals={2}
                                    placeholder={settings.distanceUnit}
                                    suffix={settings.distanceUnit}
                                    ariaLabel={t('routine.distanceAria', { n: i + 1 })}
                                  />
                                )}

                                <IconButton
                                  label={t('routine.deleteSet')}
                                  className="h-8 w-8"
                                  onClick={() =>
                                    updateRoutineExercise(routine.id, re.id, {
                                      sets: re.sets.filter((_, j) => j !== i),
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </IconButton>
                              </div>
                            ))}

                            <div className="flex items-center gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-accent"
                                onClick={() =>
                                  updateRoutineExercise(routine.id, re.id, {
                                    sets: [
                                      ...re.sets,
                                      {
                                        type: 'normal',
                                        reps: re.sets.at(-1)?.reps,
                                        weight: re.sets.at(-1)?.weight,
                                        duration: re.sets.at(-1)?.duration,
                                        distance: re.sets.at(-1)?.distance,
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus size={13} /> {t('routine.addSet')}
                              </Button>
                              <div className="ml-auto flex items-center gap-2">
                                <span className="text-[11px] text-muted">{t('routine.rest')}</span>
                                <NumberField
                                  className="h-8 w-24 border-transparent bg-surface-2/60"
                                  value={re.restSeconds}
                                  onChange={(v) => updateRoutineExercise(routine.id, re.id, { restSeconds: v ?? 90 })}
                                  step={15}
                                  min={0}
                                  decimals={0}
                                  suffix="s"
                                  ariaLabel={t('routine.restAria')}
                                />
                              </div>
                            </div>
                          </div>
                        </Card>
                      )}
                    </SortableRow>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Button block variant="outline" onClick={() => setPickerOpen(true)}>
          <Plus size={16} /> {t('workout.addExercise')}
        </Button>
      </Page>

      {/* Barre d'action : posée au-dessus de la navigation mobile, jamais dessous */}
      <div
        ref={bottomBarRef}
        className="safe-b glass fixed inset-x-0 bottom-[var(--bottom-stack,62px)] z-30 border-t border-line px-4 py-3 lg:left-64"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button variant="ghost" onClick={() => navigate('/programmes')}>
            {t('common.close')}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => {
              if (!routine.exercises.length) {
                notify(t('routine.needOneExercise'), 'error')
                return
              }
              startWorkout({ templateId: routine.id, templateName: routine.name })
              navigate('/seance')
            }}
          >
            <Play size={18} /> {t('routine.startProgram')}
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        onPick={(ids) => ids.forEach((exId) => addExerciseToRoutine(routine.id, exId))}
      />

      <ExercisePicker
        open={Boolean(replaceTarget)}
        onClose={() => setReplaceTarget(null)}
        title={t('workout.replaceWith')}
        onPick={(ids) => {
          if (replaceTarget && ids[0]) {
            const name = exercises.find((e) => e.id === ids[0])?.name
            updateRoutineExercise(routine.id, replaceTarget, { exerciseId: ids[0], exerciseName: name })
          }
          setReplaceTarget(null)
        }}
      />
    </div>
  )
}