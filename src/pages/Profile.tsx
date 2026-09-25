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
  blockUser,
  fetchProfileByUsername,
  followStatus,
  getMyProfile,
  isBlockedByMe,
  isUsernameAvailable,
  listFollowers,
  listFollowing,
  removeFollower,
  requestFollow,
  unblockUser,
  unfollowUser,
  updateMyProfile,
  type FollowState,
} from '@/lib/social'
import { cancelFollowRequest } from '@/lib/notifications'
import { listMyPosts, listUserPosts } from '@/lib/posts'
import { PostCard } from '@/components/PostCard'
import type { Post, PostVisibility, SocialProfile } from '@/types'
import { normalizeUsername } from '@/types'
import { formatDuration, formatVolume } from '@/lib/utils'
import { Page, PageHeader } from '@/components/PageHeader'
import {
  Button,
  Card,
  ConfirmDialog,
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
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [followList, setFollowList] = useState<{ tab: 'followers' | 'following'; userId: string; title: string } | null>(null)
  const [myPosts, setMyPosts] = useState<Post[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [userPosts, setUserPosts] = useState<Post[]>([])
  const [loadingUserPosts, setLoadingUserPosts] = useState(false)

  const isPublicView = Boolean(routeUsername)

  const refreshUserPosts = useCallback(async (uid: string) => {
    if (!cloudEnabled) return
    setLoadingUserPosts(true)
    try {
      setUserPosts(await listUserPosts(uid, 20, 0))
    } catch {
      setUserPosts([])
    } finally {
      setLoadingUserPosts(false)
    }
  }, [cloudEnabled])

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
          if (p) void refreshUserPosts(p.id)
          if (p && user && p.id !== user.id) {
            try {
              const [st, bl] = await Promise.all([followStatus(p.id), isBlockedByMe(p.id)])
              setFollowing(st)
              setBlockedByMe(bl)
            } catch {
              setFollowing('none')
              setBlockedByMe(false)
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
  }, [routeUsername, cloudEnabled, user, refreshMine, refreshUserPosts])

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

    const doBlock = async () => {
      if (!p) return
      setFollowBusy(true)
      try {
        await blockUser(p.id)
        setBlockedByMe(true)
        setFollowing('none')
        notify(`@${p.username} bloqué : il ne te voit plus`, 'success')
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Blocage impossible', 'error')
      } finally {
        setFollowBusy(false)
        setConfirmBlock(false)
      }
    }

    const doUnblock = async () => {
      if (!p) return
      setFollowBusy(true)
      try {
        await unblockUser(p.id)
        setBlockedByMe(false)
        notify(`@${p.username} débloqué`, 'success')
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Déblocage impossible', 'error')
      } finally {
        setFollowBusy(false)
      }
    }
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
                    {/* Cadenas : profil privé ET inaccessible (non suivi). Ni pour
                        moi, ni une fois ami (demande acceptée). */}
                    {p.visibility === 'private' && following !== 'following' && p.id !== user?.id && (
                      <span className="ml-1.5 text-sm" title="Compte privé">🔒</span>
                    )}
                  </p>
                  {p.display_name && <p className="truncate text-sm text-muted">@{p.username}</p>}
                  {p.bio && <p className="mt-1 text-sm">{p.bio}</p>}
                  {p.city && <p className="mt-0.5 text-xs text-muted">📍 {p.city}</p>}
                  <p className="mt-1.5 text-xs font-semibold text-muted">
                    {p.followers_count}{' '}
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => setFollowList({ tab: 'followers', userId: p.id, title: `Abonnés de @${p.username}` })}
                    >
                      abonné{p.followers_count > 1 ? 's' : ''}
                    </button>
                    {' · '}{p.following_count}{' '}
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => setFollowList({ tab: 'following', userId: p.id, title: `Abonnements de @${p.username}` })}
                    >
                      abonnement{p.following_count > 1 ? 's' : ''}
                    </button>
                  </p>
                </div>
              </Card>
              {user && p.id !== user.id && (
                blockedByMe ? (
                  <Card className="border-danger/40 bg-danger/10 p-3 text-center">
                    <p className="text-sm font-bold">Profil bloqué 🚫</p>
                    <p className="mt-0.5 text-xs text-muted">
                      @{p.username} ne te voit plus. Tu le vois encore pour pouvoir le débloquer.
                    </p>
                    <div className="mt-2.5">
                      <Button size="sm" disabled={followBusy} onClick={() => void doUnblock()}>
                        Débloquer
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <>
                    <Button
                      variant={following === 'none' ? 'primary' : 'secondary'}
                      block
                      disabled={followBusy}
                      onClick={() => void toggleFollow()}
                    >
                      {following === 'following' ? <UserMinus size={16} /> : <UserPlus size={16} />}
                      {following === 'following' ? 'Ne plus suivre' : following === 'requested' ? 'Demandé — annuler' : p.visibility === 'private' ? 'Demander à suivre 🔒' : 'Suivre'}
                    </Button>
                    <button
                      type="button"
                      disabled={followBusy}
                      onClick={() => setConfirmBlock(true)}
                      className="mx-auto block text-xs font-semibold text-danger/80 underline decoration-dotted underline-offset-2"
                    >
                      Bloquer ce profil
                    </button>
                  </>
                )
              )}
              <PublicMiniStats posts={userPosts} />
              {loadingUserPosts ? (
                <p className="py-4 text-center text-sm text-muted">Chargement des séances…</p>
              ) : userPosts.length === 0 ? (
                <Card>
                  <EmptyState
                    title="Aucune séance visible"
                    message={
                      following === 'following' || user?.id === p.id
                        ? `@${p.username} n'a pas encore publié de séance.`
                        : `Suis @${p.username} pour voir ses séances réservées aux abonnés.`
                    }
                  />
                </Card>
              ) : (
                <div className="space-y-3">
                  {userPosts.map((post) => (
                    <PostCard key={post.id} post={post} onChanged={() => void refreshUserPosts(p.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </Page>
        <FollowListModal
          info={followList}
          onClose={() => {
            setFollowList(null)
            if (publicProfile?.username) {
              fetchProfileByUsername(publicProfile.username)
                .then((fresh) => setPublicProfile(fresh))
                .catch(() => {})
            }
          }}
        />
        <ConfirmDialog
          open={confirmBlock}
          title={`Bloquer @${publicProfile?.username} ?`}
          message={
            <>
              Ce profil ne te verra plus : ni ton profil, ni tes posts, ni tes séances,
              ni ta présence dans ses listes. Il ne pourra plus te suivre.
              <br />
              Toi, tu continueras de le voir pour pouvoir le débloquer (Réglages → Comptes bloqués).
            </>
          }
          confirmLabel="Bloquer"
          danger
          onCancel={() => setConfirmBlock(false)}
          onConfirm={() => void doBlock()}
        />
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
              {cloudEnabled && myProfile && user && (
                <>
                  {' · '}{myProfile.followers_count}{' '}
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => user && setFollowList({ tab: 'followers', userId: user.id, title: 'Mes abonnés' })}
                  >
                    abonné{myProfile.followers_count > 1 ? 's' : ''}
                  </button>
                  {' · '}{myProfile.following_count}{' '}
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => user && setFollowList({ tab: 'following', userId: user.id, title: 'Mes abonnements' })}
                  >
                    abonnement{myProfile.following_count > 1 ? 's' : ''}
                  </button>
                </>
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

      <FollowListModal
        info={followList}
        onClose={() => {
          setFollowList(null)
          void refreshMine()
        }}
      />

    </div>
  )
}

/* ------------------------- listes abonnés/abonnements ------------------------- */

/** Quelques chiffres d'après ses posts visibles (snapshots). */
function PublicMiniStats({ posts }: { posts: Post[] }) {
  const snaps = posts.map((p) => p.workout_snapshot).filter((s): s is NonNullable<typeof s> => Boolean(s))
  if (snaps.length === 0) return null
  const sets = snaps.reduce((n, s) => n + s.sets, 0)
  const volume = snaps.reduce((n, s) => n + s.volume, 0)
  const seconds = snaps.reduce((n, s) => n + s.seconds, 0)
  const cells: { value: string; label: string }[] = [
    { value: String(posts.length), label: 'Séances' },
    { value: String(sets), label: 'Séries' },
    { value: formatVolume(volume, 'kg'), label: 'Volume' },
    { value: formatDuration(seconds, 'compact'), label: 'Temps' },
  ]
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl bg-surface-2 px-1 py-2 text-center">
            <p className="tabular truncate text-sm font-extrabold">{c.value}</p>
            <p className="text-[10px] font-semibold text-muted uppercase">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-center text-[10px] text-muted">D'après ses {posts.length} post(s) visible(s)</p>
    </div>
  )
}export interface FollowListInfo {
  tab: 'followers' | 'following'
  userId: string
  title: string
}

function FollowListModal({ info, onClose }: { info: FollowListInfo | null; onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const notify = useStore((s) => s.notify)
  const [tab, setTab] = useState<'followers' | 'following'>(info?.tab ?? 'followers')
  const [lists, setLists] = useState<Partial<Record<'followers' | 'following', SocialProfile[]>>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (info) {
      setTab(info.tab)
      setLists({})
    }
  }, [info])

  useEffect(() => {
    if (!info) return
    if (lists[tab] !== undefined) return
    setLoading(true)
    const fn = tab === 'followers' ? listFollowers(info.userId) : listFollowing(info.userId)
    fn.then((l) => setLists((prev) => ({ ...prev, [tab]: l })))
      .catch((err) => notify(err instanceof Error ? err.message : 'Liste illisible', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, tab])

  if (!info) return null

  const mine = user?.id === info.userId
  const rows = lists[tab] ?? []

  const go = (p: SocialProfile) => {
    if (!p.username) return
    onClose()
    navigate(p.id === user?.id ? '/profil' : `/profil/${p.username}`)
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      await unfollowUser(id)
      setLists((prev) => ({ ...prev, following: (prev.following ?? []).filter((p) => p.id !== id) }))
      notify('Abonnement retiré', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const kick = async (id: string) => {
    setBusyId(id)
    try {
      await removeFollower(id)
      setLists((prev) => ({ ...prev, followers: (prev.followers ?? []).filter((p) => p.id !== id) }))
      notify('Abonné retiré : il ne te suit plus', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={info.title}>
      <Tabs<'followers' | 'following'>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'followers', label: 'Abonnés' },
          { value: 'following', label: 'Abonnements' },
        ]}
      />
      <div className="mt-3 space-y-1.5">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {tab === 'followers' ? 'Aucun abonné pour l’instant.' : 'Aucun abonnement pour l’instant.'}
          </p>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
              <button type="button" onClick={() => go(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar url={p.avatar_url} name={p.display_name ?? p.username ?? '?'} size={40} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">@{p.username ?? '?'}</span>
                  {p.display_name && <span className="block truncate text-xs text-muted">{p.display_name}</span>}
                </span>
              </button>
              {mine && tab === 'following' && (
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => void remove(p.id)}>
                  <UserMinus size={14} /> Retirer
                </Button>
              )}
              {mine && tab === 'followers' && (
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => void kick(p.id)}>
                  <UserMinus size={14} /> Retirer
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </Modal>
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
