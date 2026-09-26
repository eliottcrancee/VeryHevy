import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Dumbbell, Plus } from 'lucide-react'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, IconButton, SectionTitle } from '@/components/ui'
import { workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { addDays, cn, formatDate, formatDuration, formatVolume, startOfWeek, toDateKey } from '@/lib/utils'
import { localeOf, t, useLang } from '@/lib/i18n'

export default function CalendarPage({ bare }: { bare?: boolean }) {
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const settings = useStore((s) => s.settings)
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState<string | null>(null)
  const loc = localeOf(useLang())

  const monthLabel = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(cursor)

  // Abréviations des jours dérivées de la locale (lun., mar., …) : libellés
  // courts garantis (ils débordaient avant, faute de clés i18n par jour).
  const weekdayLabels = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(loc, { weekday: 'short' })
    // Lundi de référence : convention des données, 0 = lundi.
    const monday = new Date(2024, 0, 1)
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(addDays(monday, (i + settings.firstDayOfWeek + 6) % 7)).replace('.', ''),
    )
  }, [loc, settings.firstDayOfWeek])

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeek(first, settings.firstDayOfWeek)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor, settings.firstDayOfWeek])

  const byDay = useMemo(() => {
    const map = new Map<string, typeof workouts>()
    for (const w of workouts) {
      const key = toDateKey(w.startedAt)
      const list = map.get(key) ?? []
      list.push(w)
      map.set(key, list)
    }
    return map
  }, [workouts])

  const todayKey = toDateKey(new Date())
  const selectedWorkouts = selected ? (byDay.get(selected) ?? []) : []

  const body = (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="mb-3 flex items-center justify-between">
            <IconButton
              label={t('workout.prevMonth')}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft size={18} />
            </IconButton>
            <p className="text-sm font-bold capitalize">{monthLabel}</p>
            <IconButton
              label={t('workout.nextMonth')}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight size={18} />
            </IconButton>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekdayLabels.map((label) => (
              <div key={label} className="pb-1 text-center text-[10px] font-bold tracking-wide text-muted uppercase">
                {label}
              </div>
            ))}
            {days.map((d) => {
              const key = toDateKey(d)
              const list = byDay.get(key) ?? []
              const isCurrentMonth = d.getMonth() === cursor.getMonth()
              const isToday = key === todayKey
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key === selected ? null : key)}
                  className={cn(
                    'relative flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] font-semibold transition-colors',
                    !isCurrentMonth && 'opacity-30',
                    key === selected && 'bg-accent-solid text-accent-contrast',
                    key !== selected && isToday && 'ring-1 ring-accent',
                    key !== selected && 'hover:bg-surface-2',
                  )}
                >
                  {d.getDate()}
                  {list.length > 0 && (
                    <span className="absolute bottom-1 flex gap-0.5">
                      {list.slice(0, 3).map((w) => (
                        <span
                          key={w.id}
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            key === selected ? 'bg-accent-contrast' : 'bg-accent',
                          )}
                        />
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        {selected ? (
          <div>
            <SectionTitle>{formatDate(selected, 'long')}</SectionTitle>
            {selectedWorkouts.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Dumbbell size={22} />}
                  title={t('workout.restDay')}
                  message={t('workout.noWorkout')}
                  action={
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        useStore.getState().startWorkout()
                        navigate('/seance')
                      }}
                    >
                      <Plus size={14} /> {t('workout.startWorkout')}
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="space-y-2">
                {selectedWorkouts.map((w) => (
                  <Link
                    key={w.id}
                    to={`/historique/${w.id}`}
                    className="block rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:bg-surface-2"
                  >
                    <p className="font-bold">{w.name}</p>
                    <p className="mt-1 text-[11px] text-muted">
                      {t('history.exCount', { n: w.exercises.length })} · {t('history.setCount', { n: workoutSets(w) })} ·{' '}
                      {formatVolume(workoutVolume(w), settings.unit)} ·{' '}
                      {formatDuration(workoutDurationSeconds(w), 'compact')}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Card className="p-4 text-center text-sm text-muted">
            {t('workout.tapDay')}
          </Card>
        )}
    </div>
  )

  if (bare) return body

  return (
    <div>
      <PageHeader title={t('workout.calendar')} subtitle={t('workout.calendarSub', { count: byDay.size })} />

      <Page className="max-w-3xl space-y-4">
        {body}
      </Page>
    </div>
  )
}