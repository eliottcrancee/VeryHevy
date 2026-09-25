import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Dumbbell, MoreVertical, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useStore, selectActiveWorkout } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, IconButton, Input, Menu, Modal, Textarea } from '@/components/ui'
import { cn, formatDate } from '@/lib/utils'
import { ExercisePicker } from '@/components/ExercisePicker'
import { t, useLang } from '@/lib/i18n'

const COLORS = ['#4f83ff', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#0ea5e9', '#eab308', '#14b8a6']

export default function RoutinesPage() {
  const navigate = useNavigate()
  useLang()
  const routines = useStore((s) => s.routines)
  const workouts = useStore((s) => s.workouts)
  const exercises = useStore((s) => s.exercises)
  const createRoutine = useStore((s) => s.createRoutine)
  const duplicateRoutine = useStore((s) => s.duplicateRoutine)
  const deleteRoutine = useStore((s) => s.deleteRoutine)
  const startWorkout = useStore((s) => s.startWorkout)
  const notify = useStore((s) => s.notify)

  const active = useStore(selectActiveWorkout)

  const [createOpen, setCreateOpen] = useState(false)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newFolder, setNewFolder] = useState('Mes programmes')
  const [newColor, setNewColor] = useState(COLORS[0])

  const folders = useMemo(() => {
    const map = new Map<string, typeof routines>()
    for (const r of routines) {
      const key = r.folder?.trim() || t('routine.noFolder')
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [routines])

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]))

  const launch = (id: string) => {
    if (active) {
      notify(t('routine.alreadyRunning'), 'error')
      return
    }
    startWorkout({ templateId: id })
    navigate('/seance')
  }

  return (
    <div>
      <PageHeader
        title={t('routine.title')}
        subtitle={t('routine.subtitle', { n: routines.length })}
        actions={
          <>
            <Link to="/exercices" className="shrink-0">
              <Button size="sm">
                <Dumbbell size={15} /> {t('routine.exercises')}
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> {t('routine.create')}
            </Button>
          </>
        }
      />

      <Page className="space-y-6">
        {!routines.length ? (
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title={t('routine.empty')}
              message={t('routine.emptyHint')}
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> {t('routine.new')}
                </Button>
              }
            />
          </Card>
        ) : (
          folders.map(([folder, list]) => (
            <section key={folder}>
              <h2 className="mb-2 text-[13px] font-bold tracking-wider text-muted uppercase">{folder}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((r) => (
                  <Card key={r.id} className="overflow-hidden">
                    <div className="h-1" style={{ background: r.color }} />
                    <div className="p-3.5">
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => navigate(`/programmes/${r.id}`)}
                        >
                          <p className="truncate font-bold">{r.name}</p>
                          {r.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{r.description}</p>
                          )}
                        </button>
                        <Menu
                          align="right"
                          trigger={({ toggle }) => (
                            <IconButton label={t('workout.optionsMenu')} onClick={toggle} className="-mt-1 -mr-1">
                              <MoreVertical size={17} />
                            </IconButton>
                          )}
                          items={[
                            { label: t('workout.edit'), icon: <Pencil size={14} />, onClick: () => navigate(`/programmes/${r.id}`) },
                            { label: t('routine.duplicate'), icon: <Copy size={14} />, onClick: () => duplicateRoutine(r.id) },
                            {
                              label: t('routine.addExercises'),
                              icon: <Plus size={14} />,
                              onClick: () => setPickerFor(r.id),
                            },
                            {
                              label: t('common.delete'),
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onClick: () => setDeleteTarget(r.id),
                            },
                          ]}
                        />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                        <span>{t('routine.exNum', { n: r.exercises.length })}</span>
                        <span>{t('routine.setNum', { n: r.exercises.reduce((n, e) => n + e.sets.length, 0) })}</span>
                        <span>{t('routine.doneTimes', { n: r.timesPerformed })}</span>
                        {r.lastPerformedAt && <span>{t('routine.lastDone', { date: formatDate(r.lastPerformedAt) })}</span>}
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1">
                        {r.exercises.slice(0, 4).map((re) => {
                          const ex = exerciseMap.get(re.exerciseId)
                          return ex ? (
                            <span key={re.id} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                              {ex.name}
                            </span>
                          ) : null
                        })}
                        {r.exercises.length > 4 && (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                            +{r.exercises.length - 4}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1"
                          onClick={() => (r.exercises.length ? launch(r.id) : notify(t('routine.needExercises'), 'error'))}
                        >
                          <Play size={14} /> {t('routine.start')}
                        </Button>
                        <Button size="sm" onClick={() => navigate(`/programmes/${r.id}`)}>
                          {t('workout.edit')}
                        </Button>
                      </div>

                      {workouts.some((w) => w.templateId === r.id && w.status === 'completed') && (
                        <button
                          type="button"
                          className="mt-2 w-full text-[11px] font-semibold text-accent"
                          onClick={() => {
                            const last = workouts
                              .filter((w) => w.templateId === r.id && w.status === 'completed')
                              .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0]
                            if (last) navigate(`/historique/${last.id}`)
                          }}
                        >
                          {t('routine.lastSession')}
                        </button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))
        )}
      </Page>

      {/* Création */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('routine.new')}
        footer={
          <div className="flex gap-2">
            <Button block onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              block
              variant="primary"
              disabled={!newName.trim()}
              onClick={() => {
                const id = createRoutine({
                  name: newName.trim(),
                  description: newDesc.trim() || undefined,
                  folder: newFolder.trim() || t('routine.noFolder'),
                  color: newColor,
                })
                setCreateOpen(false)
                setNewName('')
                setNewDesc('')
                navigate(`/programmes/${id}`)
              }}
            >
              {t('routine.create')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input placeholder={t('routine.namePh')} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Textarea
            placeholder={t('routine.descPh')}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="min-h-16"
          />
          <Input placeholder={t('routine.folder')} value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">{t('routine.color')}</p>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  style={{ background: c }}
                  className={cn(
                    'h-8 w-8 rounded-full transition-transform',
                    newColor === c && 'ring-2 ring-offset-2 ring-offset-surface',
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ExercisePicker
        open={Boolean(pickerFor)}
        onClose={() => setPickerFor(null)}
        multiple
        onPick={(ids) => {
          if (!pickerFor) return
          const routine = routines.find((r) => r.id === pickerFor)
          if (!routine) return
          const state = useStore.getState()
          ids.forEach((id) => state.addExerciseToRoutine(pickerFor, id))
        }}
      />

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={t('routine.deleteTitle')} size="sm">
        <p className="text-sm text-muted">{t('routine.deleteMessage')}</p>
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            block
            variant="danger"
            onClick={() => {
              if (deleteTarget) deleteRoutine(deleteTarget)
              setDeleteTarget(null)
            }}
          >
            {t('common.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}