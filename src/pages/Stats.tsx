import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, Dumbbell, Trophy } from 'lucide-react'
import { useStore } from '@/store/store'
import { PageHeader } from '@/components/PageHeader'
import { Card, EmptyState, ProgressBar, SectionTitle } from '@/components/ui'
import { RangeChips } from '@/components/RangeChips'
import {
  arcWorkouts,
  completedWorkouts,
  estimate1RM,
  getPersonalRecords,
  muscleVolume,
  workoutDurationSeconds,
  workoutSets,
  workoutVolume,
  weeklySeries,
} from '@/lib/calc'
import { CATEGORY_META } from '@/types'
import CalendarPage from '@/pages/Calendar'
import { t, tx, useLang } from '@/lib/i18n'
import { ChartTooltipContent, chartCursor, chartTooltipWrapper } from '@/components/charts'
import { formatDuration, formatVolume, formatWeight, kgToDisplay, cn, DEFAULT_RANGE, RANGE_WEEKS, rangeSince, type RangeFilter } from '@/lib/utils'
import type { Exercise, Workout } from '@/types'

/**
 * Stats du carnet local, ou d'un profil consulté (`workouts`/`exercises`
 * injectés : ses séances + sa bibliothèque reconstituée).
 */
export default function StatsPage({ bare = false, workouts: shared, exercises: sharedExercises }: {
  bare?: boolean
  workouts?: Workout[]
  exercises?: Exercise[]
}) {
  useLang()
  const myWorkouts = useStore((s) => s.workouts)
  const myExercises = useStore((s) => s.exercises)
  const settings = useStore((s) => s.settings)
  const [range, setRange] = useState<RangeFilter>(DEFAULT_RANGE)

  const workouts = shared ?? myWorkouts
  const exercises = sharedExercises ?? myExercises
  const all = completedWorkouts(workouts)

  const filtered = useMemo(() => {
    const since = rangeSince(range)
    if (since === null) return all
    return all.filter((w) => +new Date(w.startedAt) >= since)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range])

  const totalVolume = filtered.reduce((n, w) => n + workoutVolume(w), 0)
  const totalTime = filtered.reduce((n, w) => n + workoutDurationSeconds(w), 0)
  const totalSets = filtered.reduce((n, w) => n + workoutSets(w), 0)

  const series = useMemo(
    () => weeklySeries(all, RANGE_WEEKS[range], settings.firstDayOfWeek),
    [all, range, settings.firstDayOfWeek],
  )

  const muscles = useMemo(() => muscleVolume(filtered, exercises).slice(0, 12), [filtered, exercises])

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of filtered) {
      for (const we of w.exercises) {
        const ex = exercises.find((e) => e.id === we.exerciseId)
        const cat = ex?.category ?? 'autre'
        map.set(cat, (map.get(cat) ?? 0) + we.sets.filter((s) => s.completed).length)
      }
    }
    return [...map.entries()]
      .map(([cat, sets]) => ({
        cat,
        sets,
        meta: CATEGORY_META[cat as keyof typeof CATEGORY_META] ?? CATEGORY_META.autre,
      }))
      .sort((a, b) => b.sets - a.sets)
  }, [filtered, exercises])

  const topExercises = useMemo(() => {
    const map = new Map<string, { sets: number; volume: number; best: number; sessions: number }>()
    for (const w of filtered) {
      for (const we of w.exercises) {
        const entry = map.get(we.exerciseId) ?? { sets: 0, volume: 0, best: 0, sessions: 0 }
        const done = we.sets.filter((s) => s.completed)
        if (!done.length) continue
        entry.sessions += 1
        entry.sets += done.length
        entry.volume += done.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0)
        entry.best = Math.max(entry.best, ...done.map((s) => s.weight ?? 0))
        map.set(we.exerciseId, entry)
      }
    }
    return [...map.entries()]
      .map(([id, v]) => ({ exercise: exercises.find((e) => e.id === id), ...v }))
      .filter((x) => x.exercise)
      .sort((a, b) => b.volume - a.volume || b.sets - a.sets)
      .slice(0, 8)
  }, [filtered, exercises])

  const records = useMemo(() => {
    const used = new Set(filtered.flatMap((w) => w.exercises.map((we) => we.exerciseId)))
    // Records limités à l'arc en cours (réinitialisables dans les réglages) —
    // pour un profil consulté, on garde tout son historique.
    const arc = arcWorkouts(all, shared ? null : settings.recordsSince)
    return [...used]
      .map((id) => {
        const ex = exercises.find((e) => e.id === id)
        const prs = getPersonalRecords(arc, id)
        const best = prs.find((p) => p.kind === 'weight')
        const e1rm = prs.find((p) => p.kind === 'e1rm')
        return ex && (best || e1rm) ? { ex, best: best?.value, e1rm: e1rm?.value, kind: best ? 'weight' : 'e1rm', date: (best ?? e1rm)!.workout.startedAt } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 10)
  }, [filtered, all, exercises, settings.recordsSince, shared])

  // Calendrier d'entraînement (le détail par jour vit dans le composant Calendar).

  // En mode `bare` (onglet Profil), le parent fournit déjà le padding de Page :
  // on n'ajoute que l'espacement vertical.
  const pageClass = cn('w-full space-y-5', !bare && 'mx-auto max-w-5xl px-4 py-4')

  if (!all.length) {
    return (
      <div>
        {!bare && <PageHeader title={t('stats.title')} />}
        <div className={pageClass}>
          <Card>
            <EmptyState
              icon={<Activity size={26} />}
              title={t('stats.empty')}
              message={t('stats.emptyHint')}
            />
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      {!bare && <PageHeader title={t('stats.title')} subtitle={t('stats.subtitle', { n: filtered.length })} />}
      <div className={pageClass}>
        <RangeChips value={range} onChange={setRange} />

        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { label: t('stats.sessions'), value: String(filtered.length) },
            { label: t('stats.volume'), value: `${Math.round(kgToDisplay(totalVolume, settings.unit) / 1000).toLocaleString('fr-FR')}k` },
            { label: t('stats.time'), value: formatDuration(totalTime, 'compact') },
            { label: t('stats.sets'), value: String(totalSets) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-surface px-1 py-2">
              <p className="tabular truncate text-sm font-extrabold">{s.value}</p>
              <p className="text-[10px] tracking-wide text-muted uppercase">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Durée d'entraînement par semaine */}
        <Card className="p-4">
          <SectionTitle>{t('stats.durationPerWeek')}</SectionTitle>
          <div className="mx-auto h-36 w-full max-w-md">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v: number) => (v >= 3600 ? `${Math.round(v / 3600)}h` : v >= 60 ? `${Math.round(v / 60)}m` : `${v}s`)}
                />
                <Tooltip
                  cursor={chartCursor}
                  wrapperStyle={chartTooltipWrapper}
                  content={
                    <ChartTooltipContent
                      format={(p, datum) =>
                        p.dataKey === 'duration'
                          ? t('stats.tipDuration', {
                              v: formatDuration(Number(p.value), 'compact'),
                              s: String(datum.sets ?? 0),
                            })
                          : null
                      }
                    />
                  }
                />
                <Bar dataKey="duration" name={t('stats.chartDuration')} radius={[6, 6, 2, 2]} fill="var(--accent)" minPointSize={2} maxBarSize={34}>
                  {series.map((s, i) => (
                    <Cell
                      key={i}
                      fill="var(--accent)"
                      fillOpacity={s.duration > 0 ? 0.65 + (0.35 * s.duration) / Math.max(1, ...series.map((x) => x.duration)) : 0.25}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Calendrier */}
        <Card className="p-4">
          <SectionTitle>{t('stats.calendar')}</SectionTitle>
          <CalendarPage bare workouts={workouts} shared={Boolean(shared)} />
        </Card>

        {/* Types d'effort */}
        {categories.length > 0 && (
          <Card className="p-4">
            <SectionTitle>{t('stats.byType')}</SectionTitle>
            <div className="mx-auto w-full max-w-md space-y-3">
              {categories.map(({ cat, sets, meta }) => (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-semibold">
                      {meta.emoji} {tx('cat', cat)}
                    </span>
                    <span className="tabular text-muted">{t('stats.setsCount', { n: sets })}</span>
                  </div>
                  <ProgressBar value={sets} max={categories[0].sets} color={meta.color} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Muscles */}
        {muscles.length > 0 && (
          <Card className="p-4">
            <SectionTitle>{t('stats.byMuscle')}</SectionTitle>
            <div className="mx-auto h-64 w-full max-w-md">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={muscles} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="muscle"
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={96}
                    tickFormatter={(v: string) => tx('muscle', v)}
                  />
                  <Tooltip
                    cursor={chartCursor}
                    wrapperStyle={chartTooltipWrapper}
                    content={
                      <ChartTooltipContent
                        format={(p, datum) =>
                          t('stats.tipMuscle', {
                            v: p.value,
                            vol: Math.round(kgToDisplay(Number(datum.volume ?? 0), settings.unit)).toLocaleString('fr-FR'),
                            u: settings.unit,
                          })
                        }
                      />
                    }
                  />
                  <Bar dataKey="sets" name={t('stats.chartSets')} radius={[0, 6, 6, 0]} barSize={14} maxBarSize={18}>
                    {muscles.map((_, i) => (
                      <Cell key={i} fill="var(--accent)" fillOpacity={Math.max(0.35, 1 - i * 0.06)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Top exercices */}
        {topExercises.length > 0 && (
          <Card className="p-4">
            <SectionTitle>{t('stats.topExercises')}</SectionTitle>
            <div className="space-y-2">
              {topExercises.map((x) => (
                <Link
                  key={x.exercise!.id}
                  to={`/exercices/${x.exercise!.id}`}
                  className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 transition-colors hover:bg-surface-3"
                >
                  <Dumbbell size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{x.exercise!.name}</span>
                    <span className="block text-[11px] text-muted">
                      {x.volume > 0
                        ? t('stats.topSubVol', {
                            sub: t('stats.topSub', { a: x.sessions, b: x.sets }),
                            vol: formatVolume(x.volume, settings.unit),
                          })
                        : t('stats.topSub', { a: x.sessions, b: x.sets })}
                    </span>
                  </span>
                  {x.best > 0 && (
                    <span className="tabular shrink-0 text-[12px] font-bold text-accent">
                      {formatWeight(x.best, settings.unit)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Records */}
        {records.length > 0 && (
          <Card className="p-4">
            <SectionTitle>{t('stats.best')}</SectionTitle>
            <div className="space-y-1.5">
              {records.map((r) => (
                <div key={r.ex.id} className="flex items-center gap-3 text-sm">
                  <Trophy size={13} className="shrink-0 text-warning" />
                  <Link to={`/exercices/${r.ex.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                    {r.ex.name}
                  </Link>
                  <span className="tabular text-[11px] text-muted">
                    {r.best
                      ? formatWeight(r.best, settings.unit)
                      : `~${formatWeight(r.e1rm ?? estimate1RM(r.best, 1), settings.unit)} (1RM)`}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        </div>
    </div>
  )
}
