import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CalendarPlus, CloudOff, LocateFixed, MapPin, Plus, Search, Users } from 'lucide-react'
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
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Chip, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'

const FRANCE: [number, number] = [46.603354, 1.888334]

type DayFilter = 'all' | 'today' | 'tomorrow' | 'weekend'

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
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

/* ------------------------------------------------------------------ */

export default function ExplorerPage() {
  const { cloudEnabled, user } = useAuth()
  const notify = useStore((s) => s.notify)

  const [sessions, setSessions] = useState<SportSession[]>([])
  const [loading, setLoading] = useState(true)
  const [dayFilter, setDayFilter] = useState<DayFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number]>(FRANCE)
  const [zoom, setZoom] = useState(6)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null)
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reload = async () => {
    if (!cloudEnabled) return
    setLoading(true)
    try {
      setSessions(await listSessions())
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
        </div>
      </PageHeader>

      <Page className="max-w-5xl space-y-3 pb-10">
        <div className="overflow-hidden rounded-2xl border border-line">
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
              <SessionRow key={s.id} s={s} me={user?.id} selected={s.id === selectedId} onSelect={() => setSelectedId(s.id)} />
            ))}
          </div>
        )}

        {selected && (
          <SessionDetail
            s={selected}
            me={user?.id}
            busy={busyId === selected.id}
            onClose={() => setSelectedId(null)}
            onJoin={() => void act(selected.id, () => joinSession(selected), 'Inscrit ! 🤝')}
            onLeave={() => void act(selected.id, () => leaveSession(selected.id), 'Désinscrit')}
            onDelete={() => {
              if (!window.confirm('Supprimer cette session ?')) return
              void act(selected.id, () => deleteSession(selected.id), 'Session supprimée').then(() => setSelectedId(null))
            }}
            onInvited={() => void reload()}
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
              <SessionRow key={s.id} s={s} me={user?.id} selected={s.id === selectedId} onSelect={() => {
                setSelectedId(s.id)
                setFlyTo({ lat: s.lat, lng: s.lng, zoom: 14 })
              }} />
            ))
          )}
        </div>
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

function SessionRow({ s, me, selected, onSelect }: { s: SportSession; me?: string; selected: boolean; onSelect: () => void }) {
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
        <span className="block truncate text-sm font-extrabold">{s.title}</span>
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

function SessionDetail({ s, me, busy, onClose, onJoin, onLeave, onDelete, onInvited }: {
  s: SportSession
  me?: string
  busy: boolean
  onClose: () => void
  onJoin: () => void
  onLeave: () => void
  onDelete: () => void
  onInvited: () => void
}) {
  const notify = useStore((st) => st.notify)
  const full = s.spots_taken >= s.spots_total
  const mine = s.host === me
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <Card className="space-y-2 border-accent-line p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold">{s.title}</p>
          <p className="text-xs font-semibold text-accent">{fmtDate(s.starts_at)}</p>
          <p className="mt-0.5 text-xs text-muted">📍 {s.gym_name || 'Lieu à préciser'}{s.address_text ? ` — ${s.address_text}` : ''}</p>
          <p className="mt-0.5 text-xs text-muted">
            {s.visibility === 'private' ? '🔒 Privée (sur invitation)' : '🌍 Publique'} · Niveau : {s.level} ·{' '}
            {s.spots_taken}/{s.spots_total} · Par <b>{s.host_profile?.username ? `@${s.host_profile.username}` : s.host_profile?.display_name ?? 'un sportif'}</b>
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
      {s.description && <p className="text-sm text-muted">{s.description}</p>}
      <div className="flex flex-wrap gap-2">
        {mine ? (
          <>
            {s.visibility === 'private' && (
              <Button size="sm" variant="secondary" onClick={() => setInviteOpen(true)}>
                <Users size={14} /> Inviter
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>Supprimer</Button>
          </>
        ) : s.joined_by_me ? (
          <Button size="sm" variant="secondary" block disabled={busy} onClick={onLeave}>Se désinscrire</Button>
        ) : (
          <Button size="sm" variant="primary" block disabled={busy || full} onClick={onJoin}>
            {full ? 'Complet' : 'Rejoindre 🤝'}
          </Button>
        )}
      </div>
      {inviteOpen && (
        <InviteBox
          session={s}
          onDone={() => {
            setInviteOpen(false)
            notify('Invitations mises à jour', 'success')
            onInvited()
          }}
        />
      )}
    </Card>
  )
}

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
  }, [open, visibility ])

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
        <Field label="Adresse (optionnel)"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="12 rue des Sports" /></Field>
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
              <option value="public">🌍 Publique (carte)</option>
              <option value="private">🔒 Privée (invitation)</option>
            </Select>
          </Field>
        </div>
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
