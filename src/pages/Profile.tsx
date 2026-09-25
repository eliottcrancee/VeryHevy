import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  CloudOff,
  History,
  LayoutGrid,
  LogOut,
  Pencil,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  UserPlus,
  UserMinus,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { deleteCloudData, syncCloudNow } from '@/lib/cloudSync'
import { useStore } from '@/store/store'
import {
  amIFollowing,
  fetchProfileByUsername,
  followUser,
  getMyProfile,
  isUsernameAvailable,
  unfollowUser,
  updateMyProfile,
} from '@/lib/social'
import { listMyPosts } from '@/lib/posts'
import { PostCard } from '@/components/PostCard'
import type { Post, PostVisibility, SocialProfile } from '@/types'
import { normalizeUsername } from '@/types'
import { Page, PageHeader } from '@/components/PageHeader'
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  SectionTitle,
  Select,
  Stat,
  Tabs,
  Textarea,
} from '@/components/ui'
import { IconButton } from '@/components/ui'
import { completedWorkouts, workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { formatDuration, kgToDisplay } from '@/lib/utils'
import HistoryPage from '@/pages/History'
import StatsPage from '@/pages/Stats'
import CalendarPage from '@/pages/Calendar'

type Tab = 'posts' | 'historique' | 'stats' | 'calendrier'

function Avatar({ url, name, size = 64 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-2xl bg-accent-soft font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function ProfilePage() {
  const { username: routeUsername } = useParams()
  const { user, signOut, cloudEnabled } = useAuth()
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const routines = useStore((s) => s.routines)
  const exercises = useStore((s) => s.exercises)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<Tab>('posts')
  const [myProfile, setMyProfile] = useState<SocialProfile | null>(null)
  const [publicProfile, setPublicProfile] = useState<SocialProfile | null | undefined>(undefined)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [following, setFollowing] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [myPosts, setMyPosts] = useState<Post[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)

  const isPublicView = Boolean(routeUsername)

  const refreshMine = useCallback(async () => {
    if (!cloudEnabled || !user) {
      setLoadingProfile(false)
      return
    }
    try {
      setMyProfile(await getMyProfile())
    } catch {
      setMyProfile(null)
    } finally {
      setLoadingProfile(false)
    }
  }, [cloudEnabled, user])

  useEffect(() => {
    setLoadingProfile(true)
    setPublicProfile(undefined)
    if (routeUsername) {
      if (!cloudEnabled) {
        setLoadingProfile(false)
        return
      }
      fetchProfileByUsername(routeUsername)
        .then(async (p) => {
          setPublicProfile(p)
          if (p && user && p.id !== user.id) {
            try {
              setFollowing(await amIFollowing(p.id))
            } catch {
              setFollowing(false)
            }
          }
          setLoadingProfile(false)
        })
        .catch(() => {
          setPublicProfile(null)
          setLoadingProfile(false)
        })
      void refreshMine()
    } else {
      void refreshMine()
    }
  }, [routeUsername, cloudEnabled, user, refreshMine])

  const done = completedWorkouts(workouts)
  const totalSets = done.reduce((n, w) => n + workoutSets(w), 0)
  const totalVolume = done.reduce((n, w) => n + workoutVolume(w), 0)
  const totalTime = done.reduce((n, w) => n + workoutDurationSeconds(w), 0)

  const refreshPosts = useCallback(async () => {
    if (!cloudEnabled || !user) return
    setLoadingPosts(true)
    try {
      setMyPosts(await listMyPosts(20, 0))
    } catch {
      setMyPosts([])
    } finally {
      setLoadingPosts(false)
    }
  }, [cloudEnabled, user])

  useEffect(() => {
    if (tab === 'posts' && !isPublicView) void refreshPosts()
  }, [tab, isPublicView, refreshPosts])

  const meta = user?.user_metadata ?? {}
  const displayName =
    myProfile?.display_name ??
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    'Sportif'
  const avatar =
    myProfile?.avatar_url ??
    (meta.avatar_url as string | undefined) ??
    (meta.picture as string | undefined)
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

  const toggleFollow = async () => {
    if (!publicProfile) return
    setFollowBusy(true)
    try {
      if (following) {
        await unfollowUser(publicProfile.id)
        setFollowing(false)
      } else {
        await followUser(publicProfile.id)
        setFollowing(true)
        notify(`Tu suis @${publicProfile.username} 🎉`, 'success')
      }
      const fresh = await fetchProfileByUsername(publicProfile.username ?? '')
      setPublicProfile(fresh)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setFollowBusy(false)
    }
  }

  /* ------------------------- vue profil public ------------------------- */
  if (isPublicView) {
    const p = publicProfile
    return (
      <div>
        <PageHeader title={p ? `@${p.username}` : 'Profil'} back subtitle="Profil public" />
        <Page className="max-w-3xl space-y-4 pb-10">
          {loadingProfile || p === undefined ? (
            <p className="text-sm text-muted">Chargement…</p>
          ) : p === null ? (
            <Card>
              <EmptyState title="Pseudo introuvable" message="Ce profil n'existe pas ou a été supprimé." />
            </Card>
          ) : (
            <>
              <Card className="flex items-center gap-4 p-4">
                <Avatar url={p.avatar_url} name={p.display_name ?? p.username ?? '?'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold">{p.display_name ?? `@${p.username}`}</p>
                  <p className="truncate text-sm text-muted">@{p.username}</p>
                  {p.bio && <p className="mt-1 text-sm">{p.bio}</p>}
                  {p.city && <p className="mt-0.5 text-xs text-muted">📍 {p.city}</p>}
                  <p className="mt-1.5 text-xs font-semibold text-muted">
                    {p.followers_count} abonné{p.followers_count > 1 ? 's' : ''} · {p.following_count} abonnement{p.following_count > 1 ? 's' : ''}
                  </p>
                </div>
              </Card>
              {user && p.id !== user.id && (
                <Button variant={following ? 'secondary' : 'primary'} block disabled={followBusy} onClick={() => void toggleFollow()}>
                  {following ? <UserMinus size={16} /> : <UserPlus size={16} />}
                  {following ? 'Ne plus suivre' : 'Suivre'}
                </Button>
              )}
              <Card>
                <EmptyState
                  title="Ses séances partagées arrivent ici"
                  message="Les posts (Étape C) afficheront ses séances publiques ou followers."
                />
              </Card>
            </>
          )}
        </Page>
      </div>
    )
  }

  /* ------------------------------ mon profil ------------------------------ */
  return (
    <div>
      <PageHeader
        title={myProfile?.username ? `@${myProfile.username}` : 'Profil'}
        subtitle={cloudEnabled ? displayName : 'Compte local'}
        actions={
          <>
            <IconButton label="Réglages" onClick={() => navigate('/reglages')}>
              <SettingsIcon size={20} />
            </IconButton>
            {cloudEnabled && user && (
              <IconButton label="Se déconnecter" onClick={() => setConfirmLogout(true)}>
                <LogOut size={20} />
              </IconButton>
            )}
          </>
        }
      />
      <Page className="max-w-3xl space-y-4 pb-10">
        <Card className="flex items-center gap-4 p-4">
          <Avatar url={avatar} name={displayName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">{displayName}</p>
            {myProfile?.username && <p className="truncate text-sm text-accent">@{myProfile.username}</p>}
            <p className="truncate text-xs text-muted">{user?.email ?? 'Mode local — aucun compte'}</p>
            {myProfile?.bio && <p className="mt-1 text-sm">{myProfile.bio}</p>}
            {myProfile?.city && <p className="mt-0.5 text-xs text-muted">📍 {myProfile.city}</p>}
            {cloudEnabled && myProfile && (
              <p className="mt-1.5 text-xs font-semibold text-muted">
                {myProfile.followers_count} abonné{myProfile.followers_count > 1 ? 's' : ''} ·{' '}
                {myProfile.following_count} abonnement{myProfile.following_count > 1 ? 's' : ''}
              </p>
            )}
            <p className="mt-1 text-[11px] text-muted">
              {cloudEnabled ? (
                <>Synchro : {lastSync}{settings.lastSyncError ? ` · ⚠ ${settings.lastSyncError}` : ''}</>
              ) : (
                <span className="inline-flex items-center gap-1"><CloudOff size={12} /> 100 % local</span>
              )}
            </p>
          </div>
        </Card>

        {cloudEnabled && user && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setEditOpen(true)}>
              <Pencil size={14} /> Modifier le profil
            </Button>
            <Button size="sm" disabled={syncing} onClick={() => void runSync()}>
              {syncing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Synchroniser
            </Button>
            <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> Données cloud
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Séances" value={done.length} />
          <Stat label="Séries" value={totalSets} />
          <Stat label="Volume" value={Math.round(kgToDisplay(totalVolume, settings.unit)).toLocaleString('fr-FR')} sub={settings.unit} />
          <Stat label="Temps" value={formatDuration(totalTime, 'compact')} />
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'posts', label: 'Séances', icon: <LayoutGrid size={14} /> },
            { value: 'historique', label: 'Historique', icon: <History size={14} /> },
            { value: 'stats', label: 'Stats', icon: <BarChart3 size={14} /> },
            { value: 'calendrier', label: 'Calendrier', icon: <CalendarDays size={14} /> },
          ]}
        />

        {tab === 'posts' && (
          !cloudEnabled ? (
            <Card>
              <EmptyState
                title="Tes posts apparaîtront ici"
                message="Connecte-toi avec Google pour publier tes séances dans le feed."
              />
            </Card>
          ) : loadingPosts ? (
            <p className="py-4 text-center text-sm text-muted">Chargement…</p>
          ) : myPosts.length === 0 ? (
            <Card>
              <EmptyState
                title="Aucun post pour l'instant"
                message="Termine une séance puis publie-la depuis son rapport (icône mégaphone 📣)."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {myPosts.map((p) => (
                <PostCard key={p.id} post={p} onChanged={() => void refreshPosts()} />
              ))}
            </div>
          )
        )}
        {tab === 'historique' && <HistoryPage />}
        {tab === 'stats' && <StatsPage />}
        {tab === 'calendrier' && <CalendarPage />}

        <Card className="space-y-2 p-4">
          <SectionTitle className="mb-0">Compte</SectionTitle>
          <p className="text-sm text-muted">
            {routines.length} programme(s) · {exercises.length} exercice(s) sur cet appareil.
            La déconnexion garde vos données locales.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/reglages">
              <Button size="sm"><SettingsIcon size={14} /> Réglages</Button>
            </Link>
            <Link to="/explorer">
              <Button size="sm" variant="primary">Explorer la carte</Button>
            </Link>
          </div>
        </Card>
      </Page>

      <EditProfileModal
        open={editOpen}
        initial={myProfile}
        defaultVisibility={settings.defaultPostVisibility}
        onClose={() => setEditOpen(false)}
        onSaved={(p, vis) => {
          setMyProfile(p)
          if (vis) updateSettings({ defaultPostVisibility: vis })
          setEditOpen(false)
        }}
      />

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

/* ------------------------- modale édition profil ------------------------- */

function EditProfileModal({
  open,
  initial,
  defaultVisibility,
  onClose,
  onSaved,
}: {
  open: boolean
  initial: SocialProfile | null
  defaultVisibility: PostVisibility
  onClose: () => void
  onSaved: (p: SocialProfile, vis: PostVisibility | null) => void
}) {
  const notify = useStore((s) => s.notify)
  const [username, setUsername] = useState(initial?.username ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [visibility, setVisibility] = useState<PostVisibility>(defaultVisibility)
  const [checking, setChecking] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setUsername(initial?.username ?? '')
      setBio(initial?.bio ?? '')
      setCity(initial?.city ?? '')
      setVisibility(defaultVisibility)
      setHint(null)
    }
  }, [open, initial, defaultVisibility])

  if (!open) return null

  const clean = normalizeUsername(username)
  const usernameChanged = clean !== (initial?.username ?? '')
  const valid = /^[a-z0-9_.]{3,20}$/.test(clean)

  const check = async () => {
    if (!valid) {
      setHint('3-20 caractères : minuscules, chiffres, . ou _')
      return
    }
    if (!usernameChanged) {
      setHint('C’est déjà ton pseudo ✔')
      return
    }
    setChecking(true)
    try {
      setHint((await isUsernameAvailable(clean)) ? `@${clean} disponible 🎉` : `@${clean} déjà pris`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Vérification impossible', 'error')
    } finally {
      setChecking(false)
    }
  }

  const save = async () => {
    if (!valid) return
    setSaving(true)
    try {
      const p = await updateMyProfile({ username: clean, bio, city, visibility })
      notify(usernameChanged ? `Pseudo → @${clean} 🎉` : 'Profil mis à jour', 'success')
      onSaved(p, visibility)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Sauvegarde impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Modifier le profil">
      <div className="space-y-3">
        <Field label="Pseudo" hint="Unique, 3-20 caractères">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ton.pseudo" autoComplete="off" />
        </Field>
        <div>
          <Button size="sm" disabled={!valid || checking} onClick={() => void check()}>
            {checking ? 'Vérification…' : 'Vérifier la dispo'}
          </Button>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        <Field label="Bio" hint="160 caractères max">
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={160} placeholder="Objectifs, salle, devise…" />
        </Field>
        <Field label="Ville">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lyon" autoComplete="off" />
        </Field>
        <Field label="Visibilité par défaut des posts">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as PostVisibility)}>
            <option value="followers">Abonnés (recommandé)</option>
            <option value="public">Public</option>
            <option value="private">Privé</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={onClose}>Annuler</Button>
          <Button variant="primary" block disabled={!valid || saving} onClick={() => void save()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
