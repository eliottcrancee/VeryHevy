import { useEffect, useMemo, useRef, useState } from 'react'
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
  Lightbulb,
  Pencil,
  Play,
  Plus,
  Star,
  Trophy,
} from 'lucide-react'
import { useStore, selectActiveWorkout } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { ChartTooltipContent, chartLineCursor, chartTooltipWrapper } from '@/components/charts'
import { Button, Card, Chip, EmptyState, IconButton, SectionTitle, Stat, Tabs } from '@/components/ui'
import { RECORD_LABEL_KEYS } from '@/components/ExerciseSheet'
import { ExerciseFormModal } from '@/components/ExerciseFormModal'
import { CATEGORY_META, TRACKING_TYPES } from '@/types'
import { arcWorkouts, getExerciseProgress, getExerciseSessions, getPersonalRecords } from '@/lib/calc'
import { cn, formatDate, formatDistance, formatDuration, formatVolume, formatWeight, kgToDisplay, rangeSince, tintBg, tintText, RANGE_LABEL_KEYS, type RangeFilter } from '@/lib/utils'
import { t, tx, useLang } from '@/lib/i18n'

type Tab = 'progression' | 'historique' | 'infos'

export default function ExerciseDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  useLang()
  const exercise = useStore((s) => s.exercises.find((e) => e.id === id))
  const workouts = useStore((s) => s.workouts)
  const settings = useStore((s) => s.settings)
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  const addExercise = useStore((s) => s.addExercise)
  const addExerciseToWorkout = useStore((s) => s.addExerciseToWorkout)
  const activeWorkout = useStore(selectActiveWorkout)
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<Tab>('progression')
  const [range, setRange] = useState<RangeFilter>('90j')
  const [editOpen, setEditOpen] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)

  // Si l'exercice vient d'être supprimé depuis la modale, on repart vers la bibliothèque.
  const wasPresent = useRef(!!exercise)
  useEffect(() => {
    if (exercise) wasPresent.current = true
  }, [exercise])
  useEffect(() => {
    if (!editOpen && !exercise && wasPresent.current) navigate('/exercices')
  }, [editOpen, exercise, navigate])

  const since = useMemo(() => rangeSince(range), [range])

  const sessions = useMemo(
    () =>
      exercise
        ? getExerciseSessions(workouts, exercise.id).filter(
            (s) => since === null || +new Date(s.workout.startedAt) >= since,
          )
        : [],
    [workouts, exercise, since],
  )
  const progress = useMemo(
    () =>
      exercise
        ? getExerciseProgress(workouts, exercise.id).filter(
            (p) => since === null || +new Date(p.date) >= since,
          )
        : [],
    [workouts, exercise, since],
  )
  // Records limités à l'arc en cours (réinitialisables dans les réglages).
  const records = useMemo(
    () =>
      exercise
        ? getPersonalRecords(
            arcWorkouts(workouts, settings.recordsSince).filter(
              (w) => since === null || +new Date(w.startedAt) >= since,
            ),
            exercise.id,
          )
        : [],
    [workouts, exercise, settings.recordsSince, since],
  )

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
    notify(t('exercise.copyCreated'), 'success')
    navigate(`/exercices/${copy.id}`)
  }

  if (!exercise) {
    return (
      <div>
        <PageHeader title={t('exercise.detailTitle')} back="/exercices" />
        <Page>
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title={t('exercise.notFound')}
              action={
                <Button variant="primary" onClick={() => navigate('/exercices')}>
                  {t('exercise.backLibrary')}
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

  const mainKey = hasWeight ? t('exercise.chartMax') : hasDistance ? t('exercise.chartDist') : t('exercise.chartDur')
  const e1rmKey = t('exercise.chartE1rm')
  const chartData = progress.map((p) => ({
    label: p.label,
    [mainKey]: hasWeight
      ? Math.round(kgToDisplay(p.maxWeight, settings.unit))
      : hasDistance
        ? Math.round((p.distance ?? 0) / (settings.distanceUnit === 'km' ? 1000 : 1609.344) * 100) / 100
        : p.duration ?? 0,
    [e1rmKey]: Math.round(kgToDisplay(p.e1rm, settings.unit)),
    [t('exercise.chartVol')]: Math.round(kgToDisplay(p.volume, settings.unit)),
    [t('exercise.chartReps')]: p.reps,
  }))
  const showE1rm = hasWeight && chartData.some((d) => (d as Record<string, number>)[e1rmKey] > 0)

  return (
    <div>
      <PageHeader
        back="/exercices"
        title={exercise.name}
        subtitle={exercise.altName && exercise.altName !== exercise.name ? exercise.altName : tx('cat', exercise.category)}
        actions={
          <>
            <IconButton
              label={t('exercise.favAria')}
              onClick={() => toggleFavorite(exercise.id)}
              className={cn(exercise.isFavorite && 'text-warning')}
            >
              <Star size={18} fill={exercise.isFavorite ? 'currentColor' : 'none'} />
            </IconButton>
            {exercise.isCustom ? (
              <IconButton label={t('workout.edit')} onClick={() => setEditOpen(true)}>
                <Pencil size={17} />
              </IconButton>
            ) : (
              <IconButton label={t('exercise.duplicateAria')} onClick={duplicateAsCustom}>
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
                    label={t('exercise.prevImage')}
                    className="absolute top-1/2 left-2 -translate-y-1/2 bg-surface/80"
                    onClick={() => setImageIndex((i) => (i - 1 + exercise.images.length) % exercise.images.length)}
                  >
                    <ChevronLeft size={18} />
                  </IconButton>
                  <IconButton
                    label={t('exercise.nextImage')}
                    className="absolute top-1/2 right-2 -translate-y-1/2 bg-surface/80"
                    onClick={() => setImageIndex((i) => (i + 1) % exercise.images.length)}
                  >
                    <ChevronRight size={18} />
                  </IconButton>
                  <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2">
                    {exercise.images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setImageIndex(i)}
                        aria-label={t('exercise.imageN', { i: i + 1, n: exercise.images.length })}
                        className="flex h-7 w-7 items-center justify-center"
                      >
                        <span
                          className={cn(
                            'h-1.5 rounded-full transition-all',
                            i === imageIndex ? 'w-5 bg-accent' : 'w-1.5 bg-muted/50',
                          )}
                        />
                      </button>
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
          {exercise.isCustom ? (
            <span className="rounded-lg bg-accent-soft px-2 py-1 text-[11px] font-bold text-accent">
              {t('exercise.customBadge')}
            </span>
          ) : (
            <button
              type="button"
              onClick={duplicateAsCustom}
              className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-bold text-muted transition-colors hover:text-accent"
              title={t('exercise.readonlyTitle')}
            >
              {t('exercise.baseReadonly')}
            </button>
          )}
        </div>

        {exercise.tips && (
          <Card className="flex items-start gap-2 border-accent-line bg-accent-soft p-3.5">
            <Lightbulb size={15} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[13px] font-medium">{exercise.tips}</p>
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
              notify(t('exercise.addedToWorkout', { name: exercise.name }), 'success')
              navigate('/seance')
            }}
          >
            <Plus size={18} /> {t('exercise.addToWorkout')}
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
            <Play size={18} /> {t('exercise.startWith')}
          </Button>
        )}

        {/* Records */}
        {records.length > 0 && (
          <div>
            <SectionTitle>{t('exercise.prTitle')}</SectionTitle>
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
                  sub={t('exercise.sinceOn', { date: formatDate(r.workout.startedAt) })}
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
            { value: 'progression', label: t('exercise.progress') },
            { value: 'historique', label: t('exercise.historyTab', { n: sessions.length }) },
            { value: 'infos', label: t('exercise.card') },
          ]}
        />

        {tab === 'progression' && (
          <Card className="space-y-3 p-4">
            {/* Filtre de période (30j / 90j / 6m / tout) : rattaché à la
                progression, pas perché en haut de la fiche. */}
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {RANGE_LABEL_KEYS.map(([value, key]) => (
                <Chip key={value} size="sm" active={range === value} onClick={() => setRange(value)}>
                  {t(key)}
                </Chip>
              ))}
            </div>
            {progress.length < 2 ? (
              <EmptyState
                icon={<Play size={22} />}
                title={t('exercise.noData')}
                message={t('exercise.noDataHint')}
              />
            ) : (
              <>
                <SectionTitle>{t('exercise.evolution')}</SectionTitle>
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
                              p.dataKey === e1rmKey
                                ? t('exercise.tipE1rm', { v: p.value, u: settings.unit })
                                : t('exercise.tipVal', {
                                    k: String(p.dataKey),
                                    v: p.value,
                                    u: hasWeight || p.dataKey === e1rmKey ? ` ${settings.unit}` : '',
                                  })
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
                          dataKey={e1rmKey}
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
                <div className="mt-4 grid grid-cols-3 gap-1.5 border-t border-line pt-4">
                  <Stat
                    compact
                    label={t('exercise.bestSession')}
                    value={
                      hasWeight
                        ? formatWeight(Math.max(...progress.map((p) => p.maxWeight)), settings.unit)
                        : t('stats.setsCount', { n: Math.max(...progress.map((p) => p.sets)) })
                    }
                  />
                  <Stat compact label={t('stats.sessions')} value={progress.length} />
                  <Stat
                    compact
                    label={t('exercise.volTotal')}
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
                <EmptyState icon={<Dumbbell size={24} />} title={t('exercise.noSessions')} />
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
                      {t('exercise.totalLine', { r: sets.reduce((n, s) => n + (s.reps ?? 0), 0) })}
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
              <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">{t('exercise.musclesUsed')}</p>
              <div className="flex flex-wrap gap-1.5">
                {exercise.primaryMuscles.map((m) => (
                  <span
                    key={m}
                    className="rounded-lg bg-accent-soft px-2 py-1 text-[12px] font-bold text-accent"
                  >
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

            <div className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">{t('exercise.execution')}</p>
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
                  {t('exercise.noInstructions')}{' '}
                  <button
                    type="button"
                    className="font-semibold text-accent"
                    onClick={() => (exercise.isCustom ? setEditOpen(true) : duplicateAsCustom())}
                  >
                    {exercise.isCustom ? t('exercise.addSome') : t('exercise.dupeToAdd')}
                  </button>
                </p>
              )}
            </div>

            {exercise.source && (
              <p className="border-t border-line pt-3 text-[11px] text-muted">
                {t('exercise.source', {
                  s:
                    exercise.source === 'free-exercise-db'
                      ? t('exercise.srcFedb')
                      : exercise.source === 'custom'
                        ? t('exercise.srcCustom')
                        : t('exercise.srcBase'),
                })}
              </p>
            )}
          </Card>
        )}

        <Button block variant="ghost" onClick={() => navigate('/exercices')}>
          <ArrowLeft size={16} /> {t('exercise.backLibrary')}
        </Button>
      </Page>

      <ExerciseFormModal open={editOpen} onClose={() => setEditOpen(false)} exercise={exercise} />
    </div>
  )
}