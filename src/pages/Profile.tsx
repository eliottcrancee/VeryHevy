import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Ban,
  BarChart3,
  Flag,
  History,
  LayoutGrid,
  MoreVertical,
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
  isBlockedByMe,
  isUsernameAvailable,
  listFollowers,
  listFollowing,
  listMyFollowIds,
  removeFollower,
  requestFollow,
  unblockUser,
  unfollowUser,
  updateMyProfile,
  uploadAvatar,
  type FollowState,
} from '@/lib/social'
import { cancelFollowRequest } from '@/lib/notifications'
import { listMyPosts, listUserPosts, listUserWorkouts } from '@/lib/posts'
import { loadMyPosts, loadMyProfile, peekMyPosts, peekMyProfile } from '@/lib/pagePreload'
import { PostCard } from '@/components/PostCard'
import { ReportDialog } from '@/components/ReportDialog'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import type { Post, PostVisibility, SocialProfile } from '@/types'
import { normalizeUsername } from '@/types'
import { formatDuration, formatDate, formatVolume, RANGE_LABEL_KEYS, rangeSince, type RangeFilter } from '@/lib/utils'
import { t, useLang } from '@/lib/i18n'
import { Page, PageHeader } from '@/components/PageHeader'
import { ChartTooltipContent, chartCursor, chartTooltipWrapper } from '@/components/charts'
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Menu,
  Modal,
  SectionTitle,
  Select,
  Tabs,
  Textarea,
} from '@/components/ui'
import { IconButton } from '@/components/ui'
import { completedWorkouts, weeklySeries, workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import type { Workout } from '@/types'
import HistoryPage from '@/pages/History'
import StatsPage from '@/pages/Stats'

type Tab = 'posts' | 'historique' | 'stats'

function Avatar({ url, name, size = 64 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function ProfilePage() {
  const { username: routeUsername } = useParams()
  const { user, cloudEnabled } = useAuth()
  useLang()
  const userId = user?.id
  const navigate = useNavigate()
  const workouts = useStore((s) => s.workouts)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<Tab>('posts')
  const [myProfile, setMyProfile] = useState<SocialProfile | null>(() => userId ? (peekMyProfile(userId) ?? null) : null)
  const [publicProfile, setPublicProfile] = useState<SocialProfile | null | undefined>(undefined)
  const [loadingProfile, setLoadingProfile] = useState(() => Boolean(routeUsername) || !userId || peekMyProfile(userId) === undefined)
  const [following, setFollowing] = useState<FollowState>('none')
  const [blockedByMe, setBlockedByMe] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [followBusy, setFollowBusy] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [followList, setFollowList] = useState<{ tab: 'followers' | 'following'; userId: string; title: string } | null>(null)
  const [myPosts, setMyPosts] = useState<Post[]>(() => userId ? (peekMyPosts(userId) ?? []) : [])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [myPostsMore, setMyPostsMore] = useState(false)
  const [myPostsError, setMyPostsError] = useState<string | null>(null)
  const [userPosts, setUserPosts] = useState<Post[]>([])
  const [loadingUserPosts, setLoadingUserPosts] = useState(false)
  const [userPostsMore, setUserPostsMore] = useState(false)
  const [userPostsError, setUserPostsError] = useState<string | null>(null)
  /** Séances d'un profil suivi (accès abonné via RPC shared_workouts). */
  const [sharedWorkouts, setSharedWorkouts] = useState<Workout[] | null>(null)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedError, setSharedError] = useState<string | null>(null)
  /** Profil dont l'historique/les stats ont déjà été demandés (garde anti-boucle). */
  const sharedFetchedFor = useRef<string | null>(null)

  const isPublicView = Boolean(routeUsername)
  const trainingTab = tab === 'historique' || tab === 'stats'
  /** Onglets Historique/Stats : réservés à l'abonné (ou à soi-même). */
  const canSeeTraining = Boolean(publicProfile) && (publicProfile?.id === userId || following === 'following')

  const refreshUserPosts = useCallback(async (uid: string) => {
    if (!cloudEnabled) return
    setLoadingUserPosts(true)
    try {
      const page = await listUserPosts(uid, 20, 0)
      setUserPosts(page)
      setUserPostsMore(page.length === 20)
      setUserPostsError(null)
    } catch (err) {
      setUserPostsError(err instanceof Error ? err.message : t('profile.postsFailed'))
    } finally {
      setLoadingUserPosts(false)
    }
  }, [cloudEnabled])

  const refreshMine = useCallback(async () => {
    if (!cloudEnabled || !userId) {
      setLoadingProfile(false)
      return
    }
    try {
      setMyProfile(await loadMyProfile(userId, true))
    } catch {
      setMyProfile(null)
    } finally {
      setLoadingProfile(false)
    }
  }, [cloudEnabled, userId])

  useEffect(() => {
    setLoadingProfile(Boolean(routeUsername) || !userId || peekMyProfile(userId) === undefined)
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
          if (p && userId && p.id !== userId) {
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
  }, [routeUsername, cloudEnabled, userId, refreshMine, refreshUserPosts])

  const done = completedWorkouts(workouts)

  const refreshPosts = useCallback(async () => {
    if (!cloudEnabled || !userId) return
    if (!peekMyPosts(userId)) setLoadingPosts(true)
    try {
      const page = await loadMyPosts(userId, true)
      setMyPosts(page)
      setMyPostsMore(page.length === 20)
      setMyPostsError(null)
    } catch (err) {
      setMyPostsError(err instanceof Error ? err.message : t('profile.postsFailed'))
    } finally {
      setLoadingPosts(false)
    }
  }, [cloudEnabled, userId])

  const moreUserPosts = async (uid: string) => {
    setLoadingUserPosts(true)
    try {
      const page = await listUserPosts(uid, 20, userPosts.length)
      setUserPosts((old) => [...old, ...page])
      setUserPostsMore(page.length === 20)
    } catch (err) { setUserPostsError(err instanceof Error ? err.message : t('profile.loadFailed')) }
    finally { setLoadingUserPosts(false) }
  }
  const moreMyPosts = async () => {
    setLoadingPosts(true)
    try {
      const page = await listMyPosts(20, myPosts.length)
      setMyPosts((old) => [...old, ...page])
      setMyPostsMore(page.length === 20)
    } catch (err) { setMyPostsError(err instanceof Error ? err.message : t('profile.loadFailed')) }
    finally { setLoadingPosts(false) }
  }

  useEffect(() => {
    if (tab === 'posts' && !isPublicView) void refreshPosts()
  }, [tab, isPublicView, refreshPosts])

  /* Historique/Stats d'un profil public : lisibles par l'abonné
     (RPC shared_workouts) — reset au changement de profil. */
  useEffect(() => {
    setSharedWorkouts(null)
    setSharedError(null)
    setSharedLoading(false)
    sharedFetchedFor.current = null
  }, [routeUsername])

  useEffect(() => {
    if (!isPublicView || !publicProfile || !trainingTab || !canSeeTraining) return
    // Garde sur une réf (et non sur `sharedLoading`) : dépendre de l'état
    // annulait la requête en cours et laissait l'onglet bloqué sur
    // « Chargement… » sans jamais relancer le chargement.
    if (sharedFetchedFor.current === publicProfile.id) return
    sharedFetchedFor.current = publicProfile.id
    let alive = true
    setSharedLoading(true)
    setSharedError(null)
    listUserWorkouts(publicProfile.id)
      .then((list) => { if (alive) setSharedWorkouts(list.filter((w) => w.status === 'completed')) })
      .catch((err) => { if (alive) setSharedError(err instanceof Error ? err.message : t('profile.loadFailed')) })
      .finally(() => { if (alive) setSharedLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublicView, publicProfile, trainingTab, canSeeTraining])

  const meta = user?.user_metadata ?? {}
  const displayName =
    myProfile?.display_name ??
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    user?.email?.split('@')[0] ??
    t('lib.athlete')
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
        notify(t('profile.requestCancelled'), 'info')
      } else {
        const next = await requestFollow(publicProfile.id)
        setFollowing(next)
        const who = publicProfile.username ? `@${publicProfile.username}` : (publicProfile.display_name ?? t('profile.thisProfile'))
        notify(
          next === 'requested'
            ? t('profile.requestSent', { who })
            : t('profile.nowFollowing', { who }),
          'success',
        )
      }
      const fresh = await fetchProfileByUsername(publicProfile.username ?? '')
      setPublicProfile(fresh)
    } catch (err) {
      notify(err instanceof Error ? err.message : t('profile.actionFailed'), 'error')
    } finally {
      setFollowBusy(false)
    }
  }

  /* ------------------------- vue profil public ------------------------- */
  if (isPublicView) {
    const p = publicProfile
    const pname = p?.username ? `@${p.username}` : (p?.display_name ?? t('profile.thisProfile'))

    const doBlock = async () => {
      if (!p) return
      setFollowBusy(true)
      try {
        await blockUser(p.id)
        setBlockedByMe(true)
        setFollowing('none')
        notify(t('profile.blocked', { who: pname }), 'success')
      } catch (err) {
        notify(err instanceof Error ? err.message : t('profile.blockFailed'), 'error')
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
        notify(t('profile.unblocked', { who: pname }), 'success')
      } catch (err) {
        notify(err instanceof Error ? err.message : t('profile.unblockFailed'), 'error')
      } finally {
        setFollowBusy(false)
      }
    }
    return (
      <div>
        <PageHeader title={p ? `@${p.username}` : t('nav.profile')} back subtitle={t('profile.publicSubtitle')} />
        <Page className="max-w-3xl space-y-4 pb-10">
          {loadingProfile || p === undefined ? (
            <p className="text-sm text-muted">{t('common.loading')}</p>
          ) : p === null ? (
            <Card>
              <EmptyState title={t('profile.usernameNotFound')} message={t('profile.notFoundMessage')} />
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-4 py-2">
                <Avatar url={p.avatar_url} name={p.display_name ?? p.username ?? '?'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold">
                    {p.display_name ?? `@${p.username}`}
                    {/* Cadenas : profil privé ET inaccessible (non suivi). Ni pour
                        moi, ni une fois ami (demande acceptée). */}
                    {p.visibility === 'private' && following !== 'following' && p.id !== user?.id && (
                      <span className="ml-1.5 text-sm" title={t('profile.privateAccount')}>🔒</span>
                    )}
                  </p>
                  {p.display_name && <p className="truncate text-sm text-muted">@{p.username}</p>}
                  {p.bio && <p className="mt-1 text-sm">{p.bio}</p>}
                  {p.city && <p className="mt-0.5 text-xs text-muted">{p.city}</p>}
                  <p className="mt-1.5 text-xs font-semibold text-muted">
                    {p.followers_count}{' '}
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => setFollowList({ tab: 'followers', userId: p.id, title: t('profile.followersOf', { who: pname }) })}
                    >
                      {p.followers_count !== 1 ? t('profile.followerMany') : t('profile.followerOne')}
                    </button>
                    {' · '}{p.following_count}{' '}
                    <button
                      type="button"
                      className="underline decoration-dotted underline-offset-2"
                      onClick={() => setFollowList({ tab: 'following', userId: p.id, title: t('profile.followingOf', { who: pname }) })}
                    >
                      {p.following_count !== 1 ? t('profile.followingMany') : t('profile.followingOne')}
                    </button>
                  </p>
                </div>
              </div>
              {user && p.id !== user.id && (
                blockedByMe ? (
                  <Card className="border-danger/40 bg-danger/10 p-3 text-center">
                    <p className="text-sm font-bold">{t('profile.blockedTitle')}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {t('profile.blockedHint', { who: `@${p.username}` })}
                    </p>
                    <div className="mt-2.5">
                      <Button size="sm" disabled={followBusy} onClick={() => void doUnblock()}>
                        {t('profile.unblock')}
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={following === 'none' ? 'primary' : 'secondary'}
                        block
                        disabled={followBusy}
                        className="flex-1"
                        onClick={() => void toggleFollow()}
                      >
                        {following === 'following' ? <UserMinus size={16} /> : <UserPlus size={16} />}
                        {following === 'following' ? t('profile.unfollow') : following === 'requested' ? t('profile.requestedCancel') : p.visibility === 'private' ? t('profile.askFollow') : t('profile.follow')}
                      </Button>
                      {/* Bloquer / signaler regroupés dans un menu : plus de
                          liens soulignés qui alourdissent l'en-tête. */}
                      <Menu
                        align="right"
                        trigger={({ toggle }) => (
                          <IconButton label={t('profile.moreActions')} onClick={toggle} className="h-10 w-10 border border-line">
                            <MoreVertical size={18} />
                          </IconButton>
                        )}
                        items={[
                          { label: t('profile.block'), icon: <Ban size={15} />, danger: true, onClick: () => setConfirmBlock(true) },
                          { label: t('profile.report'), icon: <Flag size={15} />, onClick: () => setReportOpen(true) },
                        ]}
                      />
                    </div>
                  </>
                )
              )}
              <PublicMiniStats posts={userPosts} />
              {/* Onglets réservés à l'abonné : historique + stats complets. */}
              {canSeeTraining && (
                <Tabs<Tab>
                  value={tab}
                  onChange={setTab}
                  tabs={[
                    { value: 'posts', label: t('profile.tabPosts'), icon: <LayoutGrid size={14} /> },
                    { value: 'historique', label: t('history.title'), icon: <History size={14} /> },
                    { value: 'stats', label: t('stats.title'), icon: <BarChart3 size={14} /> },
                  ]}
                />
              )}
              {!canSeeTraining && (
                <p className="text-xs text-muted">{t('profile.followToSeeAll', { who: `@${p.username}` })}</p>
              )}
              {canSeeTraining && tab === 'historique' ? (
                <PublicTraining workouts={sharedWorkouts} mode="historique" loading={sharedLoading} error={sharedError} />
              ) : canSeeTraining && tab === 'stats' ? (
                <PublicTraining workouts={sharedWorkouts} mode="stats" loading={sharedLoading} error={sharedError} />
              ) : (
                <>
              {userPostsError ? (
                <Card><EmptyState title={t('profile.postsUnavailable')} message={userPostsError}
                  action={<Button onClick={() => void refreshUserPosts(p.id)}>{t('common.retry')}</Button>} /></Card>
              ) : loadingUserPosts && userPosts.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted">{t('profile.loadingPosts')}</p>
              ) : userPosts.length === 0 ? (
                <Card>
                  <EmptyState
                    title={t('profile.noVisiblePosts')}
                    message={
                      following === 'following' || user?.id === p.id
                        ? t('profile.noPostYet', { who: `@${p.username}` })
                        : t('profile.followToSeePosts', { who: `@${p.username}` })
                    }
                  />
                </Card>
              ) : (
                <div className="space-y-3">
                  {userPosts.map((post) => (
                    <PostCard key={post.id} post={post} onChanged={() => void refreshUserPosts(p.id)} />
                  ))}
                  {userPostsMore && <Button block disabled={loadingUserPosts} onClick={() => void moreUserPosts(p.id)}>
                    {loadingUserPosts ? t('common.loading') : t('profile.loadMore')}
                  </Button>}
                </div>
              )}
                </>
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
        {p && <ReportDialog open={reportOpen} targetType="profile" targetId={p.id} onClose={() => setReportOpen(false)} />}
        <ConfirmDialog
          open={confirmBlock}
          title={t('profile.blockTitle', { who: pname })}
          message={
            <>
              {t('profile.blockMessage1')}
              <br />
              {t('profile.blockMessage2')}
            </>
          }
          confirmLabel={t('profile.block')}
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
        title={myProfile?.username ? `@${myProfile.username}` : t('nav.profile')}
        subtitle={!cloudEnabled ? t('profile.localAccount') : undefined}
        actions={
          <IconButton label={t('nav.settings')} onClick={() => navigate('/reglages')}>
            <SettingsIcon size={20} />
          </IconButton>
        }
      />
      <Page className="max-w-3xl space-y-4 pb-10">
        <div className="flex items-center gap-4 py-2">
          <Avatar url={avatar} name={displayName} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-lg font-extrabold">
              <span className="truncate">{displayName}</span>
              {cloudEnabled && user && (
                <button
                  type="button"
                  title={t('profile.editAction')}
                  aria-label={t('profile.editAction')}
                  onClick={() => setEditOpen(true)}
                  className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil size={15} />
                </button>
              )}
            </p>
            {myProfile?.bio && <p className="mt-1 text-sm">{myProfile.bio}</p>}
            {myProfile?.city && <p className="mt-0.5 text-xs text-muted">{myProfile.city}</p>}
            <p className="mt-1.5 text-xs font-semibold text-muted">
              {t('profile.doneCount', { count: done.length })}
              {cloudEnabled && myProfile && user && (
                <>
                  {' · '}{myProfile.followers_count}{' '}
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => user && setFollowList({ tab: 'followers', userId: user.id, title: t('profile.myFollowers') })}
                  >
                    {myProfile.followers_count !== 1 ? t('profile.followerMany') : t('profile.followerOne')}
                  </button>
                  {' · '}{myProfile.following_count}{' '}
                  <button
                    type="button"
                    className="underline decoration-dotted underline-offset-2"
                    onClick={() => user && setFollowList({ tab: 'following', userId: user.id, title: t('profile.myFollowing') })}
                  >
                    {myProfile.following_count !== 1 ? t('profile.followingMany') : t('profile.followingOne')}
                  </button>
                </>
              )}
            </p>
          </div>
        </div>

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'posts', label: t('profile.tabPosts'), icon: <LayoutGrid size={14} /> },
            { value: 'historique', label: t('history.title'), icon: <History size={14} /> },
            { value: 'stats', label: t('stats.title'), icon: <BarChart3 size={14} /> },
          ]}
        />

        {tab === 'posts' && (
          !cloudEnabled ? (
            <Card>
              <EmptyState
                title={t('profile.myPostsTitle')}
                message={t('profile.myPostsMessage')}
              />
            </Card>
          ) : myPostsError ? (
            <Card><EmptyState title={t('profile.postsUnavailable')} message={myPostsError}
              action={<Button onClick={() => void refreshPosts()}>{t('common.retry')}</Button>} /></Card>
          ) : loadingPosts && myPosts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">{t('common.loading')}</p>
          ) : myPosts.length === 0 ? (
            <Card>
              <EmptyState
                title={t('profile.noMyPostsTitle')}
                message={t('profile.noMyPostsMessage')}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {myPosts.map((p) => (
                <PostCard key={p.id} post={p} onChanged={() => void refreshPosts()} />
              ))}
              {myPostsMore && <Button block disabled={loadingPosts} onClick={() => void moreMyPosts()}>
                {loadingPosts ? t('common.loading') : t('profile.loadMore')}
              </Button>}
            </div>
          )
        )}
        {tab === 'historique' && <div className="-mx-4"><HistoryPage bare /></div>}
        {tab === 'stats' && <div className="-mx-4"><StatsPage bare /></div>}
      </Page>

      <EditProfileModal
        open={editOpen}
        initial={myProfile}
        defaultVisibility={settings.defaultPostVisibility}
        googleAvatar={(meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined) ?? null}
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
  useLang()
  const snaps = posts.map((p) => p.workout_snapshot).filter((s): s is NonNullable<typeof s> => Boolean(s))
  if (snaps.length === 0) return null
  const sets = snaps.reduce((n, s) => n + s.sets, 0)
  const volume = snaps.reduce((n, s) => n + s.volume, 0)
  const seconds = snaps.reduce((n, s) => n + s.seconds, 0)
  const cells: { value: string; label: string }[] = [
    { value: String(posts.length), label: t('profile.statPosts') },
    { value: String(sets), label: t('stats.sets') },
    { value: formatVolume(volume, 'kg'), label: t('stats.volume') },
    { value: formatDuration(seconds, 'compact'), label: t('stats.time') },
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
      <p className="mt-1 text-center text-[10px] text-muted">
        {posts.length === 1 ? t('profile.basedOnOne') : t('profile.basedOnMany', { count: posts.length })}
      </p>
    </div>
  )
}

/**
 * Historique / Stats complets d'un profil public : lisibles par l'abonné
 * (RPC `shared_workouts`), avec le même filtre de période que les stats.
 */
function PublicTraining({ workouts, mode, loading, error }: {
  workouts: Workout[] | null
  mode: 'historique' | 'stats'
  loading: boolean
  error: string | null
}) {
  useLang()
  const settings = useStore((s) => s.settings)
  const [range, setRange] = useState<RangeFilter>('tout')

  if (loading && workouts === null) {
    return <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
  }
  if (error || workouts === null) {
    return (
      <Card>
        <EmptyState title={t('profile.postsUnavailable')} message={error ?? t('profile.secSharedEmpty')} />
      </Card>
    )
  }

  const since = rangeSince(range)
  const scoped = workouts.filter((w) => since === null || +new Date(w.startedAt) >= since)
  const filter = (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {RANGE_LABEL_KEYS.map(([value, key]) => (
        <Chip key={value} size="sm" active={range === value} onClick={() => setRange(value)}>
          {t(key)}
        </Chip>
      ))}
    </div>
  )

  if (mode === 'historique') {
    return (
      <div className="space-y-3">
        {filter}
        {scoped.length === 0 ? (
          <Card>
            <EmptyState title={t('profile.secShared')} message={t('profile.secSharedEmpty')} />
          </Card>
        ) : (
          scoped.map((w) => (
            <Card key={w.id} className="p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-extrabold">{w.name}</p>
                <span className="shrink-0 text-[11px] text-muted">{formatDate(w.startedAt, 'long')}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {formatDuration(workoutDurationSeconds(w), 'compact')} · {formatVolume(workoutVolume(w), settings.unit)} · {t('stats.setsCount', { n: workoutSets(w) })}
              </p>
              <p className="mt-1 truncate text-xs text-muted">
                {w.exercises.map((e) => e.exerciseName ?? '').filter(Boolean).join(' · ')}
              </p>
            </Card>
          ))
        )}
      </div>
    )
  }

  return <PublicTrainingStats scoped={scoped} filter={filter} />
}

/** Bloc statistiques de l'onglet Stats d'un profil suivi. */
function PublicTrainingStats({ scoped, filter }: { scoped: Workout[]; filter: React.ReactNode }) {
  useLang()
  const settings = useStore((s) => s.settings)
  const totalVolume = scoped.reduce((n, w) => n + workoutVolume(w), 0)
  const totalTime = scoped.reduce((n, w) => n + workoutDurationSeconds(w), 0)
  const totalSets = scoped.reduce((n, w) => n + workoutSets(w), 0)
  const series = weeklySeries(scoped, 12, settings.firstDayOfWeek)

  const byExercise = new Map<string, { name: string; sets: number; volume: number }>()
  for (const w of scoped) {
    for (const we of w.exercises) {
      const name = we.exerciseName ?? t('lib.exerciseFallback')
      const entry = byExercise.get(name) ?? { name, sets: 0, volume: 0 }
      for (const s of we.sets) {
        if (!s.completed) continue
        entry.sets += 1
        entry.volume += (s.weight ?? 0) * (s.reps ?? 0)
      }
      byExercise.set(name, entry)
    }
  }
  const top = [...byExercise.values()].sort((a, b) => b.volume - a.volume).slice(0, 6)

  return (
    <div className="space-y-4">
      {filter}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { label: t('stats.sessions'), value: String(scoped.length) },
          { label: t('stats.time'), value: formatDuration(totalTime, 'compact') },
          { label: t('stats.volume'), value: formatVolume(totalVolume, settings.unit) },
          { label: t('stats.sets'), value: String(totalSets) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface px-1 py-2">
            <p className="tabular truncate text-sm font-extrabold">{s.value}</p>
            <p className="text-[10px] tracking-wide text-muted uppercase">{s.label}</p>
          </div>
        ))}
      </div>
      <Card className="p-4">
        <SectionTitle>{t('stats.durationPerWeek')}</SectionTitle>
        <div className="mx-auto h-36 w-full max-w-md">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v: number) => (v >= 3600 ? `${Math.round(v / 3600)}h` : v >= 60 ? `${Math.round(v / 60)}m` : `${v}s`)}
              />
              <Tooltip
                cursor={chartCursor}
                wrapperStyle={chartTooltipWrapper}
                content={
                  <ChartTooltipContent
                    format={(p, datum) =>
                      p.dataKey === 'duration'
                        ? t('stats.tipDuration', {
                            v: formatDuration(Number(p.value), 'compact'),
                            s: String(datum.sets ?? 0),
                          })
                        : null
                    }
                  />
                }
              />
              <Bar dataKey="duration" name={t('stats.chartDuration')} radius={[6, 6, 2, 2]} fill="var(--accent)" minPointSize={2} maxBarSize={34} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {top.length > 0 && (
        <Card className="p-4">
          <SectionTitle>{t('stats.topExercises')}</SectionTitle>
          <div className="space-y-2">
            {top.map((x) => (
              <div key={x.name} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{x.name}</span>
                <span className="shrink-0 text-[11px] text-muted">
                  {t('stats.setsCount', { n: x.sets })} · {formatVolume(x.volume, settings.unit)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export interface FollowListInfo {
  tab: 'followers' | 'following'
  userId: string
  title: string
}

function FollowListModal({ info, onClose }: { info: FollowListInfo | null; onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const notify = useStore((s) => s.notify)
  useLang()
  const [tab, setTab] = useState<'followers' | 'following'>(info?.tab ?? 'followers')
  const [lists, setLists] = useState<Partial<Record<'followers' | 'following', SocialProfile[]>>>({})
  const [myFollows, setMyFollows] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (info) {
      setTab(info.tab)
      setLists({})
      listMyFollowIds().then(setMyFollows).catch(() => {})
    }
  }, [info])

  useEffect(() => {
    if (!info) return
    if (lists[tab] !== undefined) return
    setLoading(true)
    const fn = tab === 'followers' ? listFollowers(info.userId) : listFollowing(info.userId)
    fn.then((l) => setLists((prev) => ({ ...prev, [tab]: l })))
      .catch((err) => notify(err instanceof Error ? err.message : t('profile.listFailed'), 'error'))
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
      setMyFollows((prev) => { const next = new Set(prev); next.delete(id); return next })
      setLists((prev) => ({ ...prev, following: (prev.following ?? []).filter((p) => p.id !== id) }))
      notify(t('profile.followRemoved'), 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : t('profile.actionFailed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const kick = async (id: string) => {
    setBusyId(id)
    try {
      await removeFollower(id)
      setLists((prev) => ({ ...prev, followers: (prev.followers ?? []).filter((p) => p.id !== id) }))
      notify(t('profile.followerRemoved'), 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : t('profile.actionFailed'), 'error')
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
          { value: 'followers', label: t('profile.followersCount', { n: lists.followers?.length ?? '…' }) },
          { value: 'following', label: t('profile.followingCount', { n: lists.following?.length ?? '…' }) },
        ]}
      />
      <div className="mt-3 space-y-1.5">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {tab === 'followers' ? t('profile.noFollowers') : t('profile.noFollowing')}
          </p>
        ) : (
          rows.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
              <button type="button" onClick={() => go(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <ProfileAvatar url={p.avatar_url} name={p.display_name ?? p.username ?? '?'} size={40} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">
                    @{p.username ?? '?'}
                    {p.visibility === 'private' && p.id !== user?.id && !myFollows.has(p.id) && (
                      <span className="ml-1" title={t('profile.privateAccount')}>🔒</span>
                    )}
                  </span>
                  {p.display_name && <span className="block truncate text-xs text-muted">{p.display_name}</span>}
                </span>
              </button>
              {mine && tab === 'following' && (
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => void remove(p.id)}>
                  <UserMinus size={14} /> {t('profile.unfollow')}
                </Button>
              )}
              {mine && tab === 'followers' && (
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => void kick(p.id)}>
                  <UserMinus size={14} /> {t('common.remove')}
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
  googleAvatar,
  onClose,
  onSaved,
}: {
  open: boolean
  initial: SocialProfile | null
  defaultVisibility: PostVisibility
  googleAvatar?: string | null
  onClose: () => void
  onSaved: (p: SocialProfile, vis: PostVisibility | null) => void
}) {
  const notify = useStore((s) => s.notify)
  useLang()
  const [username, setUsername] = useState(initial?.username ?? '')
  const [name, setName] = useState(initial?.display_name ?? '')
  const [avatar, setAvatar] = useState<string | null>(initial?.avatar_url ?? null)
  const [uploading, setUploading] = useState(false)
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
      setAvatar(initial?.avatar_url ?? null)
      setBio(initial?.bio ?? '')
      setCity(initial?.city ?? '')
      setAccount(initial?.visibility === 'private' ? 'private' : 'public')
      setPostVis(defaultVisibility)
      setHint(null)
    }
  }, [open, initial, defaultVisibility])

  if (!open) return null

  const pickPhoto = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadAvatar(file)
      setAvatar(url)
      notify(t('profile.photoUpdated'), 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : t('profile.uploadFailed'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const clean = normalizeUsername(username)
  const usernameChanged = clean !== (initial?.username ?? '')
  const valid = /^[a-z0-9_.]{3,20}$/.test(clean)

  const check = async () => {
    if (!valid) {
      setHint(t('profile.usernameRule'))
      return
    }
    if (!usernameChanged) {
      setHint(t('profile.alreadyYours'))
      return
    }
    setChecking(true)
    try {
      setHint((await isUsernameAvailable(clean)) ? t('profile.usernameAvailable', { name: `@${clean}` }) : t('profile.usernameTaken', { name: `@${clean}` }))
    } catch (err) {
      notify(err instanceof Error ? err.message : t('profile.checkFailed'), 'error')
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
        avatar_url: avatar,
        bio,
        city,
        visibility: account,
      })
      notify(usernameChanged ? t('profile.usernameChanged', { name: `@${clean}` }) : t('profile.updated'), 'success')
      onSaved(p, postVis)
    } catch (err) {
      notify(err instanceof Error ? err.message : t('profile.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('profile.editTitle')}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <ProfileAvatar url={avatar ?? googleAvatar} name={name || username || '?'} size={64} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-bold hover:brightness-105">
              {uploading ? t('lib.sending') : t('profile.choosePhoto')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void pickPhoto(file)
                  e.target.value = ''
                }}
              />
            </label>
            {googleAvatar && avatar !== googleAvatar && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => setAvatar(googleAvatar)}
                className="block text-[11px] font-semibold text-muted underline decoration-dotted underline-offset-2"
              >
                {t('profile.useGooglePhoto')}
              </button>
            )}
          </div>
        </div>
        <Field label={t('profile.usernameField')} hint={t('profile.usernameHint')}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('profile.usernamePlaceholder')} autoComplete="off" />
        </Field>
        <div>
          <Button size="sm" disabled={!valid || checking} onClick={() => void check()}>
            {checking ? t('welcome.checking') : t('welcome.check')}
          </Button>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        <Field label={t('profile.displayNameField')} hint={t('profile.displayNameHint')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Léa" autoComplete="off" maxLength={60} />
        </Field>
        <Field label={t('profile.bioField')} hint={t('profile.bioHint')}>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={160} placeholder={t('profile.bioPlaceholder')} />
        </Field>
        <Field label={t('profile.cityField')}>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lyon" autoComplete="off" />
        </Field>
        <Field label={t('profile.accountField')} hint={t('profile.accountHint')}>
          <Select value={account} onChange={(e) => setAccount(e.target.value as 'public' | 'private')}>
            <option value="public">{t('profile.accountPublic')}</option>
            <option value="private">{t('profile.accountPrivate')}</option>
          </Select>
        </Field>
        <Field label={t('profile.defaultPostVisibility')}>
          <Select value={postVis} onChange={(e) => setPostVis(e.target.value as PostVisibility)}>
            <option value="followers">{t('post.visFollowersRecommended')}</option>
            <option value="public">{t('post.visPublic')}</option>
            <option value="private">{t('post.visPrivateOnlyMe')}</option>
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" block disabled={!valid || saving} onClick={() => void save()}>
            {saving ? t('profile.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
