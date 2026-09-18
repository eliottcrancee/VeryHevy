import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { Logo } from '@/components/Logo'
import { useHydrated } from '@/store/store'
import { useThemeEffect } from '@/hooks/app'
import HomePage from '@/pages/Home'
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
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="seance" element={<ActiveWorkoutPage />} />
        <Route path="programmes" element={<RoutinesPage />} />
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
    </Routes>
  )
}