import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CloudOff, Plus, Search, UserPlus, X } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import type { FollowState } from '@/lib/social'
import type { Post, SocialProfile } from '@/types'
import { listFeed } from '@/lib/posts'
import { loadHome, peekHome } from '@/lib/pagePreload'
import { cancelFollowRequest } from '@/lib/notifications'
import { countUnread } from '@/lib/notifications'
import { followStatus, isBlockedByMe, requestFollow, searchProfiles } from '@/lib/social'
import { Page, PageHeader } from '@/components/PageHeader'
import { t, useLang } from '@/lib/i18n'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { IconButton } from '@/components/ui'
import { PostCard } from '@/components/PostCard'
import { ProfileAvatar, profileNameOf } from '@/components/ProfileAvatar'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

/**
 * Accueil = entraînement en cours, feed et découverte.
 */
export default function HomePage() {
  const navigate = useNavigate()
  useLang()
  const { cloudEnabled, user } = useAuth()
  const userId = user?.id
  const notify = useStore((s) => s.notify)
  const startWorkout = useStore((s) => s.startWorkout)
  const activeId = useStore((s) => s.activeWorkoutId)

  const [posts, setPosts] = useState<Post[]>(() => user ? (peekHome(user.id)?.posts ?? []) : [])
  const [loading, setLoading] = useState(() => !user || !peekHome(user.id))
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [discover, setDiscover] = useState<Post[]>(() => user ? (peekHome(user.id)?.discover ?? []) : [])
  const [feedError, setFeedError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SocialProfile[] | null>(null)
  const [statuses, setStatuses] = useState<Record<string, FollowState>>({})
  const [followBusy, setFollowBusy] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)

  /* Pull-to-refresh : tirer vers le bas en haut du feed pour actualiser. */
  const [pull, setPull] = useState(0)
  const pullStart = useRef<number | null>(null)
  const pullActive = useRef(false)
  const pullDist = useRef(0)

  const load = useCallback(async (offset: number, append: boolean) => {
    if (!cloudEnabled || !userId) return
    if (append) setLoadingMore(true)
    else if (!peekHome(userId)) setLoading(true)
    try {
      const first = append ? null : await loadHome(userId, true)
      const page = first?.posts ?? await listFeed(PAGE_SIZE, offset)
      setFeedError(null)
      setPosts((prev) => (append ? [...prev, ...page] : page))
      setHasMore(page.length === PAGE_SIZE)
      if (!append) setDiscover(first?.discover ?? [])
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : t('home.feedFailed'))
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
    }
  }, [cloudEnabled, userId])

  useEffect(() => {
    void load(0, false)
  }, [load])

  const refresh = () => {
    setRefreshing(true)
    void load(0, false)
  }

  /* Cloche : compteur non-lues (point rouge), rafraîchi toutes les 30 s. */
  useEffect(() => {
    if (!cloudEnabled || !user) return
    const fetch = () => {
      countUnread().then(setUnread).catch(() => {})
    }
    fetch()
    const id = setInterval(fetch, 30_000)
    return () => clearInterval(id)
  }, [cloudEnabled, userId])

  /* Recherche floue : suggestions dès 2 lettres (débounce 300 ms). */
  useEffect(() => {
    if (!cloudEnabled || query.trim().length < 2) {
      setSearching(false)
      if (query.trim().length === 0) setResults(null)
      return
    }
    setSearching(true)
    const id = setTimeout(() => {
      searchProfiles(query)
        .then(async (list) => {
          setResults(list)
          const entries = await Promise.all(list.map(async (p) => [p.id, await followStatus(p.id)] as const))
          setStatuses(Object.fromEntries(entries))
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cloudEnabled])

  useEffect(() => {
    const el = document.querySelector('.app-main')
    if (!el) return
    const onStart = (e: Event) => {
      if (el.scrollTop <= 0) {
        pullStart.current = (e as TouchEvent).touches[0].clientY
        pullActive.current = true
      }
    }
    const onMove = (e: Event) => {
      if (!pullActive.current || pullStart.current === null) return
      const dy = (e as TouchEvent).touches[0].clientY - pullStart.current
      if (dy > 0 && el.scrollTop <= 0) {
        pullDist.current = Math.min(96, dy * 0.5)
        setPull(pullDist.current)
      } else {
        pullActive.current = false
        pullDist.current = 0
        setPull(0)
      }
    }
    const onEnd = () => {
      if (pullActive.current && pullDist.current >= 64) {
        setRefreshing(true)
        void load(0, false)
      }
      pullActive.current = false
      pullStart.current = null
      pullDist.current = 0
      setPull(0)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEmpty = () => {
    if (activeId) {
      navigate('/seance')
      return
    }
    startWorkout({})
    navigate('/seance')
  }

  const search = async () => {
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const list = await searchProfiles(query)
      setResults(list)
      const entries = await Promise.all(list.map(async (p) => [p.id, await followStatus(p.id)] as const))
      setStatuses(Object.fromEntries(entries))
    } catch (err) {
      notify(err instanceof Error ? err.message : t('home.searchFailed'), 'error')
    } finally {
      setSearching(false)
    }
  }

  const actOn = async (p: SocialProfile) => {
    const st = statuses[p.id] ?? 'none'
    if (st === 'following') return
    setFollowBusy(p.id)
    try {
      if (await isBlockedByMe(p.id)) {
        notify(t('home.blockedHint', { who: `@${p.username}` }), 'info')
        if (p.username) navigate(`/profil/${p.username}`)
        return
      }
      if (st === 'requested') {
        await cancelFollowRequest(p.id)
        setStatuses((s) => ({ ...s, [p.id]: 'none' }))
        notify(t('home.requestCancelled'), 'info')
      } else {
        const next = await requestFollow(p.id)
        setStatuses((s) => ({ ...s, [p.id]: next }))
        notify(
          next === 'requested' ? t('home.requestSent', { who: `@${p.username}` }) : t('home.nowFollowing', { who: `@${p.username}` }),
          'success',
        )
        refresh()
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t('home.followFailed'), 'error')
    } finally {
      setFollowBusy(null)
    }
  }

  /* Résultats de recherche : rendus en tête de feed, uniquement pendant une
     recherche. La barre de saisie, elle, vit dans l'en-tête (compacte) pour
     laisser toute la place au feed. */
  const searchOpen = searching || results !== null
  const searchResults = (
    <Card className="space-y-2 p-3">
      {searching && <p className="text-xs text-muted">{t('home.searching')}</p>}
      {results !== null && !searching && results.length === 0 && query.trim().length >= 2 && (
        <p className="text-sm text-muted">{t('home.noResults', { query: query.trim() })}</p>
      )}
      {results !== null && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((p) => {
            const st = statuses[p.id] ?? 'none'
            return (
              <div key={p.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 p-2">
                <ProfileAvatar url={p.avatar_url} name={profileNameOf(p)} size={36} />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => p.username && navigate(`/profil/${p.username}`)}
                >
                  <span className="block truncate text-sm font-bold">
                    @{p.username}
                    {p.visibility === 'private' && st !== 'following' && (
                      <span className="ml-1" title={t('home.privateAccount')}>🔒</span>
                    )}
                  </span>
                  {p.display_name && <span className="block truncate text-xs text-muted">{p.display_name}</span>}
                </button>
                {st === 'following' ? (
                  <button
                    type="button"
                    onClick={() => p.username && navigate(`/profil/${p.username}`)}
                    className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success"
                    title={t('home.viewProfile')}
                  >
                    <Check size={12} /> {t('home.followingBadge')}
                  </button>
                ) : (
                  <Button
                    size="sm"
                    variant={st === 'requested' ? 'ghost' : 'primary'}
                    disabled={followBusy === p.id}
                    onClick={() => void actOn(p)}
                  >
                    <UserPlus size={14} /> {st === 'requested' ? t('home.requested') : p.visibility === 'private' ? t('home.askFollowPrivate') : t('home.follow')}
                  </Button>
                )}
              </div>
            )
          })}
          <p className="text-[11px] text-muted">{t('home.privateHint')}</p>
        </div>
      )}
    </Card>
  )

  if (!cloudEnabled) {
    return (
      <div>
        <PageHeader title={t('nav.home')} subtitle={t('home.cloudSubtitle')} />
        <Page className="max-w-3xl space-y-4 pb-10">
          <Card>
            <EmptyState
              icon={<CloudOff size={24} />}
              title={t('home.cloudTitle')}
              message={t('home.cloudMessage')}
              action={
                <Button variant="primary" onClick={startEmpty}>
                  <Plus size={16} /> {t('home.startWorkout')}
                </Button>
              }
            />
          </Card>
        </Page>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('nav.home')}
        actions={
          <>
            {/* Recherche de pseudo compacte, collée à la cloche : le feed garde
                toute la largeur de la page. Les résultats s'affichent dans le
                feed (searchResults), pas dans l'en-tête. */}
            <div className="relative">
              <button
                type="button"
                aria-label={t('home.searchGoAria')}
                title={t('home.searchGoAria')}
                onClick={() => void search()}
                className="absolute top-1/2 left-0.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:text-accent"
              >
                <Search size={14} />
              </button>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
                aria-label={t('home.searchAria')}
                placeholder={t('home.searchCompact')}
                title={t('home.searchPlaceholder')}
                autoComplete="off"
                className="h-8 w-32 rounded-full pr-8 pl-8 text-xs sm:w-40 lg:w-48"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  aria-label={t('common.clear')}
                  onClick={() => { setQuery(''); setResults(null) }}
                  className="absolute top-1/2 right-0.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-ink"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <IconButton label={t('home.notifLabel')} onClick={() => navigate('/notifications')}>
              <span className="relative inline-flex">
                <Bell size={20} />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
            </IconButton>
          </>
        }
      />
      <Page className="max-w-2xl space-y-3 pb-10">
        {searchOpen && searchResults}
        {pull > 0 || refreshing ? (
          <div className="flex h-8 items-center justify-center transition-all">
            <span className={cn('inline-block h-4 w-4 rounded-full border-2 border-accent border-t-transparent', (refreshing || pull >= 64) && 'animate-spin')} />
          </div>
        ) : null}
        {feedError ? (
          <Card className="p-4">
            <EmptyState title={t('home.feedErrorTitle')} message={feedError}
              action={<Button variant="primary" onClick={refresh}>{t('common.retry')}</Button>} />
          </Card>
        ) : loading ? (
          <p className="py-8 text-center text-sm text-muted">{t('home.loadingFeed')}</p>
        ) : posts.length === 0 ? (
          <Card className="space-y-3 p-4">
            <EmptyState
              title={t('home.emptyTitle')}
              message={t('home.emptyMessage')}
            />
          </Card>
        ) : (
          <>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onChanged={refresh} />
            ))}
            {hasMore && (
              <Button block disabled={loadingMore} onClick={() => void load(posts.length, true)}>
                {loadingMore ? t('common.loading') : t('home.loadMore')}
              </Button>
            )}
          </>
        )}
        {!feedError && !loading && posts.length === 0 && discover.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold">{t('home.discover')}</h2>
            {discover.map((p) => <PostCard key={p.id} post={p} onChanged={refresh} />)}
          </section>
        )}
      </Page>
    </div>
  )
}
