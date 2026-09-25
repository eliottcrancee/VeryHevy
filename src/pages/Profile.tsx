import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CloudOff, LogOut, RefreshCw, Trash2, Users } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { deleteCloudData, syncCloudNow } from '@/lib/cloudSync'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, ConfirmDialog, SectionTitle, Stat } from '@/components/ui'
import { completedWorkouts, workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { formatDuration, kgToDisplay } from '@/lib/utils'

export default function ProfilePage() {
  const { user, signOut, cloudEnabled } = useAuth()
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const routines = useStore((s) => s.routines)
  const exercises = useStore((s) => s.exercises)
  const settings = useStore((s) => s.settings)
  const notify = useStore((s) => s.notify)

  const [syncing, setSyncing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const done = completedWorkouts(workouts)
  const totalSets = done.reduce((n, w) => n + workoutSets(w), 0)
  const totalVolume = done.reduce((n, w) => n + workoutVolume(w), 0)
  const totalTime = done.reduce((n, w) => n + workoutDurationSeconds(w), 0)

  const meta = user?.user_metadata ?? {}
  const displayName = (meta.full_name as string | undefined) ?? (meta.name as string | undefined) ?? user?.email?.split('@')[0] ?? 'Sportif'
  const avatar = (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined)
  const lastSync = settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString('fr-FR') : 'jamais'

  const runSync = async () => {
    setSyncing(true)
    try {
      const res = await syncCloudNow()
      if (res.status === 'ok') notify(`Synchro OK : ${res.pushed ?? 0} envoyé(s), ${res.pulled ?? 0} reçu(s)`, 'success')
      else if (res.status === 'error') notify(res.error ?? 'Échec de synchro', 'error')
      else notify('Rien à synchroniser', 'info')
    } finally {
      setSyncing(false)
    }
  }

  const logout = async () => {
    await signOut()
    setConfirmLogout(false)
    navigate('/login', { replace: true })
  }

  const eraseCloud = async () => {
    try {
      await deleteCloudData()
      notify('Données cloud supprimées (cet appareil garde sa copie locale)', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error')
    } finally {
      setConfirmDelete(false)
    }
  }

  return (
    <div>
      <PageHeader title="Profil" subtitle={cloudEnabled ? 'Compte & synchronisation cloud' : 'Compte'} />
      <Page className="max-w-3xl space-y-6 pb-10">
        <Card className="flex items-center gap-4 p-4">
          {avatar ? (
            <img src={avatar} alt="" className="h-16 w-16 rounded-2xl object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-2xl font-extrabold text-accent">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">{displayName}</p>
            <p className="truncate text-sm text-muted">{user?.email ?? 'Mode local — aucun compte'}</p>
            <p className="mt-1 text-[11px] text-muted">
              {cloudEnabled ? (
                <>Dernière synchro cloud : {lastSync}{settings.lastSyncError ? ` · ⚠ ${settings.lastSyncError}` : ''}</>
              ) : (
                <span className="inline-flex items-center gap-1"><CloudOff size={12} /> Cloud non configuré — données 100 % locales</span>
              )}
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Séances" value={done.length} />
          <Stat label="Séries" value={totalSets} />
          <Stat label="Volume" value={Math.round(kgToDisplay(totalVolume, settings.unit)).toLocaleString('fr-FR')} sub={settings.unit} />
          <Stat label="Temps" value={formatDuration(totalTime, 'compact')} />
        </div>

        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">Compte</SectionTitle>
          <p className="text-sm text-muted">
            {routines.length} programme(s) · {exercises.length} exercice(s) sur cet appareil.
            La déconnexion garde vos données locales ; reconnectez-vous pour resynchroniser.
          </p>
          <div className="flex flex-wrap gap-2">
            {cloudEnabled && (
              <Button size="sm" variant="primary" disabled={syncing} onClick={runSync}>
                {syncing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Synchroniser maintenant
              </Button>
            )}
            {cloudEnabled && user && (
              <Button size="sm" onClick={() => setConfirmLogout(true)}>
                <LogOut size={14} /> Se déconnecter
              </Button>
            )}
            {cloudEnabled && user && (
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={14} /> Supprimer mes données cloud
              </Button>
            )}
          </div>
        </Card>

        {cloudEnabled && user && (
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Users size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Mes amis</p>
              <p className="truncate text-xs text-muted">Ajoutez des amis par email et voyez leurs séances.</p>
            </div>
            <Link to="/amis">
              <Button size="sm" variant="primary">Voir</Button>
            </Link>
          </Card>
        )}
      </Page>

      <ConfirmDialog
        open={confirmLogout}
        title="Se déconnecter ?"
        message="Vos données restent sur cet appareil. Reconnectez-vous pour resynchroniser."
        confirmLabel="Se déconnecter"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => void logout()}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer les données cloud ?"
        message="Vos séances, programmes et exercices stockés en ligne seront effacés. La copie locale de CET appareil est conservée."
        confirmLabel="Tout supprimer en ligne"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void eraseCloud()}
      />
    </div>
  )
}
