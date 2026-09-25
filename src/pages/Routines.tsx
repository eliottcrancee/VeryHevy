import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Copy, Dumbbell, MoreVertical, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useStore, selectActiveWorkout } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, IconButton, Input, Menu, Modal, Textarea } from '@/components/ui'
import { cn, formatDate, pluralize } from '@/lib/utils'
import { ExercisePicker } from '@/components/ExercisePicker'

const COLORS = ['#4f83ff', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#0ea5e9', '#eab308', '#14b8a6']

export default function RoutinesPage() {
  const navigate = useNavigate()
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
      const key = r.folder?.trim() || 'Sans dossier'
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))
  }, [routines])

  const exerciseMap = new Map(exercises.map((e) => [e.id, e]))

  const launch = (id: string) => {
    if (active) {
      notify('Une séance est déjà en cours. Termine-la pour lancer ce programme.', 'error')
      return
    }
    startWorkout({ templateId: id })
    navigate('/seance')
  }

  return (
    <div>
      <PageHeader
        title="Programmes"
        subtitle={`${pluralize(routines.length, 'programme')} enregistré${routines.length > 1 ? 's' : ''}`}
        actions={
          <>
            <Link to="/exercices" className="shrink-0">
              <Button size="sm">
                <Dumbbell size={15} /> Exercices
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> Créer
            </Button>
          </>
        }
      />

      <Page className="space-y-6">
        {!routines.length ? (
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title="Aucun programme"
              message="Un programme regroupe une liste d’exercices à lancer en un clic."
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> Nouveau programme
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
                            <IconButton label="Options" onClick={toggle} className="-mt-1 -mr-1">
                              <MoreVertical size={17} />
                            </IconButton>
                          )}
                          items={[
                            { label: 'Modifier', icon: <Pencil size={14} />, onClick: () => navigate(`/programmes/${r.id}`) },
                            { label: 'Dupliquer', icon: <Copy size={14} />, onClick: () => duplicateRoutine(r.id) },
                            {
                              label: 'Ajouter des exercices',
                              icon: <Plus size={14} />,
                              onClick: () => setPickerFor(r.id),
                            },
                            {
                              label: 'Supprimer',
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onClick: () => setDeleteTarget(r.id),
                            },
                          ]}
                        />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                        <span>{pluralize(r.exercises.length, 'exercice')}</span>
                        <span>{pluralize(r.exercises.reduce((n, e) => n + e.sets.length, 0), 'série')}</span>
                        <span>{r.timesPerformed}× réalisé</span>
                        {r.lastPerformedAt && <span>dernière : {formatDate(r.lastPerformedAt)}</span>}
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
                          onClick={() => (r.exercises.length ? launch(r.id) : notify('Ajoutez d’abord des exercices', 'error'))}
                        >
                          <Play size={14} /> Démarrer
                        </Button>
                        <Button size="sm" onClick={() => navigate(`/programmes/${r.id}`)}>
                          Modifier
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
                          Voir la dernière séance réalisée
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
        title="Nouveau programme"
        footer={
          <div className="flex gap-2">
            <Button block onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              block
              variant="primary"
              disabled={!newName.trim()}
              onClick={() => {
                const id = createRoutine({
                  name: newName.trim(),
                  description: newDesc.trim() || undefined,
                  folder: newFolder.trim() || 'Sans dossier',
                  color: newColor,
                })
                setCreateOpen(false)
                setNewName('')
                setNewDesc('')
                navigate(`/programmes/${id}`)
              }}
            >
              Créer
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input placeholder="Nom du programme" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <Textarea
            placeholder="Description (optionnel)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="min-h-16"
          />
          <Input placeholder="Dossier" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">Couleur</p>
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

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Supprimer le programme ?" size="sm">
        <p className="text-sm text-muted">Les séances déjà réalisées ne seront pas affectées.</p>
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setDeleteTarget(null)}>
            Annuler
          </Button>
          <Button
            block
            variant="danger"
            onClick={() => {
              if (deleteTarget) deleteRoutine(deleteTarget)
              setDeleteTarget(null)
            }}
          >
            Supprimer
          </Button>
        </div>
      </Modal>
    </div>
  )
}