import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudOff, Plus, RefreshCw, Search, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import type { Post, SocialProfile } from '@/types'
import { listFeed } from '@/lib/posts'
import { fetchProfileByUsername, followUser } from '@/lib/social'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { IconButton } from '@/components/ui'
import { PostCard } from '@/components/PostCard'

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
        subtitle="Séances de tes abonnements"
        actions={
          <>
            <IconButton label="Actualiser" onClick={refresh}>
              <RefreshCw size={20} className={refreshing ? 'animate-spin' : ''} />
            </IconButton>
            <IconButton label="Démarrer une séance vide" onClick={startEmpty}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      />
      <Page className="max-w-2xl space-y-3 pb-10">
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
