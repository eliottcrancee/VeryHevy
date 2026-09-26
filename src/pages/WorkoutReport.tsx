import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Dumbbell,
  Flame,
  Megaphone,
  Pencil,
  Play,
  Save,
  Share2,
  Trash2,
  Trophy,
  Weight,
} from 'lucide-react'
import { useStore } from '@/store/store'
import { ChartTooltipContent, chartCursor, chartTooltipWrapper } from '@/components/charts'
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
  SectionTitle,
  Stat,
  Textarea,
} from '@/components/ui'
import {
  arcWorkouts,
  detectNewRecords,
  estimate1RM,
  muscleBreakdown,
  setVolume,
  workoutDurationSeconds,
  workoutReps,
  workoutSets,
  workoutVolume,
} from '@/lib/calc'
import { CATEGORY_META, SET_TYPE_META } from '@/types'
import { downloadJSON, formatDate, formatDistance, formatDuration, formatTime, formatVolume, formatWeight, kgToDisplay } from '@/lib/utils'
import { shareWorkout } from '@/lib/share'
import { SharePostModal } from '@/components/SharePostModal'
import { useAuth } from '@/lib/auth'
import { t, tx, useLang } from '@/lib/i18n'

/** Libellés de records traduisibles (clé i18n par type de record). */
const RECORD_KEYS = {
  weight: 'workout.recWeight',
  e1rm: 'workout.recE1rm',
  reps: 'workout.recReps',
  volume: 'workout.recVolume',
  duration: 'workout.recDuration',
  distance: 'workout.recDistance',
} as const

export default function WorkoutReportPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  useLang()
  const workout = useStore((s) => s.workouts.find((w) => w.id === id))
  const workouts = useStore((s) => s.workouts)
  const exercises = useStore((s) => s.exercises)
  const settings = useStore((s) => s.settings)
  const reopenWorkout = useStore((s) => s.reopenWorkout)
  const deleteWorkout = useStore((s) => s.deleteWorkout)
  const updateWorkout = useStore((s) => s.updateWorkout)
  const saveWorkoutAsRoutine = useStore((s) => s.saveWorkoutAsRoutine)
  const startWorkout = useStore((s) => s.startWorkout)
  const notify = useStore((s) => s.notify)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveRoutineOpen, setSaveRoutineOpen] = useState(false)
  const [routineName, setRoutineName] = useState('')
  const [editNotes, setEditNotes] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const { cloudEnabled } = useAuth()

  /* Ouverture auto de la publication juste après « Terminer la séance ». */
  useEffect(() => {
    const state = location.state as { openShare?: boolean } | null
    if (state?.openShare && workout?.status === 'completed') {
      setShareOpen(true)
      navigate(location.pathname, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workout?.id])

  const exerciseMap = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises])

  const previousWorkouts = useMemo(
    () =>
      // Limitées à l'arc en cours : les records ne comparent qu'aux séances
      // postérieures à la date de réinitialisation (réglages).
      arcWorkouts(
        workouts.filter(
          (w) => w.id !== id && w.status === 'completed' && +new Date(w.startedAt) < +new Date(workout?.startedAt ?? 0),
        ),
        settings.recordsSince,
      ),
    [workouts, id, workout, settings.recordsSince],
  )

  const records = useMemo(
    () => (workout ? detectNewRecords(workout, previousWorkouts, exercises) : []),
    [workout, previousWorkouts, exercises],
  )

  const previousSame = useMemo(() => {
    if (!workout) return undefined
    return previousWorkouts
      .filter((w) => (workout.templateId ? w.templateId === workout.templateId : w.name === workout.name))
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))[0]
  }, [workout, previousWorkouts])

  if (!workout) {
    return (
      <div>
        <PageHeader title={t('workout.report')} back="/historique" />
        <Page>
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title={t('workout.notFound')}
              message={t('workout.deletedHint')}
              action={
                <Button variant="primary" onClick={() => navigate('/historique')}>
                  {t('workout.backHistory')}
                </Button>
              }
            />
          </Card>
        </Page>
      </div>
    )
  }

  const duration = workoutDurationSeconds(workout)
  const volume = workoutVolume(workout)
  const sets = workoutSets(workout)
  const reps = workoutReps(workout)
  const breakdown = muscleBreakdown(workout, exercises)
  const isActive = workout.status === 'active'

  const chartData = breakdown.slice(0, 8).map((m) => ({ name: m.muscle, sets: m.sets, volume: m.volume }))

  const compare = (current: number, previous: number | undefined) => {
    if (previous === undefined || previous === 0) return null
    const delta = ((current - previous) / previous) * 100
    if (Math.abs(delta) < 1) return <span className="text-muted">=</span>
    return (
      <span className={delta > 0 ? 'text-success' : 'text-danger'}>
        {delta > 0 ? <ArrowUp size={11} className="inline" /> : <ArrowDown size={11} className="inline" />}
        {Math.abs(Math.round(delta))}%
      </span>
    )
  }

  return (
    <div>
      <PageHeader
        back="/historique"
        title={workout.name}
        subtitle={`${formatDate(workout.startedAt, 'long')} · ${formatTime(workout.startedAt)}${
          workout.finishedAt ? ` → ${formatTime(workout.finishedAt)}` : ''
        }`}
        actions={
          <>
            {!isActive && (
              <IconButton
                label={t('workout.shareImage')}
                onClick={() =>
                  void shareWorkout({ workout, exercises, settings, previousWorkouts, notify })
                }
              >
                <Share2 size={17} />
              </IconButton>
            )}
            {!isActive && cloudEnabled && (
              <IconButton label={t('workout.publish')} onClick={() => setShareOpen(true)}>
                <Megaphone size={17} />
              </IconButton>
            )}
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <IconButton label={t('workout.optionsMenu')} onClick={toggle}>
                  <ChevronRight size={18} className="rotate-90" />
                </IconButton>
              )}
              items={[
                {
                  label: isActive ? t('workout.resumeSession') : t('workout.editSession'),
                  icon: <Pencil size={15} />,
                  onClick: () => {
                    reopenWorkout(workout.id)
                    navigate('/seance')
                  },
                },
                {
                  label: t('workout.redo'),
                  icon: <Play size={15} />,
                  onClick: () => {
                    if (workouts.some((w) => w.status === 'active')) {
                      navigate('/seance')
                      return
                    }
                    const we = workout.exercises.map((e) => ({
                      exerciseId: e.exerciseId,
                      setCount: e.sets.length,
                      restSeconds: e.restSeconds,
                    }))
                    startWorkout({ name: workout.name, exercises: we, templateId: workout.templateId })
                    navigate('/seance')
                  },
                },
                {
                  label: t('workout.saveAsProgram'),
                  icon: <Save size={15} />,
                  onClick: () => {
                    setRoutineName(workout.name)
                    setSaveRoutineOpen(true)
                  },
                },
                {
                  label: t('workout.exportJson'),
                  icon: <Download size={15} />,
                  onClick: () => downloadJSON(`veryhevy-seance-${workout.id}.json`, workout),
                },
                {
                  label: t('workout.deleteSession'),
                  icon: <Trash2 size={15} />,
                  danger: true,
                  onClick: () => setConfirmDelete(true),
                },
              ]}
            />
          </>
        }
      />

      <Page className="space-y-5">
        {isActive && (
          <button
            type="button"
            onClick={() => navigate('/seance')}
            className="flex w-full items-center gap-3 rounded-2xl border border-accent-line bg-accent-soft p-3 text-left"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-solid text-accent-contrast">
              <Play size={15} fill="currentColor" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{t('workout.ongoing')}</span>
              <span className="block text-[11px] text-muted">{t('workout.tapContinue')}</span>
            </span>
            <ChevronRight size={18} className="text-accent" />
          </button>
        )}

        {/* Résumé */}
        <div className="grid grid-cols-4 gap-1.5">
          <Stat compact label={t('workout.duration')} value={formatDuration(duration, 'compact')} icon={<Clock size={12} />} sub={compare(duration, previousSame ? workoutDurationSeconds(previousSame) : undefined)} />
          <Stat
            compact
            label={t('stats.volume')}
            value={formatVolume(volume, settings.unit)}
            icon={<Weight size={12} />}
          />
          <Stat compact label={t('stats.sets')} value={sets} sub={compare(sets, previousSame ? workoutSets(previousSame) : undefined)} icon={<Flame size={12} />} />
          <Stat compact label={t('workout.reps')} value={reps} icon={<Dumbbell size={12} />} />
        </div>

        {/* Notes de séance (en haut) */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <SectionTitle className="mb-0">{t('workout.sessionNotes')}</SectionTitle>
            <Button size="sm" variant="ghost" onClick={() => setEditNotes((v) => !v)}>
              {editNotes ? t('common.close') : t('workout.edit')}
            </Button>
          </div>
          {editNotes ? (
            <Textarea
              className="mt-3"
              autoFocus
              value={workout.notes ?? ''}
              onChange={(e) => updateWorkout(workout.id, { notes: e.target.value })}
              placeholder={t('workout.notesHint2')}
            />
          ) : (
            <p className={`mt-2 text-sm ${workout.notes ? '' : 'text-muted italic'}`}>
              {workout.notes || t('workout.noNotes')}
            </p>
          )}
        </Card>

        {previousSame && (
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted">
              <Calendar size={16} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{t('workout.compared', { date: formatDate(previousSame.startedAt) })}</p>
              <p className="text-xs text-muted">
                {t('workout.volumeCompare', {
                  a: Math.round(kgToDisplay(workoutVolume(previousSame), settings.unit)).toLocaleString('fr-FR'),
                  b: Math.round(kgToDisplay(volume, settings.unit)).toLocaleString('fr-FR'),
                  u: settings.unit,
                })}{' '}
                {compare(volume, workoutVolume(previousSame))}
              </p>
            </div>
            <Link to={`/historique/${previousSame.id}`} className="text-xs font-semibold text-accent">
              {t('workout.view')}
            </Link>
          </Card>
        )}

        {/* Records */}
        {records.length > 0 && (
          <Card className="border-warning/40 bg-warning/5 p-4">
            <SectionTitle>{t('workout.newRecords')}</SectionTitle>
            <div className="space-y-1.5">
              {records.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Trophy size={14} className="shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.exercise.name}</span>
                  <span className="text-xs text-muted">{t(RECORD_KEYS[r.record.kind])}</span>
                  <span className="tabular font-bold text-warning">
                    {r.record.kind === 'weight' || r.record.kind === 'e1rm'
                      ? formatWeight(r.record.value, settings.unit)
                      : r.record.kind === 'duration'
                        ? formatDuration(r.record.value)
                        : r.record.kind === 'distance'
                          ? formatDistance(r.record.value, settings.distanceUnit)
                          : r.record.kind === 'volume'
                            ? formatVolume(r.record.value, settings.unit)
                            : Math.round(r.record.value).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Répartition musculaire */}
        {chartData.length > 0 && (
          <Card className="p-4">
            <SectionTitle>{t('workout.muscleSplit')}</SectionTitle>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={50}
                    tickFormatter={(v: string) => tx('muscle', v)}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={chartCursor}
                    wrapperStyle={chartTooltipWrapper}
                    content={
                      <ChartTooltipContent
                        format={(p, datum) =>
                          t('workout.muscleTip', {
                            sets: p.value,
                            vol: formatVolume(Number(datum.volume ?? 0), settings.unit),
                          })
                        }
                      />
                    }
                  />
                  <Bar dataKey="sets" name={t('stats.chartSets')} radius={[6, 6, 2, 2]} maxBarSize={40} minPointSize={2}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill="var(--accent)" fillOpacity={Math.max(0.45, 1 - i * 0.08)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Détail des exercices */}
        <div>
          <SectionTitle>{t('history.exCount', { n: workout.exercises.length })}</SectionTitle>
          <div className="space-y-3">
            {workout.exercises.map((we) => {
              const ex = exerciseMap.get(we.exerciseId)
              const done = we.sets.filter((s) => s.completed)
              const weVolume = done.reduce((n, s) => n + setVolume(s), 0)
              const best = Math.max(0, ...done.map((s) => estimate1RM(s.weight, s.reps)))
              return (
                <Card key={we.id} className="overflow-hidden">
                  <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {ex ? (
                          <Link to={`/exercices/${ex.id}`} className="truncate font-bold hover:text-accent">
                            {ex.name}
                          </Link>
                        ) : (
                          <span className="truncate font-bold" title={t('workout.deletedExerciseTitle')}>
                            {we.exerciseName ?? t('workout.deletedExercise')}
                          </span>
                        )}
                      </div>
                      {ex && (
                        <p className="mt-0.5 text-[11px] font-semibold text-muted">
                          {CATEGORY_META[ex.category].emoji} {tx('cat', ex.category)}
                          {ex.primaryMuscles[0] ? ` · ${tx('muscle', ex.primaryMuscles[0])}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="tabular shrink-0 text-right text-[11px] text-muted">
                      {weVolume > 0 && <div>{formatVolume(weVolume, settings.unit)}</div>}
                      {best > 0 && <div className="text-accent">1RM ~{formatWeight(best, settings.unit)}</div>}
                    </div>
                  </div>

                  <div className="divide-y divide-line/60">
                    {we.sets.map((s, i) => {
                      const meta = SET_TYPE_META[s.type]
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center gap-3 px-3.5 py-2 text-sm ${s.completed ? '' : 'opacity-40'}`}
                        >
                          <span
                            className="w-5 shrink-0 text-center text-[11px] font-extrabold"
                            style={{ color: meta.color }}
                          >
                            {meta.short || i + 1}
                          </span>
                          <span className="tabular flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                            {s.weight !== undefined && (
                              <span className="font-semibold">{formatWeight(s.weight, settings.unit)}</span>
                            )}
                            {s.reps !== undefined && <span>{s.reps} reps</span>}
                            {s.duration !== undefined && <span>{formatDuration(s.duration)}</span>}
                            {s.distance !== undefined && (
                              <span>{formatDistance(s.distance, settings.distanceUnit)}</span>
                            )}
                            {s.rpe !== undefined && <span className="text-muted">RPE {s.rpe}</span>}
                          </span>
                          {/* Séries toujours validées : plus de mention « validée ». */}
                          {!s.completed && (
                            <span className="shrink-0 text-[11px] text-muted">{t('workout.ignoredSet')}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {we.notes && (
                    <p className="border-t border-line bg-surface-2/40 px-3.5 py-2 text-[13px] text-muted italic">
                      {we.notes}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        </div>

        {!isActive && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="w-full"
              onClick={() => {
                reopenWorkout(workout.id)
                navigate('/seance')
              }}
            >
              <Pencil size={16} /> {t('workout.edit')}
            </Button>
            <Button className="w-full" variant="primary" onClick={() => setSaveRoutineOpen(true)}>
              <Copy size={16} /> {t('workout.saveAsProgram')}
            </Button>
          </div>
        )}

      </Page>

      <ConfirmDialog
        open={confirmDelete}
        title={t('workout.deleteTitle')}
        message={t('workout.deleteMessage')}
        confirmLabel={t('common.delete')}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteWorkout(workout.id)
          setConfirmDelete(false)
          navigate('/historique')
        }}
      />

      <Modal open={saveRoutineOpen} onClose={() => setSaveRoutineOpen(false)} title={t('workout.saveAsProgram')} size="sm">
        <p className="mb-3 text-sm text-muted">{t('workout.saveProgramHint2')}</p>
        <Input value={routineName} onChange={(e) => setRoutineName(e.target.value)} autoFocus />
        <div className="mt-4 flex gap-2">
          <Button block onClick={() => setSaveRoutineOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            block
            variant="primary"
            onClick={() => {
              saveWorkoutAsRoutine(workout.id, routineName.trim() || workout.name)
              setSaveRoutineOpen(false)
            }}
          >
            {t('common.save')}
          </Button>
        </div>
      </Modal>

      <SharePostModal
        open={shareOpen}
        workoutId={workout.id}
        onClose={() => setShareOpen(false)}
        onPublished={() => navigate('/')}
      />
    </div>
  )
}