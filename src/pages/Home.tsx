import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CloudOff, Plus, Search, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import type { FollowState } from '@/lib/social'
import type { Post, SocialProfile } from '@/types'
import { listFeed } from '@/lib/posts'
import { cancelFollowRequest } from '@/lib/notifications'
import { countUnread } from '@/lib/notifications'
import { followStatus, isBlockedByMe, requestFollow, searchProfiles } from '@/lib/social'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { IconButton } from '@/components/ui'
import { PostCard } from '@/components/PostCard'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

/**
 * Étape C : Accueil = feed seul (décision validée).
 * Le démarrage de séance se fait via le + (séance vide) ou Programmes.
 */
export default function HomePage() {
  const navigate = useNavigate()
  const { cloudEnabled, user } = useAuth()
  const notify = useStore((s) => s.notify)
  const startWorkout = useStore((s) => s.startWorkout)
  const activeId = useStore((s) => s.activeWorkoutId)

  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
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
    if (!cloudEnabled || !user) return
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await listFeed(PAGE_SIZE, offset)
      setPosts((prev) => (append ? [...prev, ...page] : page))
      setHasMore(page.length === PAGE_SIZE)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Feed illisible', 'error')
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setRefreshing(false)
    }
  }, [cloudEnabled, user, notify])

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
  }, [cloudEnabled, user])

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
      notify(err instanceof Error ? err.message : 'Recherche impossible', 'error')
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
        notify(`@${p.username} est bloqué — débloque-le depuis son profil`, 'info')
        return
      }
      if (st === 'requested') {
        await cancelFollowRequest(p.id)
        setStatuses((s) => ({ ...s, [p.id]: 'none' }))
        notify('Demande annulée', 'info')
      } else {
        const next = await requestFollow(p.id)
        setStatuses((s) => ({ ...s, [p.id]: next }))
        notify(
          next === 'requested' ? `Demande envoyée à @${p.username} 🔒` : `Tu suis @${p.username} 🎉`,
          'success',
        )
        refresh()
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suivi impossible', 'error')
    } finally {
      setFollowBusy(null)
    }
  }

  const searchBlock = (
    <Card className="space-y-2 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
            placeholder="Rechercher un pseudo…"
            autoComplete="off"
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Effacer"
              onClick={() => { setQuery(''); setResults(null) }}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink"
            >
              ✕
            </button>
          )}
        </div>
        <Button variant="primary" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
          <Search size={16} />
        </Button>
      </div>
      {searching && <p className="text-xs text-muted">Recherche…</p>}
      {results !== null && !searching && results.length === 0 && query.trim().length >= 2 && (
        <p className="text-sm text-muted">Aucun pseudo ne ressemble à « {query.trim()} ».</p>
      )}
      {results !== null && results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((p) => {
            const st = statuses[p.id] ?? 'none'
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => p.username && navigate(`/profil/${p.username}`)}
                >
                  <span className="block truncate text-sm font-bold">@{p.username}</span>
                  {p.bio && <span className="block truncate text-xs text-muted">{p.bio}</span>}
                </button>
                {st === 'following' ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-bold text-success">
                    <Check size={12} /> Suivi
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={st === 'requested' ? 'ghost' : 'primary'}
                    disabled={followBusy === p.id}
                    onClick={() => void actOn(p)}
                  >
                    <UserPlus size={14} /> {st === 'requested' ? 'Demandé' : 'Suivre'}
                  </Button>
                )}
              </div>
            )
          })}
          <p className="text-[11px] text-muted">🔒 = compte privé : ta demande devra être acceptée.</p>
        </div>
      )}
    </Card>
  )

  if (!cloudEnabled) {
    return (
      <div>
        <PageHeader title="Accueil" subtitle="Le feed arrive avec le cloud" />
        <Page className="max-w-3xl space-y-4 pb-10">
          <Card>
            <EmptyState
              icon={<CloudOff size={24} />}
              title="Le feed nécessite le cloud"
              message="Connecte-toi avec Google pour suivre des sportifs et voir leurs séances ici."
              action={
                <Button variant="primary" onClick={startEmpty}>
                  <Plus size={16} /> Démarrer une séance
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
        title="Accueil"
        subtitle="Tire vers le bas pour actualiser"
        actions={
          <>
            <IconButton label="Notifications" onClick={() => navigate('/notifications')}>
              <span className="relative inline-flex">
                <Bell size={20} />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-extrabold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
            </IconButton>
            <IconButton label="Démarrer une séance vide" onClick={startEmpty}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />
      <Page className="max-w-2xl space-y-3 pb-10">
        {searchBlock}
        <div
          className={cn(
            'flex items-center justify-center gap-2 overflow-hidden text-xs font-bold text-muted transition-all',
            pull > 0 || refreshing ? 'h-8 opacity-100' : 'h-0 opacity-0',
          )}
        >
          <span className={cn('inline-block h-4 w-4 rounded-full border-2 border-accent border-t-transparent', (refreshing || pull >= 64) && 'animate-spin')} />
          {refreshing ? 'Actualisation…' : pull >= 64 ? 'Relâche pour actualiser' : 'Tire pour actualiser'}
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Chargement du feed…</p>
        ) : posts.length === 0 ? (
          <Card className="space-y-3 p-4">
            <EmptyState
              title="Ton feed est vide"
              message="Recherche un pseudo ci-dessus pour suivre des sportifs, puis publie ta première séance depuis son rapport."
            />
          </Card>
        ) : (
          <>
            {posts.map((p) => (
              <PostCard key={p.id} post={p} onChanged={refresh} />
            ))}
            {hasMore && (
              <Button block disabled={loadingMore} onClick={() => void load(posts.length, true)}>
                {loadingMore ? 'Chargement…' : 'Charger plus'}
              </Button>
            )}
          </>
        )}
      </Page>
    </div>
  )
}
