import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  Dumbbell,
  Flame,
  ListChecks,
  Play,
  Plus,
  Timer,
  TrendingUp,
  Weight,
} from 'lucide-react'
import { useStore, selectActiveWorkout } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, ProgressRing, SectionTitle, Stat } from '@/components/ui'
import {
  completedWorkouts,
  dayStreak,
  muscleBreakdown,
  weekStreak,
  weeklySeries,
  workoutDurationSeconds,
  workoutSets,
  workoutVolume,
} from '@/lib/calc'
import { formatDate, formatDuration, kgToDisplay, startOfWeek, tintBg, tintText } from '@/lib/utils'
import { CATEGORY_META } from '@/types'

export default function HomePage() {
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const routines = useStore((s) => s.routines)
  const settings = useStore((s) => s.settings)
  const exercises = useStore((s) => s.exercises)
  const startWorkout = useStore((s) => s.startWorkout)
  const active = useStore(selectActiveWorkout)

  const weekStart = startOfWeek(new Date(), settings.firstDayOfWeek)
  const thisWeek = completedWorkouts(workouts).filter((w) => new Date(w.startedAt) >= weekStart)

  const weekVolume = thisWeek.reduce((n, w) => n + workoutVolume(w), 0)
  const weekTime = thisWeek.reduce((n, w) => n + workoutDurationSeconds(w), 0)
  const weekSets = thisWeek.reduce((n, w) => n + workoutSets(w), 0)

  const streak = useMemo(() => weekStreak(workouts, settings.firstDayOfWeek), [workouts, settings.firstDayOfWeek])
  const dayRun = useMemo(() => dayStreak(workouts), [workouts])
  const series = useMemo(
    () =>
      weeklySeries(workouts, 8, settings.firstDayOfWeek).map((w) => ({
        ...w,
        // les volumes sont stockés en kg : on les convertit pour l'affichage
        volume: kgToDisplay(w.volume, settings.unit),
      })),
    [workouts, settings.firstDayOfWeek, settings.unit],
  )
  const recent = useMemo(
    () => completedWorkouts(workouts).slice().sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)).slice(0, 4),
    [workouts],
  )
  const lastWorkout = recent[0]

  const goalPct = settings.weeklyGoal > 0 ? thisWeek.length / settings.weeklyGoal : 0
  const remaining = Math.max(0, settings.weeklyGoal - thisWeek.length)

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return 'Bonne nuit'
    if (h < 12) return 'Bonjour'
    if (h < 18) return 'Bon après-midi'
    return 'Bonsoir'
  })()

  return (
    <div>
      <PageHeader
        title={`${greeting} 👋`}
        subtitle={formatDate(new Date().toISOString(), 'long')}
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/seance')}>
            <Play size={15} /> {active ? 'Reprendre' : 'S’entraîner'}
          </Button>
        }
      />

      <Page className="space-y-6">
        {/* Objectif hebdo */}
        <Card className="flex items-center gap-4 p-4">
          <ProgressRing progress={goalPct} size={68} stroke={6}>
            {thisWeek.length}/{settings.weeklyGoal || '—'}
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {thisWeek.length >= settings.weeklyGoal && settings.weeklyGoal > 0
                ? 'Objectif de la semaine atteint 🎉'
                : `Objectif : ${settings.weeklyGoal} séance${settings.weeklyGoal > 1 ? 's' : ''} par semaine`}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {thisWeek.length} séance{thisWeek.length > 1 ? 's' : ''} cette semaine ·{' '}
              {remaining} restante{remaining > 1 ? 's' : ''}
            </p>
            {(streak > 0 || dayRun > 1) && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-warning/10 px-2 py-1 text-[11px] font-bold text-warning">
                <Flame size={12} />
                {streak > 1 ? `${streak} semaines d’affilée` : `${dayRun} jours d’affilée`}
              </p>
            )}
          </div>
        </Card>

        {/* Stats de la semaine */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Séances" value={thisWeek.length} icon={<CalendarCheck size={12} />} />
          <Stat
            label="Volume"
            value={Math.round(kgToDisplay(weekVolume, settings.unit)).toLocaleString('fr-FR')}
            sub={settings.unit}
            icon={<Weight size={12} />}
          />
          <Stat label="Temps" value={formatDuration(weekTime, 'compact')} icon={<Timer size={12} />} />
          <Stat label="Séries" value={weekSets} icon={<TrendingUp size={12} />} />
        </div>

        {/* Volume sur 8 semaines */}
        {workouts.length > 0 && (
          <Card className="p-4">
            <SectionTitle>Volume des 8 dernières semaines</SectionTitle>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${Math.round(v).toLocaleString('fr-FR')} ${settings.unit}`, 'Volume']}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    fill="url(#vol)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Dernière séance */}
        {lastWorkout && (
          <div>
            <SectionTitle
              action={
                <Link to="/historique" className="text-xs font-semibold text-accent">
                  Tout voir
                </Link>
              }
            >
              Dernière séance
            </SectionTitle>
            <Link to={`/historique/${lastWorkout.id}`}>
              <Card className="p-4 transition-colors hover:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{lastWorkout.name}</p>
                    <p className="text-xs text-muted">{formatDate(lastWorkout.startedAt, 'long')}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {muscleBreakdown(lastWorkout, exercises)
                    .slice(0, 5)
                    .map((m) => (
                      <span key={m.muscle} className="rounded-md bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted">
                        {m.muscle} · {m.sets}
                      </span>
                    ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div>
                    <p className="tabular text-sm font-extrabold">{workoutSets(lastWorkout)}</p>
                    <p className="text-[10px] tracking-wide text-muted uppercase">séries</p>
                  </div>
                  <div>
                    <p className="tabular text-sm font-extrabold">
                      {Math.round(kgToDisplay(workoutVolume(lastWorkout), settings.unit)).toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[10px] tracking-wide text-muted uppercase">{settings.unit}</p>
                  </div>
                  <div>
                    <p className="tabular text-sm font-extrabold">
                      {formatDuration(workoutDurationSeconds(lastWorkout), 'compact')}
                    </p>
                    <p className="text-[10px] tracking-wide text-muted uppercase">durée</p>
                  </div>
                </div>
              </Card>
            </Link>
          </div>
        )}

        {/* Séances précédentes */}
        {recent.length > 1 && (
          <div>
            <SectionTitle>Séances récentes</SectionTitle>
            <div className="space-y-2">
              {recent.slice(1).map((w) => (
                <Link
                  key={w.id}
                  to={`/historique/${w.id}`}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 text-muted">
                    <Dumbbell size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{w.name}</span>
                    <span className="block text-[11px] text-muted">
                      {formatDate(w.startedAt)} · {workoutSets(w)} séries ·{' '}
                      {formatDuration(workoutDurationSeconds(w), 'compact')}
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Programmes */}
        <div>
          <SectionTitle
            action={
              <Link to="/programmes" className="text-xs font-semibold text-accent">
                Gérer
              </Link>
            }
          >
            Programmes
          </SectionTitle>
          {routines.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ListChecks size={24} />}
                title="Aucun programme"
                message="Créez un programme pour lancer vos séances en un clic."
                action={
                  <Button variant="primary" onClick={() => navigate('/programmes')}>
                    <Plus size={16} /> Créer
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {routines.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    if (active) {
                      navigate('/seance')
                      return
                    }
                    startWorkout({ templateId: r.id, templateName: r.name })
                    navigate('/seance')
                  }}
                  className="w-44 shrink-0 rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
                >
                  <span
                    className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg text-sm"
                    style={{ background: `color-mix(in srgb, ${r.color} 20%, transparent)` }}
                  >
                    {r.folder === 'Cardio' ? '🏃' : '🏋️'}
                  </span>
                  <span className="line-clamp-2 block text-[13px] font-bold">{r.name}</span>
                  <span className="mt-1 block text-[11px] text-muted">{r.exercises.length} exercices</span>
                </button>
              ))}
              <Link
                to="/programmes"
                className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-line text-muted transition-colors hover:text-ink"
              >
                <ArrowRight size={18} />
                <span className="text-[11px] font-semibold">Voir tout</span>
              </Link>
            </div>
          )}
        </div>

        {/* Répartition musculaire récente */}
        {lastWorkout && (
          <CategoryLegend workoutId={lastWorkout.id} />
        )}
      </Page>
    </div>
  )
}

function CategoryLegend({ workoutId }: { workoutId: string }) {
  const workout = useStore((s) => s.workouts.find((w) => w.id === workoutId))
  const exercises = useStore((s) => s.exercises)
  if (!workout) return null

  const counts = new Map<string, number>()
  for (const we of workout.exercises) {
    const ex = exercises.find((e) => e.id === we.exerciseId)
    const cat = ex?.category ?? 'autre'
    counts.set(cat, (counts.get(cat) ?? 0) + we.sets.filter((s) => s.completed).length)
  }
  const entries = [...counts.entries()].filter(([, n]) => n > 0)
  if (!entries.length) return null

  return (
    <Card className="p-4">
      <SectionTitle>Types d’effort — dernière séance</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {entries.map(([cat, n]) => {
          const meta = CATEGORY_META[cat as keyof typeof CATEGORY_META] ?? CATEGORY_META.autre
          return (
            <span
              key={cat}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{ background: tintBg(meta.color), color: tintText(meta.color) }}
            >
              {meta.emoji} {meta.label} · {n}
            </span>
          )
        })}
      </div>
    </Card>
  )
}
