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
import { Copy, Dumbbell, GripVertical, MoreVertical, Play, Plus, Replace, Trash2 } from 'lucide-react'
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
import { ExerciseSheet } from '@/components/ExerciseSheet'
import { RestTimeChip, RestTimeModal } from '@/components/RestTimeEditor'
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
  /** Exo dont la fiche est ouverte (nom / icône tapés). */
  const [sheetExerciseId, setSheetExerciseId] = useState<string | null>(null)
  /** Exo dont le temps de repos est en cours d'édition. */
  const [restTarget, setRestTarget] = useState<RoutineExercise | null>(null)
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
                          {/* Même en-tête que la séance en cours : poignée, puis
                              nom / icône qui ouvrent la fiche de l'exercice. */}
                          <header className="flex items-start gap-2 px-3 pt-3 pb-2">
                            <button
                              {...handle}
                              className="mt-1 -ml-1 flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted/50 touch-none hover:text-muted active:cursor-grabbing"
                              aria-label={t('routine.reorder')}
                            >
                              <GripVertical size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSheetExerciseId(re.exerciseId)}
                              title={t('logger.viewExercise')}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              {ex && <ExerciseAvatar exercise={ex} size={36} />}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">
                                  {ex?.name ?? re.exerciseName ?? t('workout.deletedExercise')}
                                </span>
                                {ex && (
                                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                                    <CategoryBadge category={ex.category} />
                                  </span>
                                )}
                              </span>
                            </button>
                            <Menu
                              align="right"
                              trigger={({ toggle }) => (
                                <IconButton label={t('workout.optionsMenu')} onClick={toggle}>
                                  <MoreVertical size={17} />
                                </IconButton>
                              )}
                              items={[
                                { label: t('logger.viewExercise'), icon: <Dumbbell size={14} />, onClick: () => setSheetExerciseId(re.exerciseId) },
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
                          </header>

                          {/* Colonnes : les unités vivent en haut (jamais en
                              suffixe dans le champ), comme dans la séance. */}
                          <div className="flex items-center gap-1 px-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                            <span className="w-6 text-center">#</span>
                            {fields.map((f) => (
                              <span
                                key={f}
                                className={cn(
                                  'min-w-0 flex-1 text-center',
                                  f === 'weight' || f === 'distance' ? 'flex-[1.15]' : '',
                                )}
                              >
                                {{ weight: settings.unit, reps: 'reps', duration: 'durée', distance: settings.distanceUnit }[f]}
                              </span>
                            ))}
                            <span className="w-9" />
                          </div>

                          <div className="space-y-0.5 px-2 pb-1">
                            {re.sets.map((set, i) => (
                              <div key={i} className="group flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 transition-colors hover:bg-surface-2">
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
                                  className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-[12px] font-extrabold transition-colors hover:bg-surface-3"
                                >
                                  {SET_TYPE_META[set.type].short || i + 1}
                                </button>

                                {fields.includes('weight') && (
                                  <NumberField
                                    compact
                                    stepless
                                    className="h-9 min-w-0 flex-[1.15] border-transparent bg-surface-2/70"
                                    value={kgToInput(set.weight, settings.unit)}
                                    onChange={(v) => updateSets(re, i, { weight: inputToKg(v, settings.unit) })}
                                    step={settings.unit === 'lb' ? 5 : 2.5}
                                    decimals={settings.unit === 'kg' ? 2 : 1}
                                    placeholder="0"
                                    ariaLabel={t('routine.loadAria', { n: i + 1 })}
                                  />
                                )}
                                {fields.includes('reps') && (
                                  <NumberField
                                    compact
                                    stepless
                                    className="h-9 min-w-0 flex-1 border-transparent bg-surface-2/70"
                                    value={set.reps}
                                    onChange={(v) => updateSets(re, i, { reps: v })}
                                    step={1}
                                    decimals={0}
                                    placeholder="0"
                                    ariaLabel={t('routine.repsAria', { n: i + 1 })}
                                  />
                                )}
                                {fields.includes('duration') && (
                                  <DurationField
                                    value={set.duration}
                                    onChange={(v) => updateSets(re, i, { duration: v })}
                                    ariaLabel={t('routine.durationAria', { n: i + 1 })}
                                    className="min-w-0 flex-1 border-transparent bg-surface-2/70"
                                  />
                                )}
                                {fields.includes('distance') && (
                                  <NumberField
                                    compact
                                    stepless
                                    className="h-9 min-w-0 flex-[1.15] border-transparent bg-surface-2/70"
                                    value={metersToDisplay(set.distance, settings.distanceUnit)}
                                    onChange={(v) => updateSets(re, i, { distance: displayToMeters(v, settings.distanceUnit) })}
                                    step={settings.distanceUnit === 'km' ? 0.1 : 0.05}
                                    decimals={2}
                                    placeholder="0"
                                    ariaLabel={t('routine.distanceAria', { n: i + 1 })}
                                  />
                                )}

                                <span className="ml-auto shrink-0 pl-0.5">
                                  <IconButton
                                    label={t('routine.deleteSet')}
                                    className="h-8 w-8"
                                    onClick={() =>
                                      updateRoutineExercise(routine.id, re.id, {
                                        sets: re.sets.filter((_, j) => j !== i),
                                      })
                                    }
                                  >
                                    <Trash2 size={15} />
                                  </IconButton>
                                </span>
                              </div>
                            ))}
                          </div>

                          <footer className="flex items-center gap-2 border-t border-line bg-surface-2/40 px-2 py-2">
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
                            <Plus size={14} /> {t('routine.addSet')}
                          </Button>
                          {/* Temps de repos : même pastille et même modale que
                              dans la séance en cours. */}
                          <div className="ml-auto">
                            <RestTimeChip seconds={re.restSeconds} onEdit={() => setRestTarget(re)} />
                          </div>
                          </footer>
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
        className="safe-b glass fixed inset-x-0 bottom-[calc(var(--bottom-stack,62px)+var(--kb-inset,0px))] z-30 border-t border-line px-4 py-3 lg:left-64"
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

      {/* Fiche exercice (nom / icône) et temps de repos : mêmes composants que
          dans la séance en cours. */}
      <ExerciseSheet exerciseId={sheetExerciseId} onClose={() => setSheetExerciseId(null)} />

      <RestTimeModal
        open={Boolean(restTarget)}
        onClose={() => setRestTarget(null)}
        exerciseName={exerciseMap.get(restTarget?.exerciseId ?? '')?.name ?? restTarget?.exerciseName}
        value={restTarget?.restSeconds ?? 90}
        onSave={(seconds) => {
          if (restTarget) updateRoutineExercise(routine.id, restTarget.id, { restSeconds: seconds })
        }}
      />
    </div>
  )
}