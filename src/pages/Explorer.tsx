import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  CalendarCheck,
  Check,
  CloudOff,
  LocateFixed,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/store/store'
import type { SessionVisibility, SocialProfile, SportSession } from '@/types'
import {
  createSession,
  deleteSession,
  isSessionPast,
  leaveSession,
  listInviteCandidates,
  listPastSessions,
  searchPlaces,
  updateSession,
  type PlaceResult,
} from '@/lib/sessions'
import { listMyFollowIds } from '@/lib/social'
import { countUnreadMessages, markMessagesRead } from '@/lib/notifications'
import {
  acceptInvite,
  acceptRequest,
  cancelInvite,
  declineInvite,
  declineRequest,
  displayNameOf,
  listMembers,
  listMessages,
  listMyInvites,
  listMyPendingRequests,
  listPublicParticipants,
  listRequests,
  listSessionInvites,
  listThreads,
  myInviteStatus,
  myRequestStatus,
  sendInvite,
  sendMessage,
  sendRequest,
  withdrawRequest,
  type ChatMessage,
  type MyInvite,
  type MyPendingRequest,
  type SessionInvite,
  type SessionMember,
  type SessionRequest,
  type Thread,
} from '@/lib/chat'
import { Page, PageHeader } from '@/components/PageHeader'
import { ProfileAvatar, ProfileLine, profileLinkOf, profileNameOf } from '@/components/ProfileAvatar'
import { Button, Card, Chip, EmptyState, Field, Input, Modal, Select, Tabs, Textarea } from '@/components/ui'
import { IconButton } from '@/components/ui'
import { ReportDialog } from '@/components/ReportDialog'
import { loadSessions, peekSessions } from '@/lib/pagePreload'
import { cn } from '@/lib/utils'

const FRANCE: [number, number] = [46.603354, 1.888334]

type DayFilter = 'all' | 'today' | 'tomorrow' | 'weekend'
type View = 'carte' | 'reco' | 'mine' | 'messages'

/** Regroupe les points proches en clusters (grille selon le zoom). */
interface Cluster {
  key: string
  lat: number
  lng: number
  sessions: SportSession[]
}

function clusterize(list: SportSession[], zoom: number): Cluster[] {
  if (zoom >= 12 || list.length < 8) {
    return list.map((s) => ({ key: s.id, lat: s.lat, lng: s.lng, sessions: [s] }))
  }
  const cell = 90 / Math.pow(2, zoom)
  const cells = new Map<string, SportSession[]>()
  for (const s of list) {
    const k = `${Math.floor(s.lat / cell)}:${Math.floor(s.lng / cell)}`
    const arr = cells.get(k)
    if (arr) arr.push(s)
    else cells.set(k, [s])
  }
  return [...cells.entries()].map(([key, arr]) => ({
    key,
    lat: arr.reduce((n, s) => n + s.lat, 0) / arr.length,
    lng: arr.reduce((n, s) => n + s.lng, 0) / arr.length,
    sessions: arr,
  }))
}

function clusterIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:#4f83ff;color:#fff;font-weight:800;font-size:13px;border:2px solid rgba(255,255,255,.8);box-shadow:0 2px 8px rgba(0,0,0,.4)">${n}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Distance vol d'oiseau en km. */
function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLa = rad(bLat - aLat)
  const dLn = rad(bLng - aLng)
  const a =
    Math.sin(dLa / 2) * Math.sin(dLa / 2) +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLn / 2) * Math.sin(dLn / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

function fmtDistance(km: number): string {
  return km < 1 ? `à ${Math.max(50, Math.round(km * 1000 / 50) * 50)} m` : `à ${km.toFixed(km < 10 ? 1 : 0)} km`
}

function dayMatches(iso: string, f: DayFilter): boolean {  if (f === 'all') return true
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
  const bg = mine ? '#4f83ff' : full ? '#ef4444' : s.visibility === 'open' ? '#8b5cf6' : s.visibility === 'invite' ? '#0ea5e9' : '#16a34a'
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

/** Suit la zone visible de la carte (bounds + zoom) pour filtrer la liste. */
export interface MapViewport {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
  zoom: number
}

function BoundsTracker({ onChange }: { onChange: (v: MapViewport) => void }) {
  const map = useMap()
  const push = () => {
    const b = map.getBounds()
    onChange({
      minLat: b.getSouth(),
      maxLat: b.getNorth(),
      minLng: b.getWest(),
      maxLng: b.getEast(),
      zoom: map.getZoom(),
    })
  }
  useMapEvents({ moveend: push, zoomend: push })
  useEffect(() => {
    push()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])
  return null
}

export interface ActiveThread {
  sessionId: string | null
  title: string
  otherId: string
  other: SocialProfile | null
}

function mapViewKey(userId?: string): string {
  return `veryhevy-map-view:${userId ?? 'local'}`
}

function savedMapView(userId?: string): { center: [number, number]; zoom: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(mapViewKey(userId)) ?? 'null')
    if (Array.isArray(saved?.center) && saved.center.length === 2
      && saved.center.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))
      && typeof saved.zoom === 'number' && saved.zoom >= 3 && saved.zoom <= 18) {
      return saved as { center: [number, number]; zoom: number }
    }
  } catch { /* stockage indisponible */ }
  return { center: FRANCE, zoom: 6 }
}

/* ------------------------------------------------------------------ */

export default function ExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { cloudEnabled, user } = useAuth()
  const notify = useStore((s) => s.notify)

  const [view, setView] = useState<View>('carte')
  const [sessions, setSessions] = useState<SportSession[]>(() => user ? (peekSessions(user.id) ?? []) : [])
  const [followIds, setFollowIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(() => !user || !peekSessions(user.id))
  const [dayFilter, setDayFilter] = useState<DayFilter>('all')
  const [recoQuery, setRecoQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [initialMap] = useState(() => savedMapView(user?.id))
  const [center, setCenter] = useState<[number, number]>(initialMap.center)
  const [zoom, setZoom] = useState(initialMap.zoom)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [viewport, setViewport] = useState<MapViewport | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [thread, setThread] = useState<ActiveThread | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)

  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = async () => {
    if (!cloudEnabled || !user) return
    if (!peekSessions(user.id)) setLoading(true)
    try {
      const [list, follows] = await Promise.all([
        loadSessions(user.id, true),
        listMyFollowIds().catch(() => new Set<string>()),
      ])
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
  }, [cloudEnabled, user?.id])

  useEffect(() => {
    if (!cloudEnabled || !user) return
    const refresh = () => { void countUnreadMessages().then(setUnreadMessages) }
    refresh()
    const id = setInterval(refresh, 30_000)
    return () => clearInterval(id)
  }, [cloudEnabled, user?.id])

  useEffect(() => {
    const messageId = searchParams.get('message')
    if (messageId) {
      setThread({ sessionId: null, title: 'Message direct', otherId: messageId, other: null })
      setView('messages')
      setSearchParams({}, { replace: true })
      return
    }
    const sessionId = searchParams.get('session')
    if (!sessionId || loading) return
    const s = sessions.find((item) => item.id === sessionId)
    if (s) {
      setSelectedId(s.id)
      setView(s.visibility === 'invite' ? 'mine' : 'carte')
      setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14 })
    }
    setSearchParams({}, { replace: true })
  }, [searchParams, sessions, loading, setSearchParams])

  /* La carte reprend la dernière zone consultée. La localisation reste volontaire. */
  useEffect(() => {
    if (!viewport) return
    const next = { center: [(viewport.minLat + viewport.maxLat) / 2,
      (viewport.minLng + viewport.maxLng) / 2], zoom: viewport.zoom }
    try { localStorage.setItem(mapViewKey(user?.id), JSON.stringify(next)) } catch { /* privé */ }
  }, [viewport, user?.id])

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
  /* Liste carte = sessions open/public dans la zone visible (+25 % marge).
     Les privées vivent dans l'onglet Mes séances, pas ici. */
  const inZone = useMemo(() => {
    const base = visible.filter((s) => s.visibility !== 'invite')
    if (!viewport) return base
    const dLat = (viewport.maxLat - viewport.minLat) * 0.25
    const dLng = (viewport.maxLng - viewport.minLng) * 0.25
    return base.filter(
      (s) =>
        s.lat >= viewport.minLat - dLat &&
        s.lat <= viewport.maxLat + dLat &&
        s.lng >= viewport.minLng - dLng &&
        s.lng <= viewport.maxLng + dLng,
    )
  }, [visible, viewport])
  const clusters = useMemo(
    () => clusterize(inZone, viewport?.zoom ?? 6),
    [inZone, viewport],
  )

  /* Recommandations : abonnements d'abord, puis proximité.
     Les sessions anonymes (open) ne vont jamais dans "abonnements"
     (sinon ça trahirait l'hôte). */
  const recoBase = useMemo(() => {
    const needle = recoQuery.trim().toLowerCase()
    return sessions.filter((s) => {
      if (s.visibility === 'invite') return false
      if (!needle) return true
      return `${s.title} ${s.gym_name} ${s.address_text} ${s.description}`.toLowerCase().includes(needle)
    })
  }, [sessions, recoQuery])
  const recoFriends = useMemo(
    () =>
      recoBase
        .filter((s) => s.visibility !== 'open' && followIds.has(s.host))
        .slice()
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
    [recoBase, followIds],
  )
  const recoNear = useMemo(() => {
    const rest = recoBase.filter((s) => s.visibility === 'open' || !followIds.has(s.host))
    const withDist = rest.map((s) => ({
      s,
      d: userPos ? kmBetween(userPos[0], userPos[1], s.lat, s.lng) : null,
    }))
    withDist.sort((a, b) => {
      if (a.d !== null && b.d !== null && Math.abs(a.d - b.d) > 0.05) return a.d - b.d
      return +new Date(a.s.starts_at) - +new Date(b.s.starts_at)
    })
    return withDist
  }, [recoBase, followIds, userPos])

  const openThread = (t: ActiveThread) => {
    setThread(t)
    setView('messages')
  }

  /* Tap sur un pin → la ligne correspondante se déplie + scroll jusqu'à elle.
     Le détail ne s'affiche qu'à un seul endroit (jamais en double). */
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  useEffect(() => {
    if (selectedId) {
      rowRefs.current.get(selectedId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedId])

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
        subtitle="Touche la carte pour proposer une séance"
        actions={
          <div className="flex items-center gap-1">
            <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> Proposer
            </Button>
            <IconButton label="Me localiser" onClick={locate}>
              <LocateFixed size={20} />
            </IconButton>
          </div>
        }
      >
        <div className="mx-auto w-full max-w-5xl space-y-2 px-4 pb-3">
          <Tabs<View>
            value={view}
            onChange={setView}
            className="w-full [&>button]:shrink-0 [&>button]:whitespace-nowrap [&>button]:px-2"
            tabs={[
              { value: 'carte', label: 'Carte' },
              { value: 'reco', label: 'Pour toi' },
              { value: 'mine', label: 'Mes séances' },
              { value: 'messages', label: unreadMessages ? `Messages · ${unreadMessages}` : 'Messages' },
            ]}
          />
        </div>
      </PageHeader>

      <Page className="max-w-5xl space-y-3 pb-10">
        {view === 'messages' ? (
          <MessagesView
            initial={thread}
            onConsumeInitial={() => setThread(null)}
            onBack={() => setView('carte')}
          />
        ) : view === 'mine' ? (
          <MySessionsView
            sessions={sessions}
            initialSelectedId={selectedId}
            followIds={followIds}
            busyId={busyId}
            onChanged={() => void reload()}
            onChat={(t) => openThread(t)}
            act={act}
          />
        ) : view === 'reco' ? (
          <div className="space-y-4">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input value={recoQuery} onChange={(e) => setRecoQuery(e.target.value)} placeholder="Titre, salle, ville…" className="pl-9" />
            </div>
            {loading ? (
              <p className="text-sm text-muted">Chargement…</p>
            ) : recoFriends.length === 0 && recoNear.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<MapPin size={24} />}
                  title="Rien pour l'instant"
                  message="Suis des sportifs pour voir leurs séances ici en premier, ou place un point sur la carte."
                  action={<Button variant="primary" onClick={() => setView('carte')}><MapPin size={16} /> Choisir un point sur la carte</Button>}
                />
              </Card>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                    Sorties de tes abonnements ({recoFriends.length})
                  </p>
                  {recoFriends.length === 0 ? (
                    <p className="text-xs text-muted">
                      Aucune séance de tes abonnements — suis des sportifs pour les voir ici en premier.
                    </p>
                  ) : (
                    recoFriends.map((s) => (
                      <div key={s.id} className="space-y-2">
                        <SessionRow
                          s={s}
                          me={user?.id}
                          friend
                          selected={s.id === selectedId}
                          onSelect={() => setSelectedId(s.id === selectedId ? null : s.id)}
                          distanceKm={userPos ? kmBetween(userPos[0], userPos[1], s.lat, s.lng) : null}
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
                <div className="space-y-2">
                  <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                    {userPos ? `À proximité (${recoNear.length})` : `Autres sorties (${recoNear.length}) — par date`}
                  </p>
                  {!userPos && recoNear.length > 0 && (
                    <p className="text-[11px] text-muted">Active ta position (📍 en haut) pour trier par proximité.</p>
                  )}
                  {recoNear.map(({ s, d }) => (
                    <div key={s.id} className="space-y-2">
                      <SessionRow
                        s={s}
                        me={user?.id}
                        friend={s.visibility !== 'open' && followIds.has(s.host)}
                        selected={s.id === selectedId}
                        onSelect={() => setSelectedId(s.id === selectedId ? null : s.id)}
                        distanceKm={d}
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
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <Input aria-label="Rechercher une ville ou une salle" value={q} onChange={(e) => onQuery(e.target.value)} placeholder="Ville, salle… (ex. Basic-Fit Lyon)" className="pl-9" />
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
            </div>
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
                <BoundsTracker onChange={setViewport} />
                {clusters.map((c) =>
                  c.sessions.length === 1 ? (
                    <Marker
                      key={c.key}
                      position={[c.lat, c.lng]}
                      icon={pinIcon(c.sessions[0], user?.id, c.sessions[0].id === selectedId)}
                      eventHandlers={{ click: () => setSelectedId(c.sessions[0].id) }}
                    />
                  ) : (
                    <Marker
                      key={c.key}
                      position={[c.lat, c.lng]}
                      icon={clusterIcon(c.sessions.length)}
                      eventHandlers={{ click: () => setFlyTo({ lat: c.lat, lng: c.lng, zoom: Math.min(16, (viewport?.zoom ?? 6) + 2) }) }}
                    />
                  ),
                )}
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

            <div className="space-y-2">
              <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                Dans cette zone ({loading ? '…' : inZone.length})
              </p>
              {loading ? (
                <p className="text-sm text-muted">Chargement de la carte…</p>
              ) : inZone.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<MapPin size={24} />}
                    title="Aucune séance dans cette zone"
                    message="Déplace ou dézoome la carte — ou touche-la pour proposer ta séance ici."
                  />
                </Card>
              ) : (
                inZone.map((s) => (
                  <div
                    key={s.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(s.id, el)
                      else rowRefs.current.delete(s.id)
                    }}
                    className="space-y-2"
                  >
                    <SessionRow
                      s={s}
                      me={user?.id}
                      friend={s.visibility !== 'open' && followIds.has(s.host)}
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

function SessionRow({ s, me, friend, selected, onSelect, distanceKm }: {
  s: SportSession
  me?: string
  friend?: boolean
  selected: boolean
  onSelect: () => void
  distanceKm?: number | null
}) {
  const full = s.spots_taken >= s.spots_total
  const past = isSessionPast(s)
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
        {s.visibility === 'invite' ? '📩' : s.visibility === 'open' ? '✨' : '💪'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-extrabold">{s.title}</span>
          {/* Pas de badge Ami sur les sessions anonymes (ne pas trahir l'hôte). */}
          {friend && s.visibility !== 'open' && <span className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-extrabold text-accent">Ami</span>}
        </span>
        <span className="block truncate text-[11px] text-muted">
          {fmtDate(s.starts_at)} · {s.gym_name || 'Lieu à préciser'} · {s.spots_taken}/{s.spots_total}
          {s.host === me ? ' · ta session' : ''}
          {distanceKm != null ? ` · ${fmtDistance(distanceKm)}` : ''}
        </span>
      </span>
      <span className={cn('shrink-0 rounded-lg px-2 py-1 text-[11px] font-extrabold', past ? 'bg-surface-3 text-muted' : full ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success')}>
        {past ? 'Terminée' : full ? 'Complet' : `${s.spots_total - s.spots_taken} place(s)`}
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
  const past = isSessionPast(s)
  const mine = s.host === me
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [members, setMembers] = useState<SessionMember[] | null>(null)
  const [publicOnes, setPublicOnes] = useState<SocialProfile[]>([])
  const [requests, setRequests] = useState<SessionRequest[] | null>(null)
  const [myReq, setMyReq] = useState<SessionRequest | null | undefined>(undefined)
  const [myInvite, setMyInvite] = useState<SessionInvite | null | undefined>(undefined)
  const [invites, setInvites] = useState<SessionInvite[] | null>(null)
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
      if (s.visibility === 'invite') {
        listSessionInvites(s.id).then((l) => { if (alive) setInvites(l) }).catch(() => {})
      } else {
        listRequests(s.id).then((r) => { if (alive) setRequests(r) }).catch(() => {})
      }
    } else if (s.visibility === 'invite') {
      myInviteStatus(s.id).then((r) => { if (alive) setMyInvite(r) }).catch(() => { if (alive) setMyInvite(null) })
    } else {
      myRequestStatus(s.id).then((r) => { if (alive) setMyReq(r) }).catch(() => { if (alive) setMyReq(null) })
    }
    return () => { alive = false }
  }, [s.id, isMember, mine, s.visibility])

  const pending = (requests ?? []).filter((r) => r.status === 'pending')
  const pendingInvites = (invites ?? []).filter((i) => i.status === 'pending')

  /* Hôte : cliquable (photo + nom + pseudo) sauf anonymat des
     sessions "sur proposition" pour les non-membres. */
  const hostTo = mine ? '/profil' : profileLinkOf(s.host_profile)
  const hostNode =
    s.visibility === 'open' && !isMember && !mine ? (
      <b>un sportif anonyme 🤫</b>
    ) : s.host_profile || mine ? (
      <Link to={hostTo ?? '/profil'} className="inline-flex items-center gap-1 font-bold text-ink hover:text-accent">
        <ProfileAvatar
          url={s.host_profile?.avatar_url}
          name={mine ? 'toi' : profileNameOf(s.host_profile)}
          size={18}
        />
        {mine ? 'toi' : profileNameOf(s.host_profile)}
      </Link>
    ) : (
      <b>un sportif</b>
    )

  const propose = async () => {
    setReqBusy(true)
    try {
      if (myReq?.status === 'declined') await withdrawRequest(s.id)
      await sendRequest(s.id, reqMsg)
      setMyReq(await myRequestStatus(s.id))
      setReqMsg('')
      notify(s.visibility === 'open' ? 'Candidature envoyée — l’hôte va te répondre 💬' : 'Demande envoyée — l’hôte va te répondre 💬', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Envoi impossible', 'error')
    } finally {
      setReqBusy(false)
    }
  }

  const acceptMyInvite = async () => {
    if (full) {
      notify('Session complète', 'error')
      return
    }
    setReqBusy(true)
    try {
      await acceptInvite(s.id)
      setMyInvite(await myInviteStatus(s.id))
      notify('Inscrit ! 🎉 Discute avec l’hôte 💬', 'success')
      onChanged()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Acceptation impossible', 'error')
    } finally {
      setReqBusy(false)
    }
  }

  const declineMyInvite = async () => {
    setReqBusy(true)
    try {
      await declineInvite(s.id)
      setMyInvite(await myInviteStatus(s.id))
      notify('Invitation déclinée', 'info')
      onChanged()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setReqBusy(false)
    }
  }

  const decide = async (r: SessionRequest, ok: boolean) => {
    setReqBusy(true)
    try {
      if (ok) {
        if (s.spots_taken >= s.spots_total) throw new Error('Session complète')
        await acceptRequest(s.id, r.user_id)
        notify(`Match avec ${displayNameOf(r.author)} 🤝 Discutez !`, 'success')
      } else {
        await declineRequest(s.id, r.user_id)
        notify(s.visibility === 'open' ? 'Candidature refusée' : 'Demande refusée', 'info')
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

  const uninvite = async (u: SessionInvite) => {
    setReqBusy(true)
    try {
      await cancelInvite(s.id, u.user_id)
      setInvites(await listSessionInvites(s.id))
      notify('Invitation retirée', 'info')
      onChanged()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setReqBusy(false)
    }
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
            {s.visibility === 'invite' ? '📩 Entre amis (sur invitation)' : s.visibility === 'open' ? '✨ Sur proposition (rencontre)' : '🌍 Publique (validation requise)'} · Niveau : {s.level} ·{' '}
            {s.spots_taken}/{s.spots_total} · Par {hostNode}
          </p>
          {/* Participants : cachés aux non-membres (sauf profils publics). */}
          {!isMember && publicOnes.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              Déjà là : {publicOnes.map((p) => displayNameOf(p)).join(', ')}
              {s.spots_taken - 1 - publicOnes.length > 0 && ` +${s.spots_taken - 1 - publicOnes.length} autre(s)`}
            </p>
          )}
        </div>
        <div className="flex gap-1">
          {mine && <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>Modifier</Button>}
          {!mine && <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)}>Signaler</Button>}
          <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      </div>
      {s.description && <p className="text-sm text-muted">{s.description}</p>}

      {/* Membres visibles : hôte + inscrits uniquement. */}
      {isMember && members !== null && members.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-2 p-2.5">
          <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">Inscrits ({members.length})</p>
          {members.map((m) => (
            <div key={m.user_id} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <ProfileLine profile={m.profile} size={26} />
                {m.user_id === s.host && <span className="shrink-0 text-[10px] text-muted">(hôte)</span>}
                {mine && m.user_id !== me && (
                  <Button size="sm" variant="ghost" onClick={() => chatWith(m.user_id, m.profile)}>
                    <MessageCircle size={14} />
                  </Button>
                )}
              </div>
              {m.requestMessage && <p className="truncate pl-9 text-[11px] text-muted">« {m.requestMessage} »</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {past ? (
          mine ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => {
              if (!window.confirm('Supprimer cette session ?')) return
              void act(s.id, () => deleteSession(s.id), 'Session supprimée')
            }}>Supprimer</Button>
          ) : isMember ? (
            <Button size="sm" variant="primary" block onClick={() => chatWith(s.host, s.host_profile ?? null)}>
              <MessageCircle size={14} /> Discuter avec l’hôte
            </Button>
          ) : (
            <p className="text-xs text-muted">Session terminée 🕓 — inscriptions closes.</p>
          )
        ) : mine ? (
          <>
            {s.visibility === 'invite' && (
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
        ) : s.visibility === 'invite' ? (
          myInvite === undefined ? (
            <p className="text-xs text-muted">Chargement…</p>
          ) : myInvite?.status === 'pending' ? (
            <div className="w-full space-y-2 rounded-xl bg-accent-soft p-3">
              <p className="text-[13px] font-bold">🎉 {displayNameOf(s.host_profile)} t’a invité !</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" block disabled={reqBusy || full} onClick={() => void acceptMyInvite()}>
                  {full ? 'Complet' : 'Accepter 🤝'}
                </Button>
                <Button size="sm" variant="ghost" block disabled={reqBusy} onClick={() => void declineMyInvite()}>
                  Refuser
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">
              {myInvite?.status === 'declined' ? 'Invitation déclinée.' : 'Invitation traitée.'}
            </p>
          )
        ) : myReq === undefined ? (
          <p className="text-xs text-muted">Chargement…</p>
        ) : myReq?.status === 'pending' ? (
          <div className="flex w-full gap-2">
            <p className="flex-1 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-muted">
              {s.visibility === 'open' ? 'Candidature envoyée — en attente 💬' : 'Demande envoyée — en attente 💬'}
            </p>
            <Button size="sm" variant="ghost" disabled={reqBusy} onClick={() => { setReqBusy(true); withdrawRequest(s.id).then(() => setMyReq(null)).catch((e) => notify(e instanceof Error ? e.message : 'Impossible', 'error')).finally(() => setReqBusy(false)) }}>
              Annuler
            </Button>
          </div>
        ) : myReq?.status === 'declined' ? (
          <div className="w-full space-y-2">
            <p className="text-xs text-muted">{s.visibility === 'open' ? 'Candidature déclinée — tu peux retenter avec un mot :' : 'Demande déclinée — tu peux retenter avec un mot :'}</p>
            <ProposeBox msg={reqMsg} setMsg={setReqMsg} busy={reqBusy} onSend={() => void propose()} action={s.visibility === 'open' ? 'Se proposer 🙋' : 'Demander à rejoindre 🙋'} />
          </div>
        ) : full ? (
          <p className="w-full rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold text-muted">Complet — plus de place.</p>
        ) : s.visibility === 'open' ? (
          <div className="w-full space-y-2">
            <ProposeBox msg={reqMsg} setMsg={setReqMsg} busy={reqBusy} onSend={() => void propose()} action="Se proposer 🙋" />
          </div>
        ) : (
          <div className="w-full space-y-2">
            <ProposeBox msg={reqMsg} setMsg={setReqMsg} busy={reqBusy} onSend={() => void propose()} action="Demander à rejoindre 🙋" placeholder="Un mot pour l’hôte (optionnel)…" />
          </div>
        )}
      </div>

      {/* Demandes à valider (hôte, sessions open + public, à venir uniquement). */}
      {mine && !past && s.visibility !== 'invite' && (
        <div className="space-y-2 rounded-xl bg-surface-2 p-2.5">
          <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
            {s.visibility === 'open' ? 'Candidatures' : 'Demandes'} ({pending.length})
          </p>
          {requests === null ? (
            <p className="text-xs text-muted">Chargement…</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-muted">Aucune pour l’instant.</p>
          ) : (
            pending.map((r) => (
              <div key={r.user_id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <ProfileLine profile={r.author} size={26} />
                  {r.message && <p className="truncate pl-9 text-[11px] text-muted">« {r.message} »</p>}
                </div>
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

      {/* Invités (hôte, sortie entre amis, à venir uniquement). */}
      {mine && !past && s.visibility === 'invite' && (
        <div className="space-y-2 rounded-xl bg-surface-2 p-2.5">
          <p className="text-[11px] font-extrabold tracking-wide text-muted uppercase">
            Invités ({pendingInvites.length} en attente)
          </p>
          {invites === null ? (
            <p className="text-xs text-muted">Chargement…</p>
          ) : invites.length === 0 ? (
            <p className="text-xs text-muted">Personne pour l’instant — invite tes amis.</p>
          ) : (
            invites.map((i) => (
              <div key={i.user_id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
                <ProfileLine profile={i.author} size={26} />
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${i.status === 'pending' ? 'bg-warning/15 text-warning' : i.status === 'accepted' ? 'bg-success/15 text-success' : 'bg-surface-3 text-muted'}`}>
                  {i.status === 'pending' ? 'En attente' : i.status === 'accepted' ? 'Accepté' : 'Refusé'}
                </span>
                {i.status === 'pending' && (
                  <Button size="sm" variant="ghost" disabled={reqBusy} onClick={() => void uninvite(i)}>
                    <X size={14} />
                  </Button>
                )}
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
            notify('Invitations envoyées 🎉', 'success')
            onChanged()
          }}
        />
      )}
      <ReportDialog open={reportOpen} targetType="session" targetId={s.id} onClose={() => setReportOpen(false)} />
      <EditSessionModal session={s} open={editOpen} onClose={() => setEditOpen(false)} onSaved={onChanged} />
    </Card>
  )
}

function ProposeBox({ msg, setMsg, busy, onSend, action = 'Se proposer 🙋', placeholder = 'Présente-toi en un mot (optionnel)…' }: {  msg: string
  setMsg: (v: string) => void
  busy: boolean
  onSend: () => void
  action?: string
  placeholder?: string
}) {
  return (
    <div className="flex gap-2">
      <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={placeholder} maxLength={280} />
      <Button size="sm" variant="primary" disabled={busy} onClick={onSend}>{action}</Button>
    </div>
  )
}

/* --------------------------- mes séances --------------------------- */
/* Inscrit + créées + en attente (demandes et invitations). */

function MySessionsView({ sessions, initialSelectedId, followIds, busyId, onChanged, onChat, act }: {
  sessions: SportSession[]
  initialSelectedId: string | null
  followIds: Set<string>
  busyId: string | null
  onChanged: () => void
  onChat: (t: ActiveThread) => void
  act: (id: string, fn: () => Promise<void>, ok: string) => Promise<void>
}) {
  const { user } = useAuth()
  const notify = useStore((s) => s.notify)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  useEffect(() => { if (initialSelectedId) setSelectedId(initialSelectedId) }, [initialSelectedId])
  const [pendingReqs, setPendingReqs] = useState<MyPendingRequest[]>([])
  const [invites, setInvites] = useState<MyInvite[]>([])
  const [pastOnes, setPastOnes] = useState<SportSession[]>([])
  const [loading, setLoading] = useState(true)

  const refreshLocal = async () => {
    try {
      const [r, i, p] = await Promise.all([
        listMyPendingRequests().catch(() => [] as MyPendingRequest[]),
        listMyInvites().catch(() => [] as MyInvite[]),
        listPastSessions().catch(() => [] as SportSession[]),
      ])
      setPendingReqs(r)
      setInvites(i)
      // Historique : seulement celles où je suis concerné (créées/rejointes).
      setPastOnes(p.filter((s) => s.host === user?.id || s.joined_by_me))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Chargement impossible', 'error')
    }
  }

  useEffect(() => {
    setLoading(true)
    void refreshLocal().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const me = user?.id
  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])
  const mine = sessions.filter((s) => s.host === me)
  const joined = sessions.filter((s) => s.joined_by_me && s.host !== me)
  const requested = pendingReqs.flatMap((r) => {
    const s = byId.get(r.session.id)
    return s ? [s] : []
  })
  const invitedOnes = invites.flatMap((i) => {
    const s = byId.get(i.invite.session_id)
    return s ? [s] : []
  })

  const changed = () => {
    setSelectedId(null)
    onChanged()
    void refreshLocal()
  }

  const renderRow = (s: SportSession) => (
    <div key={s.id} className="space-y-2">
      <SessionRow
        s={s}
        me={me}
        friend={s.visibility !== 'open' && followIds.has(s.host)}
        selected={s.id === selectedId}
        onSelect={() => setSelectedId(s.id === selectedId ? null : s.id)}
      />
      {selectedId === s.id && (
        <SessionDetail
          s={s}
          me={me}
          busy={busyId === s.id}
          onClose={() => setSelectedId(null)}
          onChanged={changed}
          onChat={onChat}
          act={act}
        />
      )}
    </div>
  )

  const section = (title: string, list: SportSession[], empty: string) => (
    <div className="space-y-2">
      <p className="text-xs font-extrabold tracking-wide text-muted uppercase">{title} ({list.length})</p>
      {list.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        list.map(renderRow)
      )}
    </div>
  )

  if (loading) return <p className="py-6 text-center text-sm text-muted">Chargement de tes séances…</p>

  if (mine.length === 0 && joined.length === 0 && requested.length === 0 && invitedOnes.length === 0 && pastOnes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CalendarCheck size={24} />}
          title="Aucune séance pour l'instant"
          message="Propose une séance depuis la carte, ou demande à rejoindre celles autour de toi : tout se retrouvera ici."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {(invitedOnes.length > 0 || requested.length > 0) && (
        <div className="space-y-3">
          {section('📩 Invitations reçues', invitedOnes, '')}
          {section('⏳ En attente (candidatures + demandes)', requested, '')}
        </div>
      )}
      {section('🤝 Où je suis inscrit', joined, 'Aucune inscription pour l’instant.')}
      {section('📣 Créées par moi', mine, 'Aucune séance créée pour l’instant.')}
      {pastOnes.length > 0 && section('🕓 Terminées', pastOnes, '')}
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
  const [composeOpen, setComposeOpen] = useState(false)

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
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Discussions ({loading ? '…' : threads.length})</p>
        <Button size="sm" variant="ghost" onClick={() => setComposeOpen(true)}>
          <Plus size={14} /> Nouveau
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted">Chargement…</p>
      ) : threads.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageCircle size={24} />}
            title="Aucune discussion"
            message="Écris à tes abonnés et abonnements, ou discute depuis une séance : la conversation survit même si la séance est supprimée."
            action={<Button variant="primary" size="sm" onClick={onBack}>Voir la carte</Button>}
          />
        </Card>
      ) : (
        threads.map((t) => (
          <button
            key={t.other_id}
            type="button"
            onClick={() => setActive({ sessionId: t.session_id, title: t.session_title, otherId: t.other_id, other: t.other })}
            className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-2"
          >
            <ProfileAvatar
              url={t.other?.avatar_url}
              name={t.other?.display_name ?? t.other?.username ?? '?'}
              size={40}
            />
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
      <NewMessageModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPick={(p) => {
          setComposeOpen(false)
          setActive({ sessionId: null, title: 'Message direct', otherId: p.id, other: p })
        }}
      />
    </div>
  )
}

/** Nouveau message : choisir parmi abonnés + abonnements. */
function NewMessageModal({ open, onClose, onPick }: {
  open: boolean
  onClose: () => void
  onPick: (p: SocialProfile) => void
}) {
  const notify = useStore((s) => s.notify)
  const [friends, setFriends] = useState<SocialProfile[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setQ('')
    setLoading(true)
    listInviteCandidates()
      .then(setFriends)
      .catch((err) => notify(err instanceof Error ? err.message : 'Contacts illisibles', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ])

  if (!open) return null

  const needle = q.trim().toLowerCase()
  const list = friends.filter((f) =>
    !needle ||
    (f.username ?? '').toLowerCase().includes(needle) ||
    (f.display_name ?? '').toLowerCase().includes(needle),
  )

  return (
    <Modal open={open} onClose={onClose} title="Nouveau message">
      <div className="space-y-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un ami…" autoComplete="off" />
        {loading ? (
          <p className="py-4 text-center text-sm text-muted">Chargement…</p>
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            {friends.length === 0 ? 'Suis des sportifs pour pouvoir leur écrire.' : 'Aucun ami avec ce nom.'}
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {list.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onPick(f)}
                className="flex w-full items-center gap-3 rounded-xl bg-surface-2 p-2 text-left hover:brightness-105"
              >
                {f.avatar_url ? (
                  <img src={f.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-extrabold text-accent">
                    {(f.display_name ?? f.username ?? '?').slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">@{f.username ?? '?'}</span>
                  {f.display_name && <span className="block truncate text-xs text-muted">{f.display_name}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">Messages possibles avec tes abonnés et abonnements, ou quelqu'un avec qui tu as déjà échangé.</p>
      </div>
    </Modal>
  )
}

function ConversationView({ t, onBack }: { t: ActiveThread; onBack: () => void }) {
  const { user } = useAuth()
  const notify = useStore((s) => s.notify)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [messageLimit, setMessageLimit] = useState(200)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)

  const load = async (silent = false) => {
    try {
      const list = await listMessages(t.otherId, messageLimit)
      setMsgs(list)
      void markMessagesRead(t.otherId)
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
  }, [t.otherId, messageLimit])

  const send = async () => {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const m = await sendMessage(t.otherId, draft, t.sessionId)
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
        {msgs.length >= messageLimit && (
          <Button size="sm" variant="ghost" block onClick={() => setMessageLimit((n) => n + 200)}>
            Charger les messages précédents
          </Button>
        )}
        {msgs.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">
            {t.sessionId ? 'Match 🤝 Dis bonjour et organisez votre séance !' : 'Écris à ton ami 💬'}
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
  const [current, setCurrent] = useState<SessionInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([listInviteCandidates(), listSessionInvites(session.id)])
      .then(([c, l]) => {
        setCandidates(c)
        setCurrent(l)
        setPicked(l.filter((i) => i.status === 'pending').map((i) => i.user_id))
      })
      .catch((err) => notify(err instanceof Error ? err.message : 'Contacts illisibles', 'error'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const save = async () => {
    setSaving(true)
    try {
      const already = new Set(current.map((i) => i.user_id))
      const fresh = picked.filter((id) => !already.has(id))
      const removed = current.filter((i) => i.status === 'pending' && !picked.includes(i.user_id))
      await Promise.all([
        ...fresh.map((id) => sendInvite(session.id, id)),
        ...removed.map((i) => cancelInvite(session.id, i.user_id)),
      ])
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
      <p className="text-xs font-extrabold">Inviter des amis (direct, sans validation)</p>
      <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
        {candidates.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
            <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[var(--accent)]" />
            <span className="font-bold">@{c.username ?? c.display_name ?? '?'}</span>
          </label>
        ))}
      </div>
      <Button size="sm" variant="primary" disabled={saving} onClick={() => void save()}>
        {saving ? 'Envoi…' : `Inviter (${picked.length})`}
      </Button>
    </div>
  )
}

function EditSessionModal({ session, open, onClose, onSaved }: {
  session: SportSession
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const notify = useStore((s) => s.notify)
  const [title, setTitle] = useState(session.title)
  const [gym, setGym] = useState(session.gym_name)
  const [address, setAddress] = useState(session.address_text)
  const [starts, setStarts] = useState(() => {
    const d = new Date(session.starts_at)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  })
  const [spots, setSpots] = useState(session.spots_total)
  const [level, setLevel] = useState(session.level)
  const [visibility, setVisibility] = useState<SessionVisibility>(session.visibility)
  const [description, setDescription] = useState(session.description)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const date = new Date(starts)
    if (!title.trim() || !Number.isFinite(date.getTime()) || date.getTime() < Date.now()) {
      notify('Indique un titre et une date à venir', 'error')
      return
    }
    setSaving(true)
    try {
      await updateSession(session.id, { title, gym_name: gym, address_text: address,
        starts_at: date.toISOString(), spots_total: spots, level, description, visibility })
      notify('Sortie modifiée', 'success')
      onClose()
      onSaved()
    } catch (err) { notify(err instanceof Error ? err.message : 'Modification impossible', 'error') }
    finally { setSaving(false) }
  }

  return <Modal open={open} onClose={onClose} title="Modifier la sortie">
    <div className="space-y-3">
      <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></Field>
      <Field label="Salle / lieu"><Input value={gym} onChange={(e) => setGym(e.target.value)} maxLength={120} /></Field>
      <Field label="Adresse exacte"><Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date et heure"><Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></Field>
        <Field label="Places"><Select value={spots} onChange={(e) => setSpots(Number(e.target.value))}>
          {[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </Select></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Niveau"><Select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="tous">Tous niveaux</option><option value="débutant">Débutant</option>
          <option value="intermédiaire">Intermédiaire</option><option value="confirmé">Confirmé</option>
        </Select></Field>
        <Field label="Type"><Select value={visibility} onChange={(e) => setVisibility(e.target.value as SessionVisibility)}>
          <option value="invite">Entre amis</option><option value="open">Sur proposition</option>
          <option value="public">Publique</option>
        </Select></Field>
      </div>
      <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} /></Field>
      <Button variant="primary" block disabled={saving} onClick={() => void save()}>
        {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
      </Button>
    </div>
  </Modal>
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
  const [date, setDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 86_400_000)
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  })
  const [hour, setHour] = useState('19:00')
  const [spots, setSpots] = useState('3')
  const [level, setLevel] = useState('tous')
  const [visibility, setVisibility] = useState<SessionVisibility>('open')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [placeQuery, setPlaceQuery] = useState('')
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [placeBusy, setPlaceBusy] = useState(false)
  const [chosenPlace, setChosenPlace] = useState<PlaceResult | null>(null)

  const [candidates, setCandidates] = useState<SocialProfile[]>([])
  const [invited, setInvited] = useState<string[]>([])

  useEffect(() => {
    if (open && visibility === 'invite' && candidates.length === 0) {
      listInviteCandidates().then(setCandidates).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibility])

  useEffect(() => {
    if (!open) { setChosenPlace(null); setPlaces([]); setPlaceQuery('') }
  }, [open])

  if (!open) return null

  const location = chosenPlace ?? picked
  const findPlace = async () => {
    setPlaceBusy(true)
    try { setPlaces(await searchPlaces(placeQuery)) }
    catch (err) { notify(err instanceof Error ? err.message : 'Lieu introuvable', 'error') }
    finally { setPlaceBusy(false) }
  }

  const submit = async () => {
    if (!location) {
      notify('Choisis un lieu dans la recherche ou sur la carte', 'error')
      return
    }
    const d = new Date(`${date}T${hour}:00`)
    if (!Number.isFinite(d.getTime()) || d.getTime() < Date.now()) {
      notify('Choisis une date à venir', 'error')
      return
    }
    setSaving(true)
    try {
      const s = await createSession({
        title: title.trim() || 'Séance ouverte',
        gym_name: gym.trim() || 'Salle à préciser en privé',
        address_text: address.trim(),
        lat: location.lat,
        lng: location.lng,
        starts_at: d.toISOString(),
        spots_total: Number(spots) || 3,
        level,
        description: desc.trim(),
        visibility,
      })
      if (visibility === 'invite' && invited.length > 0) {
        await Promise.all(invited.map((id) => sendInvite(s.id, id).catch(() => {})))
      }
      notify(
        visibility === 'invite'
          ? `Sortie entre amis créée 📩 ${invited.length} invitation(s) envoyée(s)`
          : visibility === 'open'
            ? 'Proposition publiée — ton identité reste anonyme ✨'
            : 'Sortie publiée sur la carte 🎉',
        'success',
      )
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
        <Field label="Lieu de la séance" hint="Cherche une salle ou une ville, ou touche la carte avant d’ouvrir ce formulaire.">
          <div className="flex gap-2">
            <Input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void findPlace() } }}
              placeholder="Ville ou salle…" />
            <Button size="sm" disabled={placeBusy || placeQuery.trim().length < 3} onClick={() => void findPlace()}>
              <Search size={15} /> Chercher
            </Button>
          </div>
        </Field>
        {places.length > 0 && <div className="max-h-36 space-y-1 overflow-y-auto">
          {places.map((place, i) => <button key={i} type="button"
            className="block w-full rounded-lg bg-surface-2 p-2 text-left text-xs hover:bg-accent-soft"
            onClick={() => { setChosenPlace(place); setPlaceQuery(place.label); setPlaces([]) }}>
            📍 {place.label}
          </button>)}
        </div>}
        {location && <p className="text-xs text-muted">📍 {chosenPlace?.label ?? `${location.lat}, ${location.lng}`}</p>}
        <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Salle / lieu" hint="Nom libre, ex. Basic-Fit Part-Dieu">
          <Input value={gym} onChange={(e) => setGym(e.target.value)} placeholder="Ma salle habituelle…" />
        </Field>
        <Field label="Adresse exacte" hint="Visible uniquement par les inscrits">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue des Sports" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Heure"><Input type="time" value={hour} onChange={(e) => setHour(e.target.value)} /></Field>
          <Field label="Places">
            <Select value={spots} onChange={(e) => setSpots(e.target.value)}>
              {['2', '3', '4', '5', '6', '7', '8'].map((n) => <option key={n} value={n}>{n}</option>)}
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
          <Field label="Qui peut rejoindre ?">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as SessionVisibility)}>
              <option value="invite">📩 Entre amis (invitation)</option>
              <option value="open">✨ Sur proposition (anonyme)</option>
              <option value="public">🌍 Publique (validation requise)</option>
            </Select>
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          {visibility === 'invite'
            ? 'Seuls tes invités la voient et rejoignent direct en acceptant. Entre amis, pas de vérification.'
            : visibility === 'open'
              ? 'Visible par tous, sans ton pseudo. On se propose, tu acceptes → match + discussion.'
              : 'Visible par tous avec ton pseudo, mais tu valides chaque demande.'}
        </p>
        {visibility === 'invite' && (
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
