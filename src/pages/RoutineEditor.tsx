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
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  NumberField,
  Textarea,
} from '@/components/ui'
import { ExercisePicker, ExerciseAvatar } from '@/components/ExercisePicker'
import { CategoryBadge } from '@/components/ExerciseFormModal'
import { useBottomBar } from '@/hooks/app'
import { cn, inputToKg, kgToInput } from '@/lib/utils'

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
        <PageHeader title="Programme" back="/programmes" />
        <Page>
          <Card>
            <EmptyState
              icon={<Trash2 size={24} />}
              title="Programme introuvable"
              action={
                <Button variant="primary" onClick={() => navigate('/programmes')}>
                  Retour aux programmes
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
        title="Modifier le programme"
        subtitle={`${routine.exercises.length} exercice${routine.exercises.length > 1 ? 's' : ''}`}
        actions={
          <>
            <IconButton label="Dupliquer" onClick={() => navigate(`/programmes/${duplicateRoutine(routine.id)}`)}>
              <Copy size={17} />
            </IconButton>
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <IconButton label="Options" onClick={toggle}>
                  <MoreVertical size={18} />
                </IconButton>
              )}
              items={[
                {
                  label: 'Supprimer le programme',
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
          <Field label="Nom">
            <Input value={routine.name} onChange={(e) => updateRoutine(routine.id, { name: e.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea
              value={routine.description ?? ''}
              onChange={(e) => updateRoutine(routine.id, { description: e.target.value })}
              className="min-h-16"
              placeholder="Objectif, fréquence, notes…"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dossier">
              <Input
                value={routine.folder ?? ''}
                onChange={(e) => updateRoutine(routine.id, { folder: e.target.value })}
                placeholder="Ex. PPL, Cardio…"
              />
            </Field>
            <Field label="Couleur">
              <input
                type="color"
                value={routine.color}
                onChange={(e) => updateRoutine(routine.id, { color: e.target.value })}
                className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface-2 px-2"
              />
            </Field>
          </div>
        </Card>

        {routine.exercises.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Plus size={24} />}
              title="Programme vide"
              message="Ajoutez les exercices de cette séance."
              action={
                <Button variant="primary" onClick={() => setPickerOpen(true)}>
                  <Plus size={16} /> Ajouter des exercices
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
                              aria-label="Réordonner"
                            >
                              <GripVertical size={16} />
                            </button>
                            {ex && <ExerciseAvatar exercise={ex} size={32} />}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{ex?.name ?? 'Exercice supprimé'}</p>
                              {ex && <CategoryBadge category={ex.category} />}
                            </div>
                            <Menu
                              align="right"
                              trigger={({ toggle }) => (
                                <IconButton label="Options" onClick={toggle}>
                                  <MoreVertical size={16} />
                                </IconButton>
                              )}
                              items={[
                                { label: 'Remplacer', icon: <Replace size={14} />, onClick: () => setReplaceTarget(re.id) },
                                {
                                  label: 'Monter',
                                  icon: null,
                                  hidden: index === 0,
                                  onClick: () => moveRoutineExercise(routine.id, re.id, index - 1),
                                },
                                {
                                  label: 'Descendre',
                                  icon: null,
                                  hidden: index === routine.exercises.length - 1,
                                  onClick: () => moveRoutineExercise(routine.id, re.id, index + 1),
                                },
                                {
                                  label: 'Supprimer',
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
                                  title={`Type de série : ${SET_TYPE_META[set.type].label}`}
                                  aria-label={`Type de série : ${SET_TYPE_META[set.type].label}`}
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
                                    ariaLabel={`Charge série ${i + 1}`}
                                  />
                                )}
                                {fields.includes('reps') && (
                                  <NumberField
                                    className="h-9 flex-1 border-transparent bg-surface-2/60"
                                    value={set.reps}
                                    onChange={(v) => updateSets(re, i, { reps: v })}
                                    step={1}
                                    decimals={0}
                                    placeholder="reps"
                                    ariaLabel={`Reps série ${i + 1}`}
                                  />
                                )}
                                {fields.includes('duration') && (
                                  <NumberField
                                    className="h-9 flex-1 border-transparent bg-surface-2/60"
                                    value={set.duration}
                                    onChange={(v) => updateSets(re, i, { duration: v })}
                                    step={5}
                                    decimals={0}
                                    placeholder="durée"
                                    suffix="s"
                                    ariaLabel={`Durée série ${i + 1}`}
                                  />
                                )}
                                {fields.includes('distance') && (
                                  <NumberField
                                    className="h-9 flex-1 border-transparent bg-surface-2/60"
                                    value={set.distance}
                                    onChange={(v) => updateSets(re, i, { distance: v })}
                                    step={100}
                                    decimals={0}
                                    placeholder="mètres"
                                    suffix="m"
                                    ariaLabel={`Distance série ${i + 1}`}
                                  />
                                )}

                                <IconButton
                                  label="Supprimer la série"
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
                                <Plus size={13} /> Série
                              </Button>
                              <div className="ml-auto flex items-center gap-2">
                                <span className="text-[11px] text-muted">Repos</span>
                                <NumberField
                                  className="h-8 w-24 border-transparent bg-surface-2/60"
                                  value={re.restSeconds}
                                  onChange={(v) => updateRoutineExercise(routine.id, re.id, { restSeconds: v ?? 90 })}
                                  step={15}
                                  min={0}
                                  decimals={0}
                                  suffix="s"
                                  ariaLabel="Temps de repos"
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
          <Plus size={16} /> Ajouter un exercice
        </Button>
      </Page>

      {/* Barre d'action : posée au-dessus de la navigation mobile, jamais dessous */}
      <div
        ref={bottomBarRef}
        className="safe-b glass fixed inset-x-0 bottom-[var(--bottom-stack,62px)] z-30 border-t border-line px-4 py-3 lg:left-64"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button variant="ghost" onClick={() => navigate('/programmes')}>
            Fermer
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => {
              if (!routine.exercises.length) {
                notify('Ajoutez au moins un exercice', 'error')
                return
              }
              startWorkout({ templateId: routine.id, templateName: routine.name })
              navigate('/seance')
            }}
          >
            <Play size={18} /> Démarrer ce programme
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
        title="Remplacer par…"
        onPick={(ids) => {
          if (replaceTarget && ids[0]) {
            updateRoutineExercise(routine.id, replaceTarget, { exerciseId: ids[0] })
          }
          setReplaceTarget(null)
        }}
      />
    </div>
  )
}