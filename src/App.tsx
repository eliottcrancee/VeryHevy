import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/lib/auth'
import { getMyProfile } from '@/lib/social'
import { useHydrated } from '@/store/store'
import { useThemeEffect } from '@/hooks/app'
import HomePage from '@/pages/Home'
import ExplorerPage from '@/pages/Explorer'
import WelcomePage from '@/pages/Welcome'
import ActiveWorkoutPage from '@/pages/ActiveWorkout'
import RoutinesPage from '@/pages/Routines'
import RoutineEditorPage from '@/pages/RoutineEditor'
import ExercisesPage from '@/pages/Exercises'
import ExerciseDetailPage from '@/pages/ExerciseDetail'
import HistoryPage from '@/pages/History'
import WorkoutReportPage from '@/pages/WorkoutReport'
import StatsPage from '@/pages/Stats'
import CalendarPage from '@/pages/Calendar'
import SettingsPage from '@/pages/Settings'
import LoginPage from '@/pages/Login'
import ProfilePage from '@/pages/Profile'
import NotificationsPage from '@/pages/Notifications'

/** Garde : si le cloud est configuré, les pages privées exigent un compte Google. */
function RequireAuth() {
  const { cloudEnabled, user, loading } = useAuth()
  if (!cloudEnabled) return <Outlet />
  if (loading) {
    return (
      <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-4">
        <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Logo size={38} />
        </span>
        <p className="text-sm font-semibold text-muted">Vérification du compte…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

/**
 * Onboarding : pseudo obligatoire. Si connecté + cloud + pas de username
 * → /bienvenue. En mode local (cloud désactivé), on laisse passer.
 */
function RequireUsername() {
  const { cloudEnabled, user, loading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [hasUsername, setHasUsername] = useState(true)

  useEffect(() => {
    if (!cloudEnabled || loading || !user) {
      setChecking(false)
      return
    }
    let alive = true
    setChecking(true)
    getMyProfile()
      .then((p) => { if (alive) { setHasUsername(Boolean(p?.username)); setChecking(false) } })
      .catch(() => { if (alive) setChecking(false) })
    return () => { alive = false }
  }, [cloudEnabled, user, loading])

  if (!cloudEnabled || !user) return <Outlet />
  if (loading || checking) {
    return (
      <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-4">
        <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Logo size={38} />
        </span>
        <p className="text-sm font-semibold text-muted">Chargement du profil…</p>
      </div>
    )
  }
  if (!hasUsername) return <Navigate to="/bienvenue" replace />
  return <Outlet />
}

export default function App() {
  useThemeEffect()
  const hydrated = useHydrated()

  if (!hydrated) {
    return (
      <div className="grid-bg flex min-h-dvh flex-col items-center justify-center gap-4">
        <span className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Logo size={38} />
        </span>
        <p className="text-sm font-semibold text-muted">Chargement du carnet…</p>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="bienvenue" element={<WelcomePage />} />
        <Route element={<RequireUsername />}>
          <Route element={<AppShell />}>
            {/* 4 onglets principaux */}
            <Route index element={<HomePage />} />
            <Route path="explorer" element={<ExplorerPage />} />
            <Route path="programmes" element={<RoutinesPage />} />
            <Route path="profil" element={<ProfilePage />} />
            <Route path="profil/:username" element={<ProfilePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            {/* Routes techniques (cachées de la nav) */}
            <Route path="seance" element={<ActiveWorkoutPage />} />
            <Route path="programmes/:id" element={<RoutineEditorPage />} />
            <Route path="exercices" element={<ExercisesPage />} />
            <Route path="exercices/:id" element={<ExerciseDetailPage />} />
            <Route path="historique" element={<HistoryPage />} />
            <Route path="historique/:id" element={<WorkoutReportPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="calendrier" element={<CalendarPage />} />
            <Route path="reglages" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
