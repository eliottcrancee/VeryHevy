import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, Dumbbell, Flame, Timer, Trophy, TrendingUp, Weight } from 'lucide-react'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Card, Chip, EmptyState, ProgressBar, SectionTitle, Stat } from '@/components/ui'
import {
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
import { addDays, cn, formatDuration, formatVolume, formatWeight, kgToDisplay, startOfWeek, toDateKey } from '@/lib/utils'

type Range = '30j' | '90j' | '6m' | 'tout'

const RANGE_DAYS: Record<Range, number | null> = { '30j': 30, '90j': 90, '6m': 182, tout: null }

export default function StatsPage() {
  const workouts = useStore((s) => s.workouts)
  const exercises = useStore((s) => s.exercises)
  const settings = useStore((s) => s.settings)
  const [range, setRange] = useState<Range>('90j')

  const all = completedWorkouts(workouts)

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range]
    if (!days) return all
    const limit = Date.now() - days * 86400000
    return all.filter((w) => +new Date(w.startedAt) >= limit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range])

  const totalVolume = filtered.reduce((n, w) => n + workoutVolume(w), 0)
  const totalTime = filtered.reduce((n, w) => n + workoutDurationSeconds(w), 0)
  const totalSets = filtered.reduce((n, w) => n + workoutSets(w), 0)

  const series = useMemo(
    () =>
      weeklySeries(all, range === '30j' ? 6 : range === '90j' ? 12 : 16, settings.firstDayOfWeek).map((w) => ({
        ...w,
        volume: kgToDisplay(w.volume, settings.unit),
      })),
    [all, range, settings.firstDayOfWeek, settings.unit],
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
    return [...used]
      .map((id) => {
        const ex = exercises.find((e) => e.id === id)
        const prs = getPersonalRecords(all, id)
        const best = prs.find((p) => p.kind === 'weight')
        const e1rm = prs.find((p) => p.kind === 'e1rm')
        return ex && (best || e1rm) ? { ex, best: best?.value, e1rm: e1rm?.value, kind: best ? 'weight' : 'e1rm', date: (best ?? e1rm)!.workout.startedAt } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .slice(0, 10)
  }, [filtered, all, exercises])

  // Heatmap de régularité (12 dernières semaines)
  const heatmap = useMemo(() => {
    const days = new Map<string, number>()
    for (const w of all) {
      const key = toDateKey(w.startedAt)
      days.set(key, (days.get(key) ?? 0) + 1)
    }
    const start = startOfWeek(addDays(new Date(), -7 * 11), settings.firstDayOfWeek)
    return Array.from({ length: 12 }, (_, week) =>
      Array.from({ length: 7 }, (_, day) => {
        const d = addDays(start, week * 7 + day)
        const key = toDateKey(d)
        return { date: d, key, count: days.get(key) ?? 0, future: d > new Date() }
      }),
    )
  }, [all, settings.firstDayOfWeek])

  const bodyweightSeries = useMemo(
    () =>
      workouts
        .filter((w) => w.bodyweightKg !== undefined)
        .sort((a, b) => +new Date(a.startedAt) - +new Date(b.startedAt))
        .slice(-20)
        .map((w) => ({
          label: new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(w.startedAt)),
          poids: w.bodyweightKg,
        })),
    [workouts],
  )

  if (!all.length) {
    return (
      <div>
        <PageHeader title="Statistiques" />
        <Page>
          <Card>
            <EmptyState
              icon={<Activity size={26} />}
              title="Pas encore de statistiques"
              message="Terminez une première séance pour découvrir vos courbes de progression."
            />
          </Card>
        </Page>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Statistiques" subtitle={`${filtered.length} séances sur la période`} />
      <Page className="space-y-5">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {(
            [
              ['30j', '30 jours'],
              ['90j', '3 mois'],
              ['6m', '6 mois'],
              ['tout', 'Tout'],
            ] as [Range, string][]
          ).map(([value, label]) => (
            <Chip key={value} active={range === value} onClick={() => setRange(value)}>
              {label}
            </Chip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Séances" value={filtered.length} icon={<Flame size={12} />} />
          <Stat
            label="Volume"
            value={`${Math.round(kgToDisplay(totalVolume, settings.unit) / 1000).toLocaleString('fr-FR')}k`}
            sub={settings.unit}
            icon={<Weight size={12} />}
          />
          <Stat label="Temps" value={formatDuration(totalTime, 'compact')} icon={<Timer size={12} />} />
          <Stat label="Séries" value={totalSets} icon={<TrendingUp size={12} />} />
        </div>

        {/* Régularité */}
        <Card className="p-4">
          <SectionTitle>Régularité — 12 dernières semaines</SectionTitle>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {heatmap.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map((day) => (
                  <div
                    key={day.key}
                    title={`${day.date.toLocaleDateString('fr-FR')}${day.count ? ` · ${day.count} séance(s)` : ''}`}
                    className={cn(
                      'h-5 w-5 shrink-0 rounded',
                      day.future ? 'opacity-0' : day.count > 0 ? 'bg-accent' : 'bg-surface-3',
                    )}
                    style={day.count > 0 ? { opacity: Math.min(1, 0.55 + day.count * 0.25) } : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-muted">
            <span>Moins</span>
            <span className="h-3 w-3 rounded bg-surface-3" />
            <span className="h-3 w-3 rounded bg-accent/60" />
            <span className="h-3 w-3 rounded bg-accent" />
            <span>Plus</span>
          </div>
        </Card>

        {/* Volume hebdo */}
        <Card className="p-4">
          <SectionTitle>Volume par semaine ({settings.unit})</SectionTitle>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={46} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${Math.round(v).toLocaleString('fr-FR')} ${settings.unit}`, 'Volume']}
                />
                <Bar dataKey="volume" radius={[6, 6, 0, 0]} fill="var(--accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Types d'effort */}
        {categories.length > 0 && (
          <Card className="p-4">
            <SectionTitle>Répartition par type d’effort</SectionTitle>
            <div className="space-y-3">
              {categories.map(({ cat, sets, meta }) => (
                <div key={cat}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-semibold">
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="tabular text-muted">{sets} séries</span>
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
            <SectionTitle>Séries par groupe musculaire</SectionTitle>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={muscles} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="muscle"
                    tick={{ fontSize: 11, fill: 'var(--muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={96}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v} séries`, '']}
                  />
                  <Bar dataKey="sets" radius={[0, 6, 6, 0]}>
                    {muscles.map((_, i) => (
                      <Cell key={i} fill="var(--accent)" fillOpacity={1 - i * 0.06} />
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
            <SectionTitle>Exercices les plus travaillés</SectionTitle>
            <div className="space-y-2">
              {topExercises.map((t) => (
                <Link
                  key={t.exercise!.id}
                  to={`/exercices/${t.exercise!.id}`}
                  className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 transition-colors hover:bg-surface-3"
                >
                  <Dumbbell size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{t.exercise!.name}</span>
                    <span className="block text-[11px] text-muted">
                      {t.sessions} séances · {t.sets} séries
                      {t.volume > 0 && ` · ${formatVolume(t.volume, settings.unit)}`}
                    </span>
                  </span>
                  {t.best > 0 && (
                    <span className="tabular shrink-0 text-[12px] font-bold text-accent">
                      {formatWeight(t.best, settings.unit)}
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
            <SectionTitle>Meilleures charges</SectionTitle>
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

        {/* Poids de corps */}
        {bodyweightSeries.length > 1 && (
          <Card className="p-4">
            <SectionTitle>Poids de corps</SectionTitle>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  data={[{ name: 'poids', value: bodyweightSeries.at(-1)?.poids ?? 0, fill: 'var(--accent)' }]}
                  innerRadius="45%"
                  outerRadius="100%"
                  startAngle={210}
                  endAngle={-30}
                >
                  <PolarAngleAxis type="number" domain={[0, (bodyweightSeries.at(-1)?.poids ?? 100) * 1.3]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={12} background />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-center text-sm font-bold">
              {formatWeight(bodyweightSeries.at(-1)?.poids, settings.unit)}
              <span className="ml-2 text-[11px] font-normal text-muted">dernier relevé</span>
            </p>
          </Card>
        )}
      </Page>
    </div>
  )
}