import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Dumbbell, Search, Share2, Star } from 'lucide-react'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Chip, EmptyState, IconButton, Input } from '@/components/ui'
import {
  completedWorkouts,
  muscleBreakdown,
  workoutDurationSeconds,
  workoutSets,
  workoutVolume,
} from '@/lib/calc'
import { formatDate, formatDuration, formatVolume, normalize } from '@/lib/utils'
import { shareWorkout } from '@/lib/share'
import { localeOf, t, tx, useLang } from '@/lib/i18n'

type Period = 'tout' | '30j' | '90j' | 'annee'

export default function HistoryPage({ bare = false }: { bare?: boolean }) {
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const exercises = useStore((s) => s.exercises)
  const settings = useStore((s) => s.settings)
  const notify = useStore((s) => s.notify)
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState<Period>('tout')
  const loc = localeOf(useLang())

  const filtered = useMemo(() => {
    const now = Date.now()
    const limits: Record<Period, number> = {
      tout: 0,
      '30j': 30 * 86400000,
      '90j': 90 * 86400000,
      annee: 365 * 86400000,
    }
    const q = normalize(query)
    return completedWorkouts(workouts)
      .filter((w) => (limits[period] ? now - +new Date(w.startedAt) <= limits[period] : true))
      .filter((w) => {
        if (!q) return true
        const haystack = [
          w.name,
          w.notes ?? '',
          w.templateName ?? '',
          ...w.exercises.map(
            (we) => exercises.find((e) => e.id === we.exerciseId)?.name ?? we.exerciseName ?? '',
          ),
        ]
        return haystack.some((h) => normalize(h).includes(q))
      })
      .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt))
  }, [workouts, exercises, query, period])

  const all = completedWorkouts(workouts)

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const w of filtered) {
      const key = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(new Date(w.startedAt))
      const list = map.get(key) ?? []
      list.push(w)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [filtered])

  return (
    <div>
      {!bare && <PageHeader title={t('history.title')} subtitle={t('history.subtitle', { count: all.length })} />}

      <Page className="space-y-5">
        <div className="space-y-2">
          <div className="relative">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('history.search')}
              className="pl-9"
            />
          </div>
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {(
              [
                ['tout', t('common.all')],
                ['30j', t('history.last30')],
                ['90j', t('history.last90')],
                ['annee', t('history.lastYear')],
              ] as [Period, string][]
            ).map(([value, label]) => (
              <Chip key={value} active={period === value} onClick={() => setPeriod(value)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>

        {!filtered.length ? (
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title={t('history.empty')}
              message={query ? t('history.emptyQuery') : t('history.emptyHint')}
              action={
                !query ? (
                  <Button variant="primary" onClick={() => navigate('/seance')}>
                    {t('history.start')}
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          grouped.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 flex items-center justify-between text-[13px] font-bold tracking-wider text-muted uppercase">
                <span className="capitalize">{month}</span>
                <span className="font-medium normal-case">{t('history.monthCount', { count: list.length })}</span>
              </h2>
              <div className="space-y-2">
                {list.map((w) => {
                  const breakdown = muscleBreakdown(w, exercises)
                  return (
                    <Link
                      key={w.id}
                      to={`/historique/${w.id}`}
                      className="block rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:bg-surface-2"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 leading-none">
                          <span className="text-[15px] font-extrabold">
                            {new Date(w.startedAt).getDate()}
                          </span>
                          <span className="text-[9px] tracking-wide text-muted uppercase">
                            {new Intl.DateTimeFormat(loc, { month: 'short' }).format(new Date(w.startedAt))}
                          </span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-bold">{w.name}</p>
                            {w.status === 'active' && (
                              <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                                {t('history.active')}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted">{formatDate(w.startedAt, 'long')}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                            <span className="tabular">{t('history.exCount', { n: w.exercises.length })}</span>
                            <span className="tabular">{t('history.setCount', { n: workoutSets(w) })}</span>
                            <span className="tabular">{formatVolume(workoutVolume(w), settings.unit)}</span>
                            <span className="tabular">{formatDuration(workoutDurationSeconds(w), 'compact')}</span>
                          </div>
                          {breakdown.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {breakdown.slice(0, 4).map((m) => (
                                <span key={m.muscle} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                                  {tx('muscle', m.muscle)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {w.rating ? (
                            <span className="flex items-center gap-0.5 text-warning">
                              <Star size={11} fill="currentColor" />
                              <span className="text-[11px] font-bold">{w.rating}</span>
                            </span>
                          ) : null}
                          <span className="mt-auto flex items-center">
                            <IconButton
                              label={t('history.shareLabel', { name: w.name })}
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const previousWorkouts = completedWorkouts(workouts).filter(
                                  (o) => o.id !== w.id && +new Date(o.startedAt) < +new Date(w.startedAt),
                                )
                                void shareWorkout({ workout: w, exercises, settings, previousWorkouts, notify })
                              }}
                            >
                              <Share2 size={15} />
                            </IconButton>
                            <ChevronRight size={16} className="text-muted" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))
        )}
      </Page>
    </div>
  )
}
