import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudOff, Plus, Search, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import type { Post, SocialProfile } from '@/types'
import { listFeed } from '@/lib/posts'
import { fetchProfileByUsername, followUser } from '@/lib/social'
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
  const [found, setFound] = useState<SocialProfile | null | undefined>(undefined)
  const [followBusy, setFollowBusy] = useState(false)

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
    if (!query.trim()) return
    setSearching(true)
    setFound(undefined)
    try {
      setFound(await fetchProfileByUsername(query))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Recherche impossible', 'error')
    } finally {
      setSearching(false)
    }
  }

  const followFound = async () => {
    if (!found) return
    setFollowBusy(true)
    try {
      await followUser(found.id)
      notify(`Tu suis @${found.username} 🎉`, 'success')
      setFound(undefined)
      setQuery('')
      refresh()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suivi impossible', 'error')
    } finally {
      setFollowBusy(false)
    }
  }

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
          <IconButton label="Démarrer une séance vide" onClick={startEmpty}>
            <Plus size={22} />
          </IconButton>
        }
      />
      <Page className="max-w-2xl space-y-3 pb-10">
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
              message="Suis des sportifs avec leur pseudo exact pour voir leurs séances ici. Puis publie ta première séance depuis son rapport."
            />
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void search() }}
                placeholder="Pseudo exact, ex. lea.lift"
                autoComplete="off"
              />
              <Button variant="primary" disabled={searching || !query.trim()} onClick={() => void search()}>
                <Search size={16} />
              </Button>
            </div>
            {found === null && (
              <p className="text-sm text-danger">Aucun profil avec ce pseudo.</p>
            )}
            {found && (
              <Card className="flex items-center gap-3 border-accent-line bg-accent-soft p-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">@{found.username}</span>
                  {found.bio && <span className="block truncate text-xs text-muted">{found.bio}</span>}
                </span>
                <Button size="sm" variant="primary" disabled={followBusy} onClick={() => void followFound()}>
                  <UserPlus size={14} /> Suivre
                </Button>
              </Card>
            )}
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
