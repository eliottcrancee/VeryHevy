import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Dumbbell,
  Pencil,
  Play,
  Plus,
  Star,
  Trophy,
} from 'lucide-react'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { ChartTooltipContent, chartLineCursor, chartTooltipWrapper } from '@/components/charts'
import { Button, Card, EmptyState, IconButton, SectionTitle, Stat, Tabs } from '@/components/ui'
import { ExerciseFormModal } from '@/components/ExerciseFormModal'
import { CATEGORY_META, TRACKING_TYPES } from '@/types'
import { getExerciseProgress, getExerciseSessions, getPersonalRecords, RECORD_LABELS } from '@/lib/calc'
import { cn, formatDate, formatDistance, formatDuration, formatVolume, formatWeight, kgToDisplay, tintBg, tintText } from '@/lib/utils'

type Tab = 'progression' | 'historique' | 'infos'

export default function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const exercise = useStore((s) => s.exercises.find((e) => e.id === id))
  const workouts = useStore((s) => s.workouts)
  const settings = useStore((s) => s.settings)
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const addExercise = useStore((s) => s.addExercise)
  const addExerciseToWorkout = useStore((s) => s.addExerciseToWorkout)
  const activeWorkout = useStore((s) => s.workouts.find((w) => w.id === s.activeWorkoutId))
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<Tab>('progression')
  const [editOpen, setEditOpen] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)

  const sessions = useMemo(() => (exercise ? getExerciseSessions(workouts, exercise.id) : []), [workouts, exercise])
  const progress = useMemo(() => (exercise ? getExerciseProgress(workouts, exercise.id) : []), [workouts, exercise])
  const records = useMemo(() => (exercise ? getPersonalRecords(workouts, exercise.id) : []), [workouts, exercise])

  const duplicateAsCustom = () => {
    if (!exercise) return
    const copy = addExercise({
      name: `${exercise.name} (copie)`,
      category: exercise.category,
      tracking: exercise.tracking,
      primaryMuscles: [...exercise.primaryMuscles],
      secondaryMuscles: [...exercise.secondaryMuscles],
      equipment: exercise.equipment,
      level: exercise.level,
      instructions: [...exercise.instructions],
      images: [...exercise.images],
      tips: exercise.tips,
      isFavorite: false,
    })
    notify('Copie personnalisée créée — à vous de la modifier', 'success')
    navigate(`/exercices/${copy.id}`)
  }

  if (!exercise) {
    return (
      <div>
        <PageHeader title="Exercice" back="/exercices" />
        <Page>
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title="Exercice introuvable"
              action={
                <Button variant="primary" onClick={() => navigate('/exercices')}>
                  Retour à la bibliothèque
                </Button>
              }
            />
          </Card>
        </Page>
      </div>
    )
  }

  const meta = CATEGORY_META[exercise.category]
  const hasWeight = TRACKING_TYPES[exercise.tracking].fields.includes('weight')
  
  const hasDistance = TRACKING_TYPES[exercise.tracking].fields.includes('distance')

  const chartData = progress.map((p) => ({
    label: p.label,
    [hasWeight ? 'Charge max' : hasDistance ? 'Distance' : 'Durée']: hasWeight
      ? Math.round(kgToDisplay(p.maxWeight, settings.unit))
      : hasDistance
        ? Math.round((p.distance ?? 0) / (settings.distanceUnit === 'km' ? 1000 : 1609.344) * 100) / 100
        : p.duration ?? 0,
    '1RM estimé': Math.round(kgToDisplay(p.e1rm, settings.unit)),
    Volume: Math.round(kgToDisplay(p.volume, settings.unit)),
    Reps: p.reps,
  }))
  const mainKey = hasWeight ? 'Charge max' : hasDistance ? 'Distance' : 'Durée'
  const showE1rm = hasWeight && chartData.some((d) => (d as Record<string, number>)['1RM estimé'] > 0)

  return (
    <div>
      <PageHeader
        back="/exercices"
        title={exercise.name}
        subtitle={exercise.altName && exercise.altName !== exercise.name ? exercise.altName : meta.label}
        actions={
          <>
            <IconButton
              label="Favori"
              onClick={() => toggleFavorite(exercise.id)}
              className={cn(exercise.isFavorite && 'text-warning')}
            >
              <Star size={18} fill={exercise.isFavorite ? 'currentColor' : 'none'} />
            </IconButton>
            {exercise.isCustom ? (
              <IconButton label="Modifier" onClick={() => setEditOpen(true)}>
                <Pencil size={17} />
              </IconButton>
            ) : (
              <IconButton label="Dupliquer pour personnaliser" onClick={duplicateAsCustom}>
                <Copy size={17} />
              </IconButton>
            )}
          </>
        }
      />

      <Page className="max-w-3xl space-y-4">
        {/* Photos */}
        {exercise.images.length > 0 && (
          <Card className="relative overflow-hidden">
            <div className="relative aspect-[4/3] bg-surface-2">
              <img
                src={exercise.images[imageIndex]}
                alt={exercise.name}
                className="h-full w-full object-contain"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              {exercise.images.length > 1 && (
                <>
                  <IconButton
                    label="Image précédente"
                    className="absolute top-1/2 left-2 -translate-y-1/2 bg-surface/80"
                    onClick={() => setImageIndex((i) => (i - 1 + exercise.images.length) % exercise.images.length)}
                  >
                    <ChevronLeft size={18} />
                  </IconButton>
                  <IconButton
                    label="Image suivante"
                    className="absolute top-1/2 right-2 -translate-y-1/2 bg-surface/80"
                    onClick={() => setImageIndex((i) => (i + 1) % exercise.images.length)}
                  >
                    <ChevronRight size={18} />
                  </IconButton>
                  <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                    {exercise.images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setImageIndex(i)}
                        className={cn(
                          'h-1.5 rounded-full transition-all',
                          i === imageIndex ? 'w-5 bg-accent' : 'w-1.5 bg-muted/50',
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <span
            className="rounded-lg px-2 py-1 text-[11px] font-bold"
            style={{ color: tintText(meta.color), background: tintBg(meta.color, 15) }}
          >
            {meta.emoji} {meta.label}
          </span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
            {exercise.equipment}
          </span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
            {exercise.level}
          </span>
          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
            {TRACKING_TYPES[exercise.tracking].label}
          </span>
          {exercise.isCustom ? (
            <span className="rounded-lg bg-accent-soft px-2 py-1 text-[11px] font-bold text-accent">
              personnalisé
            </span>
          ) : (
            <button
              type="button"
              onClick={duplicateAsCustom}
              className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:text-accent"
              title="Créer une copie modifiable"
            >
              base VeryHevy · lecture seule — dupliquer pour modifier
            </button>
          )}
        </div>

        {exercise.tips && (
          <Card className="border-accent-line bg-accent-soft p-3.5">
            <p className="text-[13px] font-medium">💡 {exercise.tips}</p>
          </Card>
        )}

        {/* Ajouter à la séance */}
        {activeWorkout ? (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              addExerciseToWorkout(activeWorkout.id, exercise.id)
              notify(`${exercise.name} ajouté à la séance`, 'success')
              navigate('/seance')
            }}
          >
            <Plus size={18} /> Ajouter à la séance en cours
          </Button>
        ) : (
          <Button
            size="lg"
            block
            onClick={() => {
              useStore.getState().startWorkout({ exercises: [{ exerciseId: exercise.id }] })
              navigate('/seance')
            }}
          >
            <Play size={18} /> Démarrer une séance avec cet exercice
          </Button>
        )}

        {/* Records */}
        {records.length > 0 && (
          <div>
            <SectionTitle>Records personnels</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {records.map((r) => (
                <Stat
                  key={r.kind}
                  label={RECORD_LABELS[r.kind]}
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
                  sub={`le ${formatDate(r.workout.startedAt)}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Onglets */}
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'progression', label: 'Progression' },
            { value: 'historique', label: `Historique (${sessions.length})` },
            { value: 'infos', label: 'Fiche' },
          ]}
        />

        {tab === 'progression' && (
          <Card className="p-4">
            {progress.length < 2 ? (
              <EmptyState
                icon={<Play size={22} />}
                title="Pas encore de données"
                message="Enregistrez au moins deux séances avec cet exercice pour voir la progression."
              />
            ) : (
              <>
                <SectionTitle>Évolution</SectionTitle>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                        minTickGap={28}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        cursor={chartLineCursor}
                        wrapperStyle={chartTooltipWrapper}
                        content={
                          <ChartTooltipContent
                            format={(p) =>
                              p.dataKey === '1RM estimé'
                                ? `1RM ~${p.value} ${settings.unit}`
                                : `${p.dataKey} : ${p.value}${hasWeight || p.dataKey === '1RM estimé' ? ` ${settings.unit}` : ''}`
                            }
                          />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey={mainKey}
                        stroke="var(--accent)"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: 'var(--accent)' }}
                        activeDot={{ r: 5 }}
                      />
                      {showE1rm && (
                        <Line
                          type="monotone"
                          dataKey="1RM estimé"
                          stroke="var(--warning)"
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
                  <Stat
                    label="Meilleure séance"
                    value={
                      hasWeight
                        ? formatWeight(Math.max(...progress.map((p) => p.maxWeight)), settings.unit)
                        : `${Math.max(...progress.map((p) => p.sets))} séries`
                    }
                  />
                  <Stat label="Séances" value={progress.length} />
                  <Stat
                    label="Volume cumulé"
                    value={`${Math.round(
                      kgToDisplay(
                        progress.reduce((n, p) => n + p.volume, 0),
                        settings.unit,
                      ),
                    ).toLocaleString('fr-FR')}`}
                    sub={settings.unit}
                  />
                </div>
              </>
            )}
          </Card>
        )}

        {tab === 'historique' && (
          <div className="space-y-2">
            {!sessions.length ? (
              <Card>
                <EmptyState icon={<Dumbbell size={24} />} title="Aucune séance enregistrée" />
              </Card>
            ) : (
              sessions.map(({ workout, sets }) => (
                <Link
                  key={workout.id}
                  to={`/historique/${workout.id}`}
                  className="block rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{formatDate(workout.startedAt, 'long')}</p>
                    <span className="text-[11px] text-muted">{workout.name}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {sets.map((s, i) => (
                      <span key={s.id} className="tabular rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium">
                        <span className="mr-1 text-muted">{i + 1}.</span>
                        {[
                          s.weight !== undefined ? formatWeight(s.weight, settings.unit) : null,
                          s.reps !== undefined ? `${s.reps}` : null,
                          s.duration !== undefined ? formatDuration(s.duration) : null,
                          s.distance !== undefined ? formatDistance(s.distance, settings.distanceUnit) : null,
                        ]
                          .filter(Boolean)
                          .join(' × ')}
                      </span>
                    ))}
                  </div>
                  {sets.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted">
                      Total :{' '}
                      {sets.reduce((n, s) => n + (s.reps ?? 0), 0)} reps
                      {hasWeight &&
                        ` · ${formatVolume(
                          sets.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0),
                          settings.unit,
                        )}`}
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>
        )}

        {tab === 'infos' && (
          <Card className="space-y-4 p-4">
            <div>
              <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Muscles sollicités</p>
              <div className="flex flex-wrap gap-1.5">
                {exercise.primaryMuscles.map((m) => (
                  <span
                    key={m}
                    className="rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-bold text-accent"
                  >
                    {m}
                  </span>
                ))}
                {exercise.secondaryMuscles.map((m) => (
                  <span key={m} className="rounded-lg bg-surface-2 px-2 py-1 text-[12px] text-muted">
                    {m}
                  </span>
                ))}
                {!exercise.primaryMuscles.length && !exercise.secondaryMuscles.length && (
                  <span className="text-sm text-muted">Non renseigné</span>
                )}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">Exécution</p>
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
                <p className="text-sm text-muted">
                  Pas d’instructions pour cet exercice.{' '}
                  <button
                    type="button"
                    className="font-semibold text-accent"
                    onClick={() => (exercise.isCustom ? setEditOpen(true) : duplicateAsCustom())}
                  >
                    {exercise.isCustom ? 'En ajouter' : 'Dupliquer pour en ajouter'}
                  </button>
                </p>
              )}
            </div>

            {exercise.source && (
              <p className="border-t border-line pt-3 text-[11px] text-muted">
                Source : {exercise.source === 'free-exercise-db' ? 'free-exercise-db (domaine public)' : exercise.source === 'custom' ? 'créé par vous' : 'base VeryHevy'}
              </p>
            )}
          </Card>
        )}

        <Button block variant="ghost" onClick={() => navigate('/exercices')}>
          <ArrowLeft size={16} /> Retour à la bibliothèque
        </Button>
      </Page>

      <ExerciseFormModal open={editOpen} onClose={() => setEditOpen(false)} exercise={exercise} />
    </div>
  )
}