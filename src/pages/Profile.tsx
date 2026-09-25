import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BarChart3,
  History,
  LayoutGrid,
  Pencil,
  Settings as SettingsIcon,
  UserPlus,
  UserMinus,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import {
  fetchProfileByUsername,
  followStatus,
  getMyProfile,
  isUsernameAvailable,
  requestFollow,
  unfollowUser,
  updateMyProfile,
  type FollowState,
} from '@/lib/social'
import { cancelFollowRequest } from '@/lib/notifications'
import { listMyPosts } from '@/lib/posts'
import { PostCard } from '@/components/PostCard'
import type { Post, PostVisibility, SocialProfile } from '@/types'
import { normalizeUsername } from '@/types'
import { Page, PageHeader } from '@/components/PageHeader'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui'
import { IconButton } from '@/components/ui'
import { completedWorkouts } from '@/lib/calc'
import HistoryPage from '@/pages/History'
import StatsPage from '@/pages/Stats'

type Tab = 'posts' | 'historique' | 'stats'

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
  const { user, cloudEnabled } = useAuth()
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<Tab>('posts')
  const [myProfile, setMyProfile] = useState<SocialProfile | null>(null)
  const [publicProfile, setPublicProfile] = useState<SocialProfile | null | undefined>(undefined)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [following, setFollowing] = useState<FollowState>('none')
  const [followBusy, setFollowBusy] = useState(false)
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
              setFollowing(await followStatus(p.id))
            } catch {
              setFollowing('none')
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
  const toggleFollow = async () => {
    if (!publicProfile) return
    setFollowBusy(true)
    try {
      if (following === 'following') {
        await unfollowUser(publicProfile.id)
        setFollowing('none')
      } else if (following === 'requested') {
        await cancelFollowRequest(publicProfile.id)
        setFollowing('none')
        notify('Demande annulée', 'info')
      } else {
        const next = await requestFollow(publicProfile.id)
        setFollowing(next)
        notify(
          next === 'requested'
            ? `Demande envoyée à @${publicProfile.username} 🔒`
            : `Tu suis @${publicProfile.username} 🎉`,
          'success',
        )
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
                  <p className="truncate text-lg font-extrabold">
                    {p.display_name ?? `@${p.username}`}
                    {p.visibility === 'private' && <span className="ml-1.5 text-sm" title="Compte privé">🔒</span>}
                  </p>
                  {p.bio && <p className="mt-1 text-sm">{p.bio}</p>}
                  {p.city && <p className="mt-0.5 text-xs text-muted">📍 {p.city}</p>}
                  <p className="mt-1.5 text-xs font-semibold text-muted">
                    {p.followers_count} abonné{p.followers_count > 1 ? 's' : ''} · {p.following_count} abonnement{p.following_count > 1 ? 's' : ''}
                  </p>
                </div>
              </Card>
              {user && p.id !== user.id && (
                <Button
                  variant={following === 'none' ? 'primary' : 'secondary'}
                  block
                  disabled={followBusy}
                  onClick={() => void toggleFollow()}
                >
                  {following === 'following' ? <UserMinus size={16} /> : <UserPlus size={16} />}
                  {following === 'following' ? 'Ne plus suivre' : following === 'requested' ? 'Demandé — annuler' : p.visibility === 'private' ? 'Demander à suivre 🔒' : 'Suivre'}
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
        subtitle={myProfile?.city || (!cloudEnabled ? 'Compte local' : undefined)}
        actions={
          <IconButton label="Réglages" onClick={() => navigate('/reglages')}>
            <SettingsIcon size={20} />
          </IconButton>
        }
      />
      <Page className="max-w-3xl space-y-4 pb-10">
        <Card className="flex items-center gap-4 p-4">
          <Avatar url={avatar} name={displayName} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-lg font-extrabold">
              <span className="truncate">{displayName}</span>
              {myProfile?.visibility === 'private' && <span className="text-sm" title="Compte privé">🔒</span>}
              {cloudEnabled && user && (
                <button
                  type="button"
                  title="Modifier le profil"
                  aria-label="Modifier le profil"
                  onClick={() => setEditOpen(true)}
                  className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil size={15} />
                </button>
              )}
            </p>
            {myProfile?.bio && <p className="mt-1 text-sm">{myProfile.bio}</p>}
            {myProfile?.city && <p className="mt-0.5 text-xs text-muted">📍 {myProfile.city}</p>}
            <p className="mt-1.5 text-xs font-semibold text-muted">
              💪 {done.length} séance{done.length > 1 ? 's' : ''}
              {cloudEnabled && myProfile && (
                <> · {myProfile.followers_count} abonné{myProfile.followers_count > 1 ? 's' : ''} · {myProfile.following_count} abonnement{myProfile.following_count > 1 ? 's' : ''}</>
              )}
            </p>
          </div>
        </Card>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'posts', label: 'Séances', icon: <LayoutGrid size={14} /> },
            { value: 'historique', label: 'Historique', icon: <History size={14} /> },
            { value: 'stats', label: 'Stats', icon: <BarChart3 size={14} /> },
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
        {tab === 'historique' && <div className="-mx-4"><HistoryPage /></div>}
        {tab === 'stats' && <div className="-mx-4"><StatsPage /></div>}
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
  const [name, setName] = useState(initial?.display_name ?? '')
  const [bio, setBio] = useState(initial?.bio ?? '')
  const [city, setCity] = useState(initial?.city ?? '')
  const [account, setAccount] = useState<'public' | 'private'>(initial?.visibility === 'private' ? 'private' : 'public')
  const [postVis, setPostVis] = useState<PostVisibility>(defaultVisibility)
  const [checking, setChecking] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setUsername(initial?.username ?? '')
      setName(initial?.display_name ?? '')
      setBio(initial?.bio ?? '')
      setCity(initial?.city ?? '')
      setAccount(initial?.visibility === 'private' ? 'private' : 'public')
      setPostVis(defaultVisibility)
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
      const p = await updateMyProfile({
        username: clean,
        display_name: name.trim() ? name.trim() : null,
        bio,
        city,
        visibility: account,
      })
      notify(usernameChanged ? `Pseudo → @${clean} 🎉` : 'Profil mis à jour', 'success')
      onSaved(p, postVis)
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
        <Field label="Nom affiché" hint="Ton prénom ou surnom, 60 caractères max">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Léa" autoComplete="off" maxLength={60} />
        </Field>
        <Field label="Bio" hint="160 caractères max">
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={160} placeholder="Objectifs, salle, devise…" />
        </Field>
        <Field label="Ville">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lyon" autoComplete="off" />
        </Field>
        <Field label="Compte" hint="Privé : chaque nouvel abonné devra être accepté">
          <Select value={account} onChange={(e) => setAccount(e.target.value as 'public' | 'private')}>
            <option value="public">Public — suivi direct</option>
            <option value="private">Privé 🔒 — sur demande</option>
          </Select>
        </Field>
        <Field label="Visibilité par défaut des posts">
          <Select value={postVis} onChange={(e) => setPostVis(e.target.value as PostVisibility)}>
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
