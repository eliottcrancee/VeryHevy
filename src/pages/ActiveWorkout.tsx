import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import {
  Check,
  Dumbbell,
  Flag,
  Link2,
  ListChecks,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  Sparkles,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import type { WorkoutExercise } from '@/types'
import { Page, PageHeader } from '@/components/PageHeader'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Modal,
  NumberField,
  Stat,
  Textarea,
} from '@/components/ui'
import { ExercisePicker } from '@/components/ExercisePicker'
import { WorkoutExerciseCard } from '@/components/WorkoutLogger'
import { useStore, selectActiveWorkout } from '@/store/store'
import { workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { cn, formatDuration, formatVolume, inputToKg, kgToInput } from '@/lib/utils'
import { useBottomBar, useInterval } from '@/hooks/app'

/* ------------------------------------------------------------------ */
/* Élément réordonnable                                                */
/* ------------------------------------------------------------------ */

function SortableExercise({
  we,
  children,
}: {
  we: WorkoutExercise
  children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: we.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-20 opacity-90 shadow-2xl')}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Écran de démarrage                                                  */
/* ------------------------------------------------------------------ */

function StartScreen() {
  const navigate = useNavigate()
  const routines = useStore((s) => s.routines)
  const workouts = useStore((s) => s.workouts)
  const startWorkout = useStore((s) => s.startWorkout)
  const [picker, setPicker] = useState(false)

  const recent = useMemo(
    () => routines.slice().sort((a, b) => (b.lastPerformedAt ?? '').localeCompare(a.lastPerformedAt ?? '')).slice(0, 3),
    [routines],
  )

  return (
    <div>
      <PageHeader
        back="/"
        title="S’entraîner"
        subtitle="Séance vide, programme ou bibliothèque"
      />
      <Page className="max-w-3xl">
      <Card className="overflow-hidden">
        <div className="grid-bg border-b border-line px-5 py-7">
          <p className="text-xs font-bold tracking-widest text-accent uppercase">Prêt à transpirer ?</p>
          <h2 className="mt-1 text-2xl font-extrabold">Démarrer une séance</h2>
          <p className="mt-1 text-sm text-muted">
            Séance vide, depuis un programme, ou en piochant dans votre bibliothèque.
          </p>
        </div>
        <div className="space-y-2 p-4">
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => startWorkout()}
          >
            <Play size={18} /> Séance vide
          </Button>
          <Button size="lg" block onClick={() => setPicker(true)}>
            <Dumbbell size={18} /> Choisir mes exercices
          </Button>
          <Button size="lg" block onClick={() => navigate('/programmes')}>
            <ListChecks size={18} /> Depuis un programme
          </Button>
        </div>
      </Card>

      {recent.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Reprendre rapidement</p>
          <div className="space-y-2">
            {recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => startWorkout({ templateId: r.id })}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
                  style={{ background: `color-mix(in srgb, ${r.color} 20%, transparent)` }}
                >
                  {r.folder === 'Cardio' ? '🏃' : '🏋️'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.name}</span>
                  <span className="block text-[11px] text-muted">
                    {r.exercises.length} exercice{r.exercises.length > 1 ? 's' : ''}
                    {r.timesPerformed > 0 && ` · faite ${r.timesPerformed}×`}
                  </span>
                </span>
                <Play size={16} className="text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}

      {workouts.length > 0 && (
        <div className="mt-6">
          <Button block variant="ghost" onClick={() => navigate('/historique')}>
            Voir tout l’historique
          </Button>
        </div>
      )}

      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        multiple
        onPick={(ids) => {
          if (!ids.length) return
          startWorkout({ exercises: ids.map((exerciseId) => ({ exerciseId })) })
        }}
      />
      </Page>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Séance en cours                                                     */
/* ------------------------------------------------------------------ */

export default function ActiveWorkoutPage() {
  const navigate = useNavigate()
  // Même sélecteur que le bandeau « séance en cours » : le repli sur toute
  // séance active garantit que cliquer le bandeau n'ouvre jamais l'écran
  // « démarrer une séance » alors qu'une séance existe.
  const workout = useStore(selectActiveWorkout)
  const exercises = useStore((s) => s.exercises)
  const addExerciseToWorkout = useStore((s) => s.addExerciseToWorkout)
  const moveWorkoutExercise = useStore((s) => s.moveWorkoutExercise)
  const updateWorkoutExercise = useStore((s) => s.updateWorkoutExercise)
  const updateWorkout = useStore((s) => s.updateWorkout)
  const finishWorkout = useStore((s) => s.finishWorkout)
  const discardWorkout = useStore((s) => s.discardWorkout)
  const toggleSuperset = useStore((s) => s.toggleSuperset)
  const saveWorkoutAsRoutine = useStore((s) => s.saveWorkoutAsRoutine)
  const pauseWorkoutClock = useStore((s) => s.pauseWorkoutClock)
  const resumeWorkoutClock = useStore((s) => s.resumeWorkoutClock)
  const setWorkoutDuration = useStore((s) => s.setWorkoutDuration)
  const notify = useStore((s) => s.notify)
  const settings = useStore((s) => s.settings)

  const [picker, setPicker] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [saveRoutineOpen, setSaveRoutineOpen] = useState(false)
  const [routineName, setRoutineName] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [linkAnchor, setLinkAnchor] = useState<string | null>(null)
  const [durationOpen, setDurationOpen] = useState(false)
  const [durationDraft, setDurationDraft] = useState(0)
  const [, force] = useState(0)
  const bottomBarRef = useBottomBar()

  const clockPaused = Boolean(workout && workout.finishedAt)
  useInterval(workout && !clockPaused ? () => force((n) => n + 1) : () => {}, workout && !clockPaused ? 1000 : null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!workout) return <StartScreen />

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]))
  // Si la séance a été rouverte (modification), finishedAt est conservé :
  // le chrono reste bloqué sur la durée d'origine, modifiable et relançable.
  const elapsed = workoutDurationSeconds(workout)
  const doneSets = workoutSets(workout)
  const totalSets = workoutSets(workout, false)
  const volume = workoutVolume(workout)

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const toIndex = workout.exercises.findIndex((x) => x.id === over.id)
    if (toIndex >= 0) moveWorkoutExercise(workout.id, String(active.id), toIndex)
  }

  const handleSuperset = (weId: string) => {
    const target = workout.exercises.find((x) => x.id === weId)
    if (target?.supersetId) {
      // retire de la paire ; si l'identifiant est orphelin, on le nettoie aussi
      const other = workout.exercises.find((x) => x.id !== weId && x.supersetId === target.supersetId)
      if (other) toggleSuperset(workout.id, weId, other.id)
      else updateWorkoutExercise(workout.id, weId, { supersetId: null })
      return
    }
    setLinkAnchor(weId)
    notify('Choisissez le 2ᵉ exercice du superset', 'info')
  }

  return (
    <div>
      <PageHeader
        back="/"
        title={workout.name}
        subtitle={`${formatDuration(elapsed)} · ${doneSets}/${totalSets} séries · ${formatVolume(volume, settings.unit)}`}
        actions={
          <>
            <IconButton
              label="Renommer la séance"
              onClick={() => {
                setNameDraft(workout.name)
                setRenameOpen(true)
              }}
            >
              <Pencil size={17} />
            </IconButton>
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <IconButton label="Options de la séance" onClick={toggle}>
                  <MoreVertical size={18} />
                </IconButton>
              )}
              items={[
                {
                  label: 'Enregistrer comme programme',
                  icon: <Save size={15} />,
                  onClick: () => {
                    setRoutineName(workout.name)
                    setSaveRoutineOpen(true)
                  },
                },
                { label: 'Annuler la séance', icon: <Trash2 size={15} />, danger: true, onClick: () => setConfirmDiscard(true) },
              ]}
            />
          </>
        }
      />

      <Page className="max-w-3xl space-y-3">
        {clockPaused && (
          <div className="animate-slide-up flex flex-wrap items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-[13px]">
            <Pause size={15} className="text-warning" />
            <span className="font-semibold">Chrono en pause ({formatDuration(elapsed)})</span>
            <span className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDurationDraft(Math.round(elapsed / 60))
                  setDurationOpen(true)
                }}
              >
                Modifier
              </Button>
              <Button size="sm" variant="primary" onClick={() => resumeWorkoutClock(workout.id)}>
                <Play size={13} /> Reprendre
              </Button>
            </span>
          </div>
        )}

        {linkAnchor && (
          <div className="animate-slide-up flex items-center gap-2 rounded-xl border border-info/50 bg-info/10 px-3 py-2 text-[13px]">
            <Link2 size={15} className="text-info" />
            Sélectionnez le second exercice à enchaîner.
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setLinkAnchor(null)}>
              Annuler
            </Button>
          </div>
        )}

        {workout.exercises.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title="Aucun exercice"
              message="Ajoutez votre premier exercice pour commencer la séance."
              action={
                <Button variant="primary" onClick={() => setPicker(true)}>
                  <Plus size={16} /> Ajouter un exercice
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
            <SortableContext items={workout.exercises.map((e) => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {workout.exercises.map((we, index) => (
                  <SortableExercise key={we.id} we={we}>
                    {(handle) => (
                      <WorkoutExerciseCard
                        workout={workout}
                        we={we}
                        exercise={exerciseMap.get(we.exerciseId)}
                        dragHandleProps={handle}
                        onReplace={() => setReplaceTarget(we.id)}
                        onMoveUp={index > 0 ? () => moveWorkoutExercise(workout.id, we.id, index - 1) : undefined}
                        onMoveDown={
                          index < workout.exercises.length - 1
                            ? () => moveWorkoutExercise(workout.id, we.id, index + 1)
                            : undefined
                        }
                        onSuperset={() => handleSuperset(we.id)}
                        isSuperset={Boolean(we.supersetId)}
                        linkAction={
                          linkAnchor && linkAnchor !== we.id ? (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                toggleSuperset(workout.id, linkAnchor, we.id)
                                setLinkAnchor(null)
                              }}
                            >
                              <Link2 size={13} /> Lier
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </SortableExercise>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <Button size="lg" block variant="outline" onClick={() => setPicker(true)}>
          <Plus size={18} /> Ajouter un exercice
        </Button>

        <Card className="p-4">
          <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Notes de séance</p>
          <Textarea
            value={workout.notes ?? ''}
            onChange={(e) => updateWorkout(workout.id, { notes: e.target.value })}
            placeholder="Sensations, sommeil, énergie, douleurs…"
          />
        </Card>

        <Card className="p-4">
          <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Poids de corps (optionnel)</p>
          <Input
            type="number"
            inputMode="decimal"
            value={kgToInput(workout.bodyweightKg, settings.unit) ?? ''}
            onChange={(e) =>
              updateWorkout(workout.id, {
                bodyweightKg: e.target.value === '' ? undefined : inputToKg(Number(e.target.value), settings.unit),
              })
            }
            placeholder={settings.unit === 'kg' ? 'Ex. 78 (kg)' : 'Ex. 172 (lb)'}
          />
        </Card>

        <div className="grid grid-cols-3 gap-2">
          {/* Chrono : toucher la durée pour la corriger à la main, ⏸/▶ pour la pauser. */}
          <div className="rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
              <Timer size={12} />
              Durée
              {clockPaused && (
                <span className="rounded bg-warning/15 px-1 py-px text-[9px] font-bold text-warning">pause</span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setDurationDraft(Math.round(elapsed / 60))
                  setDurationOpen(true)
                }}
                title="Modifier la durée à la main"
                className="tabular min-w-0 flex-1 truncate text-left text-xl font-extrabold transition-colors hover:text-accent"
              >
                {formatDuration(elapsed, 'compact')}
              </button>
              {clockPaused ? (
                <IconButton label="Reprendre le chrono" onClick={() => resumeWorkoutClock(workout.id)} className="h-8 w-8 text-success">
                  <Play size={15} />
                </IconButton>
              ) : (
                <IconButton label="Mettre le chrono en pause" onClick={() => pauseWorkoutClock(workout.id)} className="h-8 w-8">
                  <Pause size={15} />
                </IconButton>
              )}
            </div>
          </div>
          <Stat label="Séries" value={`${doneSets}/${totalSets}`} icon={<Check size={12} />} />
          <Stat label="Volume" value={formatVolume(volume, settings.unit)} icon={<Flag size={12} />} />
        </div>
      </Page>

      {/* Barre de validation */}
      <div
        ref={bottomBarRef}
        className="safe-b glass fixed inset-x-0 bottom-[var(--bottom-stack,0px)] z-30 border-t border-line px-4 py-3 lg:left-64"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="hidden flex-1 sm:block">
            <p className="text-[11px] text-muted">
              {doneSets} série{doneSets > 1 ? 's' : ''} validée{doneSets > 1 ? 's' : ''} sur {totalSets}
            </p>
            <div className="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${totalSets ? (doneSets / totalSets) * 100 : 0}%` }}
              />
            </div>
          </div>
          <Button variant="ghost" onClick={() => setConfirmDiscard(true)} className="text-danger">
            <X size={16} /> Annuler
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="flex-1 sm:flex-none"
            onClick={() => setConfirmFinish(true)}
          >
            <Check size={18} /> Terminer la séance
          </Button>
        </div>
      </div>

      {/* Modales */}
      <ExercisePicker
        open={picker}
        onClose={() => setPicker(false)}
        multiple
        onPick={(ids) => ids.forEach((id) => addExerciseToWorkout(workout.id, id))}
      />

      <ExercisePicker
        open={Boolean(replaceTarget)}
        onClose={() => setReplaceTarget(null)}
        title="Remplacer par…"
        onPick={(ids) => {
          if (replaceTarget && ids[0]) {
            useStore.getState().replaceWorkoutExercise(workout.id, replaceTarget, ids[0])
            notify('Exercice remplacé', 'success')
          }
        }}
      />

      <Modal open={durationOpen} onClose={() => setDurationOpen(false)} title="Durée de la séance" size="sm">
        <p className="mb-2 text-sm text-muted">
          {clockPaused ? 'Chrono en pause — ajustez la durée figée.' : 'Ajustez la durée écoulée.'}
        </p>
        <NumberField
          value={durationDraft}
          onChange={(v) => setDurationDraft(v ?? 0)}
          step={1}
          min={0}
          max={1440}
          decimals={0}
          suffix="min"
          ariaLabel="Durée de la séance en minutes"
        />
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setDurationOpen(false)}>
            Annuler
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              setWorkoutDuration(workout.id, durationDraft * 60)
              setDurationOpen(false)
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Modal>

      <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Renommer la séance" size="sm">
        <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setRenameOpen(false)}>
            Annuler
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              updateWorkout(workout.id, { name: nameDraft.trim() || workout.name })
              setRenameOpen(false)
            }}
          >
            Enregistrer
          </Button>
        </div>
      </Modal>

      <Modal
        open={saveRoutineOpen}
        onClose={() => setSaveRoutineOpen(false)}
        title="Enregistrer comme programme"
        size="sm"
      >
        <p className="mb-3 text-sm text-muted">
          Les exercices, l’ordre, les séries et les temps de repos seront conservés (sans les charges).
        </p>
        <Input value={routineName} onChange={(e) => setRoutineName(e.target.value)} autoFocus />
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setSaveRoutineOpen(false)}>
            Annuler
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              saveWorkoutAsRoutine(workout.id, routineName.trim() || workout.name)
              setSaveRoutineOpen(false)
            }}
          >
            <Sparkles size={16} /> Enregistrer
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        title="Annuler la séance ?"
        message="Les séries saisies seront perdues. Cette action est définitive."
        confirmLabel="Annuler la séance"
        cancelLabel="Continuer"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          discardWorkout(workout.id)
          setConfirmDiscard(false)
          navigate('/')
        }}
      />

      <ConfirmDialog
        open={confirmFinish}
        title="Terminer la séance ?"
        message={
          <>
            {doneSets} série{doneSets > 1 ? 's' : ''} validée{doneSets > 1 ? 's' : ''} ·{' '}
            {formatVolume(volume, settings.unit)} de volume.
            <br />
            Les séries non validées seront supprimées définitivement.
          </>
        }
        confirmLabel="Terminer"
        onCancel={() => setConfirmFinish(false)}
        onConfirm={() => {
          // Seul le travail validé est conservé : les séries non validées
          // sont supprimées, ainsi que les exercices devenus vides.
          const st = useStore.getState()
          workout.exercises.forEach((we) => {
            we.sets.forEach((s) => {
              if (!s.completed) st.removeSet(workout.id, we.id, s.id)
            })
          })
          const cleaned = useStore.getState().workouts.find((w) => w.id === workout.id)
          cleaned?.exercises.forEach((we) => {
            if (we.sets.length === 0) st.removeWorkoutExercise(workout.id, we.id)
          })
          finishWorkout(workout.id)
          setConfirmFinish(false)
          navigate(`/historique/${workout.id}`, { state: { openShare: true } })
        }}
      />
    </div>
  )
}