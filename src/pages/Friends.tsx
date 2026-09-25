import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  CloudOff,
  Dumbbell,
  Mail,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react'
import type { Workout } from '@/types'
import { useAuth } from '@/lib/auth'
import {
  acceptFriendRequest,
  displayNameOf,
  findUserByEmail,
  getFriendWorkouts,
  listFriendships,
  removeFriendship,
  sendFriendRequest,
  type FriendProfile,
  type Friendship,
} from '@/lib/friends'
import { useStore } from '@/store/store'
import { completedWorkouts, workoutDurationSeconds, workoutSets, workoutVolume } from '@/lib/calc'
import { formatDate, formatDuration, kgToDisplay } from '@/lib/utils'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState, Input, SectionTitle, Stat, Tabs } from '@/components/ui'

type Tab = 'friends' | 'requests' | 'add'

function Avatar({ profile, size = 44 }: { profile?: FriendProfile | null; size?: number }) {
  const name = displayNameOf(profile)
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl object-cover"
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl bg-accent-soft font-extrabold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function FriendsPage() {
  const { cloudEnabled, user } = useAuth()
  const settings = useStore((s) => s.settings)
  const notify = useStore((s) => s.notify)

  const [tab, setTab] = useState<Tab>('friends')
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [found, setFound] = useState<FriendProfile | null | undefined>(undefined)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [friendWorkouts, setFriendWorkouts] = useState<Workout[]>([])
  const [loadingWorkouts, setLoadingWorkouts] = useState(false)
  const [openWorkoutId, setOpenWorkoutId] = useState<string | null>(null)

  const myId = user?.id ?? null

  const refresh = useCallback(async () => {
    if (!cloudEnabled || !myId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setFriendships(await listFriendships())
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Chargement impossible', 'error')
    } finally {
      setLoading(false)
    }
  }, [cloudEnabled, myId, notify])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const friends = useMemo(() => friendships.filter((f) => f.status === 'accepted'), [friendships])
  const received = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.addressee === myId),
    [friendships, myId],
  )
  const sent = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.requester === myId),
    [friendships, myId],
  )
  const selected = friends.find((f) => (f.other?.id ?? (f.requester === myId ? f.addressee : f.requester)) === selectedId) ?? null
  const selectedProfile = selected?.other ?? null

  const openFriend = async (friendUserId: string) => {
    setSelectedId(friendUserId)
    setOpenWorkoutId(null)
    setLoadingWorkouts(true)
    try {
      setFriendWorkouts(await getFriendWorkouts(friendUserId))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Séances illisibles', 'error')
      setFriendWorkouts([])
    } finally {
      setLoadingWorkouts(false)
    }
  }

  const act = async (id: string, fn: (fid: string) => Promise<unknown>, okMsg: string) => {
    setBusyId(id)
    try {
      await fn(id)
      notify(okMsg, 'success')
      await refresh()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const search = async () => {
    if (!email.trim()) return
    setSearching(true)
    setFound(undefined)
    try {
      setFound(await findUserByEmail(email))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Recherche impossible', 'error')
    } finally {
      setSearching(false)
    }
  }

  const invite = async () => {
    if (!found) return
    setBusyId(found.id)
    try {
      const res = await sendFriendRequest(found.id)
      notify(res === 'accepted' ? 'Vous êtes maintenant amis !' : 'Demande envoyée', 'success')
      setFound(undefined)
      setEmail('')
      setTab('friends')
      await refresh()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Envoi impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const done = useMemo(() => completedWorkouts(friendWorkouts), [friendWorkouts])
  const fVolume = done.reduce((n, w) => n + workoutVolume(w), 0)
  const fSets = done.reduce((n, w) => n + workoutSets(w), 0)
  const fTime = done.reduce((n, w) => n + workoutDurationSeconds(w), 0)
  const openWorkout = done.find((w) => w.id === openWorkoutId) ?? null

  if (!cloudEnabled) {
    return (
      <div>
        <PageHeader title="Amis" subtitle="Comptes & partage" />
        <Page className="max-w-3xl">
          <Card>
            <EmptyState
              icon={<CloudOff size={24} />}
              title="Les amis nécessitent le cloud"
              message="Connectez-vous avec Google (mode cloud) pour ajouter des amis et voir leurs séances."
            />
          </Card>
        </Page>
      </div>
    )
  }

  /* ------------------------------ détail ami ------------------------------ */
  if (selectedId) {
    return (
      <div>
        <PageHeader
          title={displayNameOf(selectedProfile)}
          subtitle="Séances de votre ami (lecture seule)"
          back
          actions={
            <Button
              size="sm"
              variant="danger"
              disabled={busyId === selected?.id}
              onClick={() => {
                if (!selected) return
                if (!window.confirm(`Retirer ${displayNameOf(selectedProfile)} de vos amis ?`)) return
                void act(selected.id, removeFriendship, 'Ami retiré').then(() => setSelectedId(null))
              }}
            >
              <UserX size={14} /> Retirer
            </Button>
          }
        />
        <Page className="max-w-3xl space-y-4 pb-10">
          <Card className="flex items-center gap-3 p-4">
            <Avatar profile={selectedProfile} size={56} />
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold">{displayNameOf(selectedProfile)}</p>
              <p className="text-xs text-muted">{done.length} séance(s) récente(s) partagée(s)</p>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Séances" value={done.length} />
            <Stat label="Séries" value={fSets} />
            <Stat
              label="Volume"
              value={Math.round(kgToDisplay(fVolume, settings.unit)).toLocaleString('fr-FR')}
              sub={settings.unit}
            />
            <Stat label="Temps" value={formatDuration(fTime, 'compact')} />
          </div>

          <div>
            <SectionTitle>Séances récentes</SectionTitle>
            {loadingWorkouts ? (
              <p className="text-sm text-muted">Chargement…</p>
            ) : done.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Dumbbell size={24} />}
                  title="Aucune séance partagée"
                  message="Votre ami n'a pas encore de séance terminée synchronisée."
                />
              </Card>
            ) : (
              <div className="space-y-2">
                {done.map((w) => (
                  <div key={w.id}>
                    <button
                      type="button"
                      onClick={() => setOpenWorkoutId(openWorkoutId === w.id ? null : w.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
                        <Dumbbell size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{w.name}</span>
                        <span className="block text-[11px] text-muted">
                          {formatDate(w.startedAt)} · {workoutSets(w)} séries ·{' '}
                          {Math.round(kgToDisplay(workoutVolume(w), settings.unit)).toLocaleString('fr-FR')}{' '}
                          {settings.unit} · {formatDuration(workoutDurationSeconds(w), 'compact')}
                        </span>
                      </span>
                      <ChevronLeft
                        size={16}
                        className={`text-muted transition-transform ${openWorkoutId === w.id ? 'rotate-90' : '-rotate-90'}`}
                      />
                    </button>
                    {openWorkoutId === w.id && openWorkout && (
                      <Card className="mt-1 space-y-3 p-3">
                        {openWorkout.exercises.map((we) => {
                          const sets = we.sets.filter((s) => s.completed)
                          if (!sets.length) return null
                          return (
                            <div key={we.id}>
                              <p className="text-[13px] font-bold">
                                {we.exerciseName ?? 'Exercice'} · {sets.length} série(s)
                              </p>
                              <ul className="mt-1 space-y-0.5">
                                {sets.map((s) => (
                                  <li key={s.id} className="text-xs text-muted">
                                    {[s.weight !== undefined ? `${kgToDisplay(s.weight, settings.unit)} ${settings.unit}` : null,
                                      s.reps !== undefined ? `${s.reps} reps` : null,
                                      s.duration !== undefined ? formatDuration(s.duration, 'compact') : null,
                                      s.distance !== undefined ? `${Math.round(s.distance)} m` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' × ') || '—'}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })}
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Page>
      </div>
    )
  }

  /* --------------------------------- liste --------------------------------- */
  return (
    <div>
      <PageHeader title="Amis" subtitle="Partagez vos séances entre amis" />
      <Page className="max-w-3xl space-y-4 pb-10">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'friends', label: `Amis (${friends.length})`, icon: <Users size={14} /> },
            { value: 'requests', label: `Demandes (${received.length})`, icon: <Mail size={14} /> },
            { value: 'add', label: 'Ajouter', icon: <UserPlus size={14} /> },
          ]}
        />

        {loading ? (
          <p className="text-sm text-muted">Chargement…</p>
        ) : tab === 'friends' ? (
          friends.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Users size={24} />}
                title="Aucun ami pour l'instant"
                message="Ajoutez un ami avec son adresse email : dès qu'il accepte, vous verrez ses séances ici."
                action={
                  <Button variant="primary" onClick={() => setTab('add')}>
                    <UserPlus size={16} /> Ajouter un ami
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => {
                const uid = f.requester === myId ? f.addressee : f.requester
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => void openFriend(uid)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
                  >
                    <Avatar profile={f.other} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{displayNameOf(f.other)}</span>
                      <span className="block text-[11px] text-muted">Voir ses séances →</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )
        ) : tab === 'requests' ? (
          <div className="space-y-4">
            <div>
              <SectionTitle>Reçues ({received.length})</SectionTitle>
              {received.length === 0 ? (
                <p className="text-sm text-muted">Aucune demande reçue.</p>
              ) : (
                <div className="space-y-2">
                  {received.map((f) => (
                    <Card key={f.id} className="flex items-center gap-3 p-3">
                      <Avatar profile={f.other} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{displayNameOf(f.other)}</span>
                        <span className="block text-[11px] text-muted">Veut vous ajouter en ami</span>
                      </span>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busyId === f.id}
                        onClick={() => void act(f.id, acceptFriendRequest, 'Ami ajouté !')}
                      >
                        <Check size={14} /> Accepter
                      </Button>
                      <Button size="sm" variant="danger" disabled={busyId === f.id} onClick={() => void act(f.id, removeFriendship, 'Demande refusée')}>
                        <X size={14} />
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <div>
              <SectionTitle>Envoyées ({sent.length})</SectionTitle>
              {sent.length === 0 ? (
                <p className="text-sm text-muted">Aucune demande en attente.</p>
              ) : (
                <div className="space-y-2">
                  {sent.map((f) => (
                    <Card key={f.id} className="flex items-center gap-3 p-3">
                      <Avatar profile={f.other} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{displayNameOf(f.other)}</span>
                        <span className="block text-[11px] text-muted">En attente…</span>
                      </span>
                      <Button size="sm" disabled={busyId === f.id} onClick={() => void act(f.id, removeFriendship, 'Demande annulée')}>
                        Annuler
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <Card className="space-y-3 p-4">
            <SectionTitle className="mb-0">Ajouter par email</SectionTitle>
            <p className="text-sm text-muted">
              Entrez l’adresse Google exacte de votre ami (celle de son compte VeryHevy).
            </p>
            <div className="flex gap-2">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void search()
                }}
                placeholder="ami@gmail.com"
                inputMode="email"
                autoComplete="off"
              />
              <Button variant="primary" disabled={searching || !email.trim()} onClick={() => void search()}>
                Chercher
              </Button>
            </div>
            {found === null && (
              <p className="text-sm text-danger">Aucun compte VeryHevy avec cet email.</p>
            )}
            {found && (
              <Card className="flex items-center gap-3 border-accent-line bg-accent-soft p-3">
                <Avatar profile={found} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{displayNameOf(found)}</span>
                </span>
                <Button size="sm" variant="primary" disabled={busyId === found.id} onClick={() => void invite()}>
                  <UserPlus size={14} /> Ajouter
                </Button>
              </Card>
            )}
          </Card>
        )}
      </Page>
    </div>
  )
}
