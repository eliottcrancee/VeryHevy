import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  History,
  LayoutDashboard,
  ListChecks,
  Pause,
  Play,
  Plus,
  Settings as SettingsIcon,
  Timer,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { cn, formatDuration, playBeep, showRestNotification, vibrate } from '@/lib/utils'
import { workoutDurationSeconds } from '@/lib/calc'
import { selectActiveWorkout, useStore } from '@/store/store'
import { Button, IconButton, Toaster } from '@/components/ui'
import { ScrollTargetProvider } from '@/components/ui'
import { Logo } from '@/components/Logo'

const NAV = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/programmes', label: 'Programmes', icon: ListChecks },
  { to: '/historique', label: 'Historique', icon: History },
  { to: '/gymbro', label: 'GymBro', icon: Users },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/profil', label: 'Profil', icon: UserRound },
]

/* ------------------------------------------------------------------ */
/* Chrono de repos global                                             */
/* ------------------------------------------------------------------ */

function useTick(active: boolean, intervalMs = 250) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => force((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
}

export function RestTimerBar() {
  const restTimer = useStore((s) => s.restTimer)
  const stopRest = useStore((s) => s.stopRest)
  const adjustRest = useStore((s) => s.adjustRest)
  const pauseRest = useStore((s) => s.pauseRest)
  const resumeRest = useStore((s) => s.resumeRest)
  const soundEnabled = useStore((s) => s.settings.restSoundEnabled)
  const notifyEnabled = useStore((s) => s.settings.restNotifyEnabled)
  const [fired, setFired] = useState(false)

  const paused = restTimer.pausedSeconds != null
  const active = Boolean(restTimer.endsAt) || paused
  useTick(active && !paused)

  const remaining = paused
    ? Math.max(0, Math.round(restTimer.pausedSeconds ?? 0))
    : restTimer.endsAt
      ? Math.max(0, Math.round((restTimer.endsAt - Date.now()) / 1000))
      : 0
  const finished = active && !paused && remaining <= 0

  useEffect(() => {
    setFired(false)
  }, [restTimer.endsAt, restTimer.pausedSeconds])

  useEffect(() => {
    if (active && finished && !fired) {
      setFired(true)
      if (soundEnabled) playBeep(2)
      vibrate([120, 60, 120])
      if (notifyEnabled) showRestNotification(restTimer.label ?? undefined)
    }
  }, [active, finished, fired, soundEnabled, notifyEnabled, restTimer.label])

  if (!active) return null

  const total = restTimer.totalSeconds || 1
  const pct = Math.min(100, ((total - remaining) / total) * 100)

  return (
    <div className="animate-slide-up fixed inset-x-0 bottom-[calc(var(--bottom-stack,0px)+var(--bottom-bar,0px)+16px)] z-40 px-3 lg:left-auto lg:right-4 lg:w-96 lg:px-0">
      <div
        className={cn(
          'glass relative overflow-hidden rounded-2xl border shadow-xl',
          finished ? 'border-success/60' : 'border-line',
        )}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={() => (paused ? resumeRest() : pauseRest())}
            title={paused ? 'Reprendre le chrono' : 'Mettre en pause'}
            aria-label={paused ? 'Reprendre le chrono' : 'Mettre en pause'}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95',
              finished ? 'bg-success text-white' : paused ? 'bg-warning/20 text-warning' : 'bg-accent-soft text-accent',
            )}
          >
            {finished ? <Timer size={18} /> : paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="tabular text-xl font-extrabold">
                {finished ? 'Repos terminé' : formatDuration(remaining)}
              </span>
              {paused && !finished && (
                <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning uppercase">
                  pause
                </span>
              )}
              {restTimer.label && !finished && (
                <span className="truncate text-[11px] text-muted">{restTimer.label}</span>
              )}
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn('h-full rounded-full transition-[width] duration-300', finished ? 'bg-success' : paused ? 'bg-warning' : 'bg-accent')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IconButton label="-15 s" onClick={() => adjustRest(-15)} className="h-8 w-8 text-xs font-bold">
              −15
            </IconButton>
            <IconButton label="+15 s" onClick={() => adjustRest(15)} className="h-8 w-8 text-xs font-bold">
              +15
            </IconButton>
            <IconButton label="Arrêter le repos" onClick={stopRest}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bandeau séance en cours                                            */
/* ------------------------------------------------------------------ */

function ActiveWorkoutPill({ compact }: { compact?: boolean }) {
  const workout = useStore(selectActiveWorkout)
  const navigate = useNavigate()
  const clockPaused = Boolean(workout?.finishedAt)
  useTick(Boolean(workout) && !clockPaused, 1000)

  const elapsed = workout ? workoutDurationSeconds(workout) : 0
  const doneSets = workout
    ? workout.exercises.reduce((n, we) => n + we.sets.filter((s) => s.completed).length, 0)
    : 0

  if (!workout) {
    return compact ? null : (
      <Button variant="primary" block onClick={() => navigate('/seance')}>
        <Plus size={18} /> Démarrer une séance
      </Button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/seance')}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl border border-accent-line bg-accent-soft p-3 text-left transition-colors hover:brightness-105',
      )}
    >
      <span className="pulse-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-solid text-accent-contrast">
        <Play size={15} fill="currentColor" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold">Séance en cours</span>
        <span className="tabular block text-[11px] text-muted">
          {formatDuration(elapsed)} · {doneSets} série{doneSets > 1 ? 's' : ''} validée{doneSets > 1 ? 's' : ''}
        </span>
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Shell                                                              */
/* ------------------------------------------------------------------ */

export function AppShell() {
  const toasts = useStore((s) => s.toasts)
  const location = useLocation()
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const activeWorkout = useStore(selectActiveWorkout)
  const bottomStackRef = useRef<HTMLDivElement>(null)

  // remonte en haut à chaque navigation
  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 })
  }, [location.pathname, scrollEl])

  const navItems = useMemo(() => NAV, [])

  const onWorkoutScreen = location.pathname === '/seance'
  const showNav = !(activeWorkout && onWorkoutScreen)
  const showActivePill = Boolean(activeWorkout) && !onWorkoutScreen

  // Publie la hauteur réelle de la barre inférieure mobile dans `--bottom-stack`
  // afin que le contenu, le chrono de repos et les boutons d'action fixes
  // s'empilent sans jamais se recouvrir.
  useEffect(() => {
    const root = document.documentElement
    const el = bottomStackRef.current
    if (!el) {
      root.style.setProperty('--bottom-stack', '0px')
      return
    }
    const update = () => {
      // sur desktop la barre est masquée (`lg:hidden`) → hauteur 0
      root.style.setProperty('--bottom-stack', `${Math.round(el.getBoundingClientRect().height)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      root.style.removeProperty('--bottom-stack')
    }
  }, [showNav, showActivePill])

  return (
    <ScrollTargetProvider value={scrollEl}>
      <div className="min-h-dvh">
        {/* ------------------------------- Sidebar desktop */}
        <aside className="fixed top-0 left-0 z-30 hidden h-dvh w-64 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
          <div className="mb-6 flex items-center gap-2.5 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Logo size={22} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">VeryHevy</span>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
                  )
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex flex-col gap-2">
            <ActiveWorkoutPill />
          </div>

          <div className="mt-auto flex flex-col gap-1">
            <NavLink
              to="/calendrier"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <CalendarDays size={18} />
              Calendrier
            </NavLink>
            <NavLink
              to="/reglages"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              <SettingsIcon size={18} />
              Réglages
            </NavLink>
          </div>
        </aside>

        {/* ------------------------------- Contenu */}
        <main
          ref={setScrollEl}
          className="app-main h-dvh overflow-y-auto overscroll-contain lg:ml-64"
        >
          <Outlet />
        </main>

        {/* ------------------------------- Barre inférieure mobile
            Une seule pile fixe : le bandeau « séance en cours » vient
            s'empiler AU-DESSUS de la navigation, jamais par-dessus. */}
        {showNav && (
          <div
            ref={bottomStackRef}
            className="glass safe-b fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-line lg:hidden"
          >
            {showActivePill && (
              <div className="border-b border-line px-3 py-2">
                <ActiveWorkoutPill />
              </div>
            )}
            <nav>
              <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
                {[...navItems, { to: '/reglages', label: 'Réglages', icon: SettingsIcon }].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold transition-colors',
                        isActive ? 'text-accent' : 'text-muted',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </nav>
          </div>
        )}

        <RestTimerBar />
        <Toaster toasts={toasts} />
      </div>
    </ScrollTargetProvider>
  )
}