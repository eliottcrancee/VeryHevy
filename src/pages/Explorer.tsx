import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  CalendarPlus,
  Check,
  CloudOff,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import type { SocialProfile, SportSession } from '@/types'
import {
  createSession,
  deleteSession,
  inviteToSession,
  joinSession,
  leaveSession,
  listInviteCandidates,
  listSessions,
  searchPlaces,
  type PlaceResult,
} from '@/lib/sessions'
import { listMyFollowIds } from '@/lib/social'
import {
  acceptRequest,
  declineRequest,
  displayNameOf,
  listMembers,
  listMessages,
  listPublicParticipants,
  listRequests,
  listThreads,
  myRequestStatus,
  sendMessage,
  sendRequest,
  withdrawRequest,
  type ChatMessage,
  type SessionMember,
  type SessionRequest,
  type Thread,
} from '@/lib/chat'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Chip, EmptyState, Field, Input, Modal, Select, Tabs, Textarea } from '@/components/ui'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

const FRANCE: [number, number] = [46.603354, 1.888334]

type DayFilter = 'all' | 'today' | 'tomorrow' | 'weekend'
type View = 'carte' | 'reco' | 'messages'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function dayMatches(iso: string, f: DayFilter): boolean {
  if (f === 'all') return true
  const d = new Date(iso)
  const now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  if (f === 'today') return day(d) === day(now)
  if (f === 'tomorrow') return day(d) === day(now) + 86400000
  const dow = d.getDay()
  const isWeekend = dow === 0 || dow === 6
  const sameWeek = day(d) - day(now) < 7 * 86400000 && day(d) >= day(now)
  return isWeekend && sameWeek
}

function pinIcon(s: SportSession, me: string | undefined, selected: boolean): L.DivIcon {
  const full = s.spots_taken >= s.spots_total
  const mine = s.host === me
  const bg = mine ? '#4f83ff' : full ? '#ef4444' : s.visibility === 'private' ? '#8b5cf6' : '#16a34a'
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;gap:2px;background:${bg};color:#fff;font-weight:800;font-size:11px;border-radius:999px;padding:3px 8px;border:${selected ? '3px solid #fff' : '2px solid rgba(255,255,255,.7)'};box-shadow:0 2px 8px rgba(0,0,0,.4);white-space:nowrap">💪 ${s.spots_taken}/${s.spots_total}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

const ME_ICON = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#4f83ff;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function ClickCatcher({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(Number(e.latlng.lat.toFixed(5)), Number(e.latlng.lng.toFixed(5)))
    },
  })
  return null
}

function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 14, { duration: 0.8 })
  }, [map, target])
  return null
}

export interface ActiveThread {
  sessionId: string
  title: string
  otherId: string
  other: SocialProfile | null
}

/* ------------------------------------------------------------------ */

export default function ExplorerPage() {
  const { cloudEnabled, user } = useAuth()
  const notify = useStore((s) => s.notify)

  const [view, setView] = useState<View>('carte')
  const [sessions, setSessions] = useState<SportSession[]>([])
  const [followIds, setFollowIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [dayFilter, setDayFilter] = useState<DayFilter>('all')
  const [recoQuery, setRecoQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(FRANCE)
  const [zoom, setZoom] = useState(6)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [thread, setThread] = useState<ActiveThread | null>(null)
  const located = useRef(false)

  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = async () => {
    if (!cloudEnabled) return
    setLoading(true)
    try {
      const [list, follows] = await Promise.all([listSessions(), listMyFollowIds().catch(() => new Set<string>())])
      setSessions(list)
      setFollowIds(follows)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Carte illisible', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudEnabled])

  /* Géolocalisation auto au premier affichage (silencieuse si refusée). */
  useEffect(() => {
    if (located.current || !('geolocation' in navigator)) return
    located.current = true
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserPos(c)
        setCenter(c)
        setZoom(13)
        setFlyTo({ lat: c[0], lng: c[1], zoom: 13 })
      },
      () => {},
      { timeout: 8000 },
    )
  }, [])

  const onQuery = (v: string) => {
    setQ(v)
    if (debounce.current) clearTimeout(debounce.current)
    if (v.trim().length < 3) {
      setResults([])
      return
    }
    debounce.current = setTimeout(async () => {
      setSearching(true)
      try {
        setResults(await searchPlaces(v))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 500)
  }

  const goPlace = (p: PlaceResult) => {
    setResults([])
    setQ(p.label.split(',').slice(0, 2).join(','))
    setPicked({ lat: p.lat, lng: p.lng })
    setFlyTo({ lat: p.lat, lng: p.lng, zoom: 14 })
  }

  const locate = () => {
    if (!('geolocation' in navigator)) {
      notify('Géolocalisation indisponible', 'error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserPos(c)
        setCenter(c)
        setZoom(13)
        setFlyTo({ lat: c[0], lng: c[1], zoom: 13 })
      },
      () => notify('Position refusée — déplace la carte à la main', 'error'),
      { timeout: 8000 },
    )
  }

  const visible = useMemo(
    () => sessions.filter((s) => dayMatches(s.starts_at, dayFilter)),
    [sessions, dayFilter],
  )
  const invited = useMemo(() => visible.filter((s) => s.visibility === 'private'), [visible])
  const selected = sessions.find((s) => s.id === selectedId) ?? null

  /* Recommandations : amis d'abord, puis date ; recherche texte. */
  const reco = useMemo(() => {
    const needle = recoQuery.trim().toLowerCase()
    return sessions
      .filter((s) => {
        if (!needle) return true
        return `${s.title} ${s.gym_name} ${s.address_text} ${s.description}`.toLowerCase().includes(needle)
      })
      .slice()
      .sort((a, b) => {
        const fa = followIds.has(a.host) ? 0 : 1
        const fb = followIds.has(b.host) ? 0 : 1
        if (fa !== fb) return fa - fb
        return +new Date(a.starts_at) - +new Date(b.starts_at)
      })
  }, [sessions, recoQuery, followIds])

  const openThread = (t: ActiveThread) => {
    setThread(t)
    setView('messages')
  }

  const act = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusyId(id)
    try {
      await fn()
      notify(ok, 'success')
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (!cloudEnabled) {
    return (
      <div>
        <PageHeader title="Explorer" subtitle="La carte des séances" />
        <Page className="max-w-3xl">
          <Card>
            <EmptyState
              icon={<CloudOff size={24} />}
              title="La carte nécessite le cloud"
              message="Connecte-toi avec Google pour voir et proposer des séances."
            />
          </Card>
        </Page>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Explorer"
        subtitle="Séances autour de toi — rejoins ou propose"
        actions={
          <>
            <IconButton label="Me localiser" onClick={locate}>
              <LocateFixed size={20} />
            </IconButton>
            <IconButton label="Proposer une séance" onClick={() => setCreateOpen(true)}>
              <Plus size={22} />
            </IconButton>
          </>
        }
      >
        <div className="mx-auto w-full max-w-5xl space-y-2 px-4 pb-3">
          {/* Même style que les onglets du Profil : compact, une ligne. */}
          <Tabs<View>
            value={view}
            onChange={setView}
            tabs={[
              { value: 'carte', label: 'Carte', icon: <MapIcon size={14} /> },
              { value: 'reco', label: 'Recommandations', icon: <Sparkles size={14} /> },
              { value: 'messages', label: 'Messages', icon: <MessageCircle size={14} /> },
            ]}
          />
          {view === 'carte' && (
            <>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Ville, salle… (ex. Basic-Fit Lyon)" className="pl-9" />
                {(searching || results.length > 0) && (
                  <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
                    {searching && <p className="px-3 py-2 text-xs text-muted">Recherche…</p>}
                    {results.map((r, i) => (
                      <button key={i} type="button" onClick={() => goPlace(r)} className="block w-full truncate px-3 py-2 text-left text-[13px] hover:bg-surface-2">
                        📍 {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
                <Chip active={dayFilter === 'all'} onClick={() => setDayFilter('all')}>Tout</Chip>
                <Chip active={dayFilter === 'today'} onClick={() => setDayFilter('today')}>Aujourd’hui</Chip>
                <Chip active={dayFilter === 'tomorrow'} onClick={() => setDayFilter('tomorrow')}>Demain</Chip>
                <Chip active={dayFilter === 'weekend'} onClick={() => setDayFilter('weekend')}>Ce week-end</Chip>
              </div>
            </>
          )}
        </div>
      </PageHeader>

      <Page className="max-w-5xl space-y-3 pb-10">
        {view === 'messages' ? (
          <MessagesView
            initial={thread}
            onConsumeInitial={() => setThread(null)}
            onBack={() => setView('carte')}
          />
        ) : view === 'reco' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input value={recoQuery} onChange={(e) => setRecoQuery(e.target.value)} placeholder="Titre, salle, ville…" className="pl-9" />
            </div>
            <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
              D’abord tes abonnements ({loading ? '…' : reco.length})
            </p>
            {loading ? (
              <p className="text-sm text-muted">Chargement…</p>
            ) : reco.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<MapPin size={24} />}
                  title="Rien pour l'instant"
                  message="Suis des sportifs pour voir leurs séances ici en premier, ou propose la tienne."
                  action={<Button variant="primary" onClick={() => setCreateOpen(true)}><CalendarPlus size={16} /> Proposer une séance</Button>}
                />
              </Card>
            ) : (
              reco.map((s) => (
                <div key={s.id} className="space-y-2">
                  <SessionRow
                    s={s}
                    me={user?.id}
                    friend={followIds.has(s.host)}
                    selected={s.id === selectedId}
                    onSelect={() => setSelectedId(s.id === selectedId ? null : s.id)}
                  />
                  {selectedId === s.id && (
                    <SessionDetail
                      s={s}
                      me={user?.id}
                      busy={busyId === s.id}
                      onClose={() => setSelectedId(null)}
                      onChanged={() => void reload()}
                      onChat={(t) => openThread(t)}
                      act={act}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            {/* relative z-0 : contexte d'empilement pour que les panneaux
                Leaflet (z-index internes élevés) restent SOUS les modales. */}
            <div className="relative z-0 overflow-hidden rounded-2xl border border-line">
              <MapContainer center={center} zoom={zoom} style={{ height: '52vh', minHeight: 320, width: '100%' }} scrollWheelZoom>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickCatcher onPick={(lat, lng) => setPicked({ lat, lng })} />
                <FlyTo target={flyTo} />
                {visible.filter((s) => s.visibility === 'public').map((s) => (
                  <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon(s, user?.id, s.id === selectedId)} eventHandlers={{ click: () => setSelectedId(s.id) }} />
                ))}
                {userPos && <Marker position={userPos} icon={ME_ICON} interactive={false} />}
                {picked && (
                  <Marker
                    position={[picked.lat, picked.lng]}
                    icon={L.divIcon({ className: '', html: '<div style="font-size:22px">📍</div>', iconSize: [24, 24], iconAnchor: [12, 22] })}
                  />
                )}
              </MapContainer>
            </div>

            {picked && (
              <Card className="flex items-center gap-3 p-3">
                <span className="text-xl">📍</span>
                <p className="min-w-0 flex-1 text-xs text-muted">
                  Point {picked.lat}, {picked.lng}
                </p>
                <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> Proposer ici
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Annuler</Button>
              </Card>
            )}

            {invited.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold tracking-wide text-muted uppercase">🔒 Mes invitations privées ({invited.length})</p>
                {invited.map((s) => (
                  <div key={s.id} className="space-y-2">
                    <SessionRow s={s} me={user?.id} friend={followIds.has(s.host)} selected={s.id === selectedId} onSelect={() => setSelectedId(s.id === selectedId ? null : s.id)} />
                    {selectedId === s.id && (
                      <SessionDetail s={s} me={user?.id} busy={busyId === s.id} onClose={() => setSelectedId(null)} onChanged={() => void reload()} onChat={(t) => openThread(t)} act={act} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {selected && selected.visibility === 'public' && (
              <SessionDetail
                s={selected}
                me={user?.id}
                busy={busyId === selected.id}
                onClose={() => setSelectedId(null)}
                onChanged={() => void reload()}
                onChat={(t) => openThread(t)}
                act={act}
              />
            )}

            <div className="space-y-2">
              <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                À venir ({loading ? '…' : visible.filter((s) => s.visibility === 'public').length})
              </p>
              {loading ? (
                <p className="text-sm text-muted">Chargement de la carte…</p>
              ) : visible.filter((s) => s.visibility === 'public').length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<MapPin size={24} />}
                    title="Aucune séance ici pour l'instant"
                    message="Touche la carte pour choisir un point, ou propose la tienne."
                    action={<Button variant="primary" onClick={() => setCreateOpen(true)}><CalendarPlus size={16} /> Proposer une séance</Button>}
                  />
                </Card>
              ) : (
                visible.filter((s) => s.visibility === 'public').map((s) => (
                  <div key={s.id} className="space-y-2">
                    <SessionRow
                      s={s}
                      me={user?.id}
                      friend={followIds.has(s.host)}
                      selected={s.id === selectedId}
                      onSelect={() => {
                        setSelectedId(s.id === selectedId ? null : s.id)
                        setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14 })
                      }}
                    />
                    {selectedId === s.id && (
                      <SessionDetail s={s} me={user?.id} busy={busyId === s.id} onClose={() => setSelectedId(null)} onChanged={() => void reload()} onChat={(t) => openThread(t)} act={act} />
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Page>

      <CreateSessionModal
        open={createOpen}
        picked={picked}
        onClose={() => setCreateOpen(false)}
        onCreated={(s) => {
          setCreateOpen(false)
          setPicked(null)
          void reload().then(() => {
            setSelectedId(s.id)
            setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14 })
          })
        }}
      />
    </div>
  )
}

/* ------------------------------ morceaux ------------------------------ */

function SessionRow({ s, me, friend, selected, onSelect }: { s: SportSession; me?: string; friend?: boolean; selected: boolean; onSelect: () => void }) {
  const full = s.spots_taken >= s.spots_total
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
        selected ? 'border-accent-solid bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-lg">
        {s.visibility === 'private' ? '🔒' : '💪'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-extrabold">{s.title}</span>
          {friend && <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-extrabold text-accent">Ami</span>}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {fmtDate(s.starts_at)} · {s.gym_name || 'Lieu à préciser'} · {s.spots_taken}/{s.spots_total}
          {s.host === me ? ' · ta session' : ''}
        </span>
      </span>
      <span className={cn('shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold', full ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')}>
        {full ? 'Complet' : `${s.spots_total - s.spots_taken} place(s)`}
      </span>
    </button>
  )
}

/* ------------------------- détail + match + chat ------------------------- */

function SessionDetail({ s, me, busy, onClose, onChanged, onChat, act }: {
  s: SportSession
  me?: string
  busy: boolean
  onClose: () => void
  onChanged: () => void
  onChat: (t: ActiveThread) => void
  act: (id: string, fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const notify = useStore((st) => st.notify)
  const full = s.spots_taken >= s.spots_total
  const mine = s.host === me
  const [inviteOpen, setInviteOpen] = useState(false)
  const [members, setMembers] = useState<SessionMember[] | null>(null)
  const [publicOnes, setPublicOnes] = useState<SocialProfile[]>([])
  const [requests, setRequests] = useState<SessionRequest[] | null>(null)
  const [myReq, setMyReq] = useState<SessionRequest | null | undefined>(undefined)
  const [reqMsg, setReqMsg] = useState('')
  const [reqBusy, setReqBusy] = useState(false)

  const isMember = mine || s.joined_by_me

  useEffect(() => {
    let alive = true
    if (isMember) {
      listMembers(s.id).then((m) => { if (alive) setMembers(m) }).catch(() => {})
    } else {
      listPublicParticipants(s.id).then((p) => { if (alive) setPublicOnes(p) }).catch(() => {})
    }
    if (mine) {
      listRequests(s.id).then((r) => { if (alive) setRequests(r) }).catch(() => {})
    } else if (s.visibility === 'private') {
      myRequestStatus(s.id).then((r) => { if (alive) setMyReq(r) }).catch(() => { if (alive) setMyReq(null) })
    }
    return () => { alive = false }
  }, [s.id, isMember, mine, s.visibility])

  const pending = (requests ?? []).filter((r) => r.status === 'pending')

  const join = () => {
    if (s.visibility === 'private') return
    void act(s.id, () => joinSession(s), 'Inscrit ! 🤝 Discute avec l’hôte 💬').then(onChanged)
  }

  const propose = async () => {
    setReqBusy(true)
    try {
      if (myReq?.status === 'declined') await withdrawRequest(s.id)
      await sendRequest(s.id, reqMsg, s.host)
      setMyReq(await myRequestStatus(s.id))
      setReqMsg('')
      notify('Candidature envoyée — l’hôte va te répondre 💬', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Candidature impossible', 'error')
    } finally {
      setReqBusy(false)
    }
  }

  const decide = async (r: SessionRequest, ok: boolean) => {
    setReqBusy(true)
    try {
      if (ok) {
        if (s.spots_taken >= s.spots_total) throw new Error('Session complète')
        await acceptRequest(s.id, r.user_id, s.title)
        notify(`Match avec ${displayNameOf(r.author)} 🤝 Discutez !`, 'success')
      } else {
        await declineRequest(s.id, r.user_id)
        notify('Candidature refusée', 'info')
      }
      setRequests(await listRequests(s.id))
      onChanged()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setReqBusy(false)
    }
  }

  const chatWith = (otherId: string, other: SocialProfile | null) => {
    onChat({ sessionId: s.id, title: s.title, otherId, other })
  }

  return (
    <Card className="space-y-2 border-accent-line p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">{s.title}</p>
          <p className="text-xs font-semibold text-accent">{fmtDate(s.starts_at)}</p>
          <p className="mt-0.5 text-xs text-muted">📍 {s.gym_name || 'Lieu à préciser'}</p>
          {/* Adresse exacte : membres uniquement (teaser public). */}
          {isMember && s.address_text && (
            <p className="mt-0.5 text-xs text-muted">🗺️ {s.address_text}</p>
          )}
          <p className="mt-0.5 text-xs text-muted">
            {s.visibility === 'private' ? '🔒 Privée (sur candidature)' : '🌍 Publique'} · Niveau : {s.level} ·{' '}
            {s.spots_taken}/{s.spots_total} · Par <b>{s.host_profile?.username ? `@${s.host_profile.username}` : s.host_profile?.display_name ?? 'un sportif'}</b>
          </p>
          {/* Participants : cachés aux non-membres (sauf profils publics). */}
          {!isMember && publicOnes.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              Déjà là : {publicOnes.map((p) => displayNameOf(p)).join(', ')}
              {s.spots_taken - 1 - publicOnes.length > 0 && ` +${s.spots_taken - 1 - publicOnes.length} autre(s)`}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
      {s.description && <p className="text-sm text-muted">{s.description}</p>}

      {/* Membres visibles : hôte + inscrits uniquement. */}
      {isMember && members !== null && members.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-2 p-2.5">
          <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">Inscrits ({members.length})</p>
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <b>{displayNameOf(m.profile)}</b>
                {m.user_id === s.host && <span className="ml-1 text-[10px] text-muted">(hôte)</span>}
                {m.requestMessage && <span className="block truncate text-[11px] text-muted">« {m.requestMessage} »</span>}
              </span>
              {mine && m.user_id !== me && (
                <Button size="sm" variant="ghost" onClick={() => chatWith(m.user_id, m.profile)}>
                  <MessageCircle size={14} />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {mine ? (
          <>
            {s.visibility === 'private' && (
              <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
                <Users size={14} /> Inviter
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={busy} onClick={() => {
              if (!window.confirm('Supprimer cette session ?')) return
              void act(s.id, () => deleteSession(s.id), 'Session supprimée')
            }}>Supprimer</Button>
          </>
        ) : s.joined_by_me ? (
          <>
            <Button size="sm" variant="secondary" block disabled={busy} onClick={() => void act(s.id, () => leaveSession(s.id), 'Désinscrit').then(onChanged)}>
              Se désinscrire
            </Button>
            <Button size="sm" variant="primary" block onClick={() => chatWith(s.host, s.host_profile ?? null)}>
              <MessageCircle size={14} /> Discuter avec l’hôte
            </Button>
          </>
        ) : s.visibility === 'private' ? (
          myReq === undefined ? (
            <p className="text-xs text-muted">Chargement…</p>
          ) : myReq?.status === 'pending' ? (
            <div className="flex w-full gap-2">
              <p className="flex-1 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-muted">Candidature envoyée — en attente 💬</p>
              <Button size="sm" variant="ghost" disabled={reqBusy} onClick={() => { setReqBusy(true); withdrawRequest(s.id).then(() => setMyReq(null)).catch((e) => notify(e instanceof Error ? e.message : 'Impossible', 'error')).finally(() => setReqBusy(false)) }}>
                Annuler
              </Button>
            </div>
          ) : myReq?.status === 'declined' ? (
            <div className="w-full space-y-2">
              <p className="text-xs text-muted">Candidature déclinée — tu peux retenter avec un mot :</p>
              <ProposeBox msg={reqMsg} setMsg={setReqMsg} busy={reqBusy} onSend={() => void propose()} />
            </div>
          ) : (
            <div className="w-full space-y-2">
              <ProposeBox msg={reqMsg} setMsg={setReqMsg} busy={reqBusy} onSend={() => void propose()} />
            </div>
          )
        ) : (
          <Button size="sm" variant="primary" block disabled={busy || full} onClick={join}>
            {full ? 'Complet' : 'Rejoindre 🤝'}
          </Button>
        )}
      </div>

      {/* Candidatures à valider (hôte, sessions privées). */}
      {mine && s.visibility === 'private' && (
        <div className="space-y-2 rounded-xl bg-surface-2 p-2.5">
          <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
            Candidatures ({pending.length})
          </p>
          {requests === null ? (
            <p className="text-xs text-muted">Chargement…</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-muted">Aucune pour l’instant.</p>
          ) : (
            pending.map((r) => (
              <div key={r.user_id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{displayNameOf(r.author)}</span>
                  {r.message && <span className="block truncate text-[11px] text-muted">« {r.message} »</span>}
                </span>
                <Button size="sm" variant="primary" disabled={reqBusy || full} onClick={() => void decide(r, true)}>
                  <Check size={14} />
                </Button>
                <Button size="sm" variant="ghost" disabled={reqBusy} onClick={() => void decide(r, false)}>
                  <X size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {inviteOpen && (
        <InviteBox
          session={s}
          onDone={() => {
            setInviteOpen(false)
            notify('Invitations mises à jour', 'success')
            onChanged()
          }}
        />
      )}
    </Card>
  )
}

function ProposeBox({ msg, setMsg, busy, onSend }: { msg: string; setMsg: (v: string) => void; busy: boolean; onSend: () => void }) {
  return (
    <div className="flex gap-2">
      <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Présente-toi en un mot (optionnel)…" maxLength={280} />
      <Button size="sm" variant="primary" disabled={busy} onClick={onSend}>Se proposer 🙋</Button>
    </div>
  )
}

/* ------------------------------ messages ------------------------------ */

function MessagesView({ initial, onConsumeInitial, onBack }: {
  initial: ActiveThread | null
  onConsumeInitial: () => void
  onBack: () => void
}) {
  const notify = useStore((s) => s.notify)
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<ActiveThread | null>(null)

  const reload = async () => {
    try {
      setThreads(await listThreads())
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Messages illisibles', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initial) {
      setActive(initial)
      onConsumeInitial()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  if (active) {
    return <ConversationView t={active} onBack={() => { setActive(null); void reload() }} />
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Discussions ({loading ? '…' : threads.length})</p>
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : threads.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageCircle size={24} />}
            title="Aucune discussion"
            message="Rejoins une séance publique ou fais accepter ta candidature : la discussion s’ouvre ici pour faire connaissance avant le rendez-vous."
            action={<Button variant="primary" size="sm" onClick={onBack}>Voir la carte</Button>}
          />
        </Card>
      ) : (
        threads.map((t) => (
          <button
            key={`${t.session_id}:${t.other_id}`}
            type="button"
            onClick={() => setActive({ sessionId: t.session_id, title: t.session_title, otherId: t.other_id, other: t.other })}
            className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-extrabold text-accent">
              {(t.other?.username ?? t.other?.display_name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold">{displayNameOf(t.other)}</span>
              <span className="block truncate text-[11px] text-muted">
                {t.session_title} · {t.last.text}
              </span>
            </span>
            <span className="shrink-0 text-[10px] text-muted">{fmtTime(t.last.created_at)}</span>
          </button>
        ))
      )}
    </div>
  )
}

function ConversationView({ t, onBack }: { t: ActiveThread; onBack: () => void }) {
  const { user } = useAuth()
  const notify = useStore((s) => s.notify)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const load = async (silent = false) => {
    try {
      const list = await listMessages(t.sessionId, t.otherId)
      setMsgs(list)
      if (!silent) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch (err) {
      if (!silent) notify(err instanceof Error ? err.message : 'Discussion illisible', 'error')
    }
  }

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(true), 5000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.sessionId, t.otherId])

  const send = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const m = await sendMessage(t.sessionId, t.otherId, draft)
      setMsgs((l) => [...l, m])
      setDraft('')
      bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Envoi impossible', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="flex min-h-[420px] flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line p-3">
        <Button size="sm" variant="ghost" onClick={onBack}>←</Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{displayNameOf(t.other)}</p>
          <p className="truncate text-[11px] text-muted">{t.title}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {msgs.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">
            Match 🤝 Dis bonjour et organisez votre séance !
          </p>
        )}
        {msgs.map((m) => {
          const mine = m.from_id === user?.id
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[80%] rounded-2xl px-3 py-2 text-[13px]',
                mine ? 'bg-accent-solid text-accent-contrast' : 'bg-surface-2 text-ink',
              )}>
                {m.text}
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      <div className="flex gap-2 border-t border-line p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
          placeholder="Écris un message…"
          maxLength={1000}
        />
        <Button variant="primary" size="sm" disabled={sending || !draft.trim()} onClick={() => void send()}>
          <Send size={16} />
        </Button>
      </div>
    </Card>
  )
}

/* ------------------------------ création ------------------------------ */

function InviteBox({ session, onDone }: { session: SportSession; onDone: () => void }) {
  const notify = useStore((s) => s.notify)
  const [candidates, setCandidates] = useState<SocialProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string[]>(session.invited ?? [])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    listInviteCandidates()
      .then(setCandidates)
      .catch((err) => notify(err instanceof Error ? err.message : 'Contacts illisibles', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const save = async () => {
    setSaving(true)
    try {
      await inviteToSession(session.id, picked)
      onDone()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Invitation impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-xs text-muted">Chargement des contacts…</p>
  if (!candidates.length) return <p className="text-xs text-muted">Suis des sportifs pour pouvoir les inviter.</p>

  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <p className="text-xs font-extrabold">Inviter (session privée)</p>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {candidates.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
            <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[var(--accent)]" />
            <span className="font-bold">@{c.username ?? c.display_name ?? '?'}</span>
          </label>
        ))}
      </div>
      <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
        {saving ? 'Enregistrement…' : `Inviter (${picked.length})`}
      </Button>
    </div>
  )
}

function CreateSessionModal({ open, picked, onClose, onCreated }: {
  open: boolean
  picked: { lat: number; lng: number } | null
  onClose: () => void
  onCreated: (s: SportSession) => void
}) {
  const notify = useStore((s) => s.notify)
  const [title, setTitle] = useState('Push — pecs / épaules')
  const [gym, setGym] = useState('')
  const [address, setAddress] = useState('')
  const [day, setDay] = useState('1')
  const [hour, setHour] = useState('19:00')
  const [spots, setSpots] = useState('3')
  const [level, setLevel] = useState('tous')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const [candidates, setCandidates] = useState<SocialProfile[]>([])
  const [invited, setInvited] = useState<string[]>([])

  useEffect(() => {
    if (open && visibility === 'private' && candidates.length === 0) {
      listInviteCandidates().then(setCandidates).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibility])

  if (!open) return null

  const submit = async () => {
    if (!picked) {
      notify('Touche la carte pour placer ta séance (ou cherche un lieu)', 'error')
      return
    }
    const [h, m] = hour.split(':').map(Number)
    const d = new Date()
    d.setDate(d.getDate() + Number(day))
    d.setHours(h || 19, m || 0, 0, 0)
    if (d.getTime() < Date.now() - 5 * 60 * 1000) {
      notify('Choisis une date à venir', 'error')
      return
    }
    setSaving(true)
    try {
      const s = await createSession({
        title: title.trim() || 'Séance ouverte',
        gym_name: gym.trim() || 'Salle à préciser en privé',
        address_text: address.trim(),
        lat: picked.lat,
        lng: picked.lng,
        starts_at: d.toISOString(),
        spots_total: Number(spots) || 3,
        level,
        description: desc.trim(),
        visibility,
        invited: visibility === 'private' ? invited : [],
      })
      notify(visibility === 'public' ? 'Session publiée sur la carte 🎉' : 'Session privée créée 🔒', 'success')
      onCreated(s)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Proposer une séance">
      <div className="space-y-3">
        {!picked && (
          <p className="rounded-xl bg-warning/10 p-2.5 text-xs font-semibold text-warning">
            Aucun point choisi : touche la carte ou cherche un lieu, puis reviens ici.
          </p>
        )}
        {picked && (
          <p className="text-xs text-muted">📍 {picked.lat}, {picked.lng}</p>
        )}
        <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Salle / lieu" hint="Nom libre, ex. Basic-Fit Part-Dieu">
          <Input value={gym} onChange={(e) => setGym(e.target.value)} placeholder="Ma salle habituelle…" />
        </Field>
        <Field label="Adresse exacte" hint="Visible uniquement par les inscrits">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue des Sports" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Jour">
            <Select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="0">Aujourd’hui</option>
              <option value="1">Demain</option>
              <option value="2">Dans 2 j</option>
              <option value="3">Dans 3 j</option>
              <option value="6">Dans 6 j</option>
            </Select>
          </Field>
          <Field label="Heure"><Input type="time" value={hour} onChange={(e) => setHour(e.target.value)} /></Field>
          <Field label="Places">
            <Select value={spots} onChange={(e) => setSpots(e.target.value)}>
              {['2', '3', '4', '5', '6'].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Niveau">
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="tous">Tous niveaux</option>
              <option value="débutant">Débutant</option>
              <option value="intermédiaire">Intermédiaire</option>
              <option value="confirmé">Confirmé</option>
            </Select>
          </Field>
          <Field label="Visibilité">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
              <option value="public">🌍 Publique (direct)</option>
              <option value="private">🔒 Privée (candidature)</option>
            </Select>
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          {visibility === 'public'
            ? 'Inscription directe, sans validation.'
            : 'Les sportifs se proposent, tu acceptes → match + discussion privée.'}
        </p>
        {visibility === 'private' && (
          <Field label="Invités">
            {candidates.length === 0 ? (
              <p className="text-xs text-muted">Suis des sportifs pour les inviter.</p>
            ) : (
              <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-xl border border-line p-2">
                {candidates.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={invited.includes(c.id)}
                      onChange={() => setInvited((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="font-bold">@{c.username ?? c.display_name ?? '?'}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
        )}
        <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} maxLength={500} placeholder="Séance ouverte, on s'adapte aux niveaux…" /></Field>
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={onClose}>Annuler</Button>
          <Button variant="primary" block disabled={saving} onClick={() => void submit()}>
            {saving ? 'Publication…' : 'Publier'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
