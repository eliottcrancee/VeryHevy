import { useEffect, useMemo, useState } from 'react'
import {
  CalendarPlus,
  Dumbbell,
  Flame,
  Heart,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { Page, PageHeader } from '@/components/PageHeader'
import { Badge, Button, Card, Chip, EmptyState, Field, Input, Modal, SectionTitle, Select, Textarea } from '@/components/ui'
import { useStore } from '@/store/store'
import { AVATARS, useGymBro } from '@/store/gymbro'
import {
  GYMBRO_GOALS,
  GYMBRO_LEVELS,
  GYMBRO_SLOTS,
  GYMBRO_ICEBREAKERS,
  GYMBRO_SEED_PEOPLE,
  formatSessionDate,
  gymbroCompat,
  type GymBroGoal,
  type GymBroPerson,
  type GymBroSlot,
} from '@/lib/gymbro'
import { cn } from '@/lib/utils'

type Tab = 'discover' | 'sessions' | 'matchs' | 'profil'

function Avatar({ emoji, color, size = 56 }: { emoji: string; color: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl text-2xl"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
    >
      {emoji}
    </span>
  )
}

function GoalChips({ goals }: { goals: GymBroGoal[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {goals.map((g) => (
        <span key={g} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-semibold text-muted">
          {GYMBRO_GOALS[g].emoji} {GYMBRO_GOALS[g].label}
        </span>
      ))}
    </div>
  )
}

function PersonCard({ person, compat, onLike, onPass, matched }: {
  person: GymBroPerson
  compat: number
  onLike: () => void
  onPass: () => void
  matched?: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <Avatar emoji={person.avatar} color={person.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-extrabold">{person.pseudo}, {person.age}</p>
            <Badge color="#16a34a">{compat}% match</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <MapPin size={12} /> {person.area} · {person.level} · {person.sessionsPerWeek}×/sem
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            {person.slots.map((s) => (
              <span key={s} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold text-muted">
                {GYMBRO_SLOTS[s].emoji} {GYMBRO_SLOTS[s].label}
              </span>
            ))}
            {person.canSpot && (
              <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 font-bold text-success">
                <ShieldCheck size={11} /> Pareur
              </span>
            )}
            {person.benchKg != null && (
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-semibold text-muted">Bench {person.benchKg} kg</span>
            )}
          </div>
        </div>
      </div>
      <p className="px-4 pb-3 text-[13px] text-muted">{person.bio}</p>
      <div className="px-4 pb-3"><GoalChips goals={person.goals} /></div>
      <div className="flex gap-2 border-t border-line p-3">
        {matched ? (
          <Button variant="success" block disabled><Heart size={16} /> Matché 🤝</Button>
        ) : (
          <>
            <Button variant="secondary" block onClick={onPass}><X size={16} /> Passer</Button>
            <Button variant="primary" block onClick={onLike}><Flame size={16} /> Team !</Button>
          </>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */

function DiscoverTab({ onMatch }: { onMatch: (p: GymBroPerson) => void }) {
  const mine = useGymBro((s) => s.mine)
  const likes = useGymBro((s) => s.likes)
  const passes = useGymBro((s) => s.passes)
  const matches = useGymBro((s) => s.matches)
  const like = useGymBro((s) => s.like)
  const pass = useGymBro((s) => s.pass)
  const notify = useStore((s) => s.notify)
  const [query, setQuery] = useState('')
  const [goal, setGoal] = useState<GymBroGoal | 'all'>('all')
  const [slot, setSlot] = useState<GymBroSlot | 'all'>('all')
  const [spotOnly, setSpotOnly] = useState(false)
  const [justMatched, setJustMatched] = useState<string | null>(null)

  const list = useMemo(() => {
    return GYMBRO_SEED_PEOPLE
      .filter((p) => !passes.includes(p.id))
      .filter((p) => (goal === 'all' ? true : p.goals.includes(goal)))
      .filter((p) => (slot === 'all' ? true : p.slots.includes(slot)))
      .filter((p) => (spotOnly ? p.canSpot : true))
      .filter((p) =>
        query.trim()
          ? `${p.pseudo} ${p.area} ${p.bio}`.toLowerCase().includes(query.trim().toLowerCase())
          : true,
      )
      .map((p) => ({ p, compat: gymbroCompat(mine, p) }))
      .sort((a, b) => b.compat - a.compat)
  }, [passes, goal, slot, spotOnly, query, mine])

  const doLike = (p: GymBroPerson) => {
    const isMatch = like(p)
    if (isMatch) {
      setJustMatched(p.id)
      notify(`Match avec ${p.pseudo} 🤝 Va lui écrire !`, 'success')
      onMatch(p)
    }
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pseudo, quartier, vibe…" className="pl-9" />
        </div>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          <Chip active={goal === 'all'} onClick={() => setGoal('all')}>✨ Tout</Chip>
          {(Object.keys(GYMBRO_GOALS) as GymBroGoal[]).map((g) => (
            <Chip key={g} active={goal === g} onClick={() => setGoal(goal === g ? 'all' : g)}>
              {GYMBRO_GOALS[g].emoji} {GYMBRO_GOALS[g].label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip active={slot === 'all'} onClick={() => setSlot('all')}>🕒 Toutes dispos</Chip>
          {(Object.keys(GYMBRO_SLOTS) as GymBroSlot[]).map((s) => (
            <Chip key={s} active={slot === s} onClick={() => setSlot(slot === s ? 'all' : s)}>
              {GYMBRO_SLOTS[s].emoji} {GYMBRO_SLOTS[s].label}
            </Chip>
          ))}
          <Chip active={spotOnly} onClick={() => setSpotOnly((v) => !v)}>🛡️ Pareur uniquement</Chip>
        </div>
      </Card>

      {justMatched && (
        <Card className="border-success/40 bg-success/5 p-3 text-sm font-semibold text-success">
          🎉 Nouveau match ! Retrouve-le dans l’onglet Matchs pour proposer une séance.
        </Card>
      )}

      {list.length === 0 ? (
        <Card><EmptyState icon={<Users size={24} />} title="Plus personne à découvrir" message="Élargis les filtres ou réinitialise la démo dans ton profil." /></Card>
      ) : (
        list.map(({ p, compat }) => (
          <PersonCard
            key={p.id}
            person={p}
            compat={compat}
            matched={matches.some((m) => m.personId === p.id) || likes.includes(p.id) && p.likesYou}
            onLike={() => doLike(p)}
            onPass={() => pass(p.id)}
          />
        ))
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SessionsTab({ onPropose }: { onPropose: () => void }) {
  const sessions = useGymBro((s) => s.sessions)
  const joined = useGymBro((s) => s.joinedSessions)
  const joinSession = useGymBro((s) => s.joinSession)
  const leaveSession = useGymBro((s) => s.leaveSession)
  const deleteSession = useGymBro((s) => s.deleteSession)
  const notify = useStore((s) => s.notify)

  const sorted = useMemo(
    () => sessions.slice().sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [sessions],
  )

  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-xl">🏋️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">Séances ouvertes</p>
          <p className="text-xs text-muted">Rejoins une séance ou crée la tienne. Lieux précisés en privé, jamais de scraping.</p>
        </div>
        <Button variant="primary" size="sm" onClick={onPropose}><Plus size={15} /> Créer</Button>
      </Card>

      {sorted.map((s) => {
        const full = s.spotsTaken >= s.spotsTotal
        const isJoined = joined.includes(s.id)
        return (
          <Card key={s.id} className={cn('p-4', isJoined && 'border-accent-line')}>
            <div className="flex items-start gap-3">
              <Avatar emoji={s.hostAvatar} color={s.hostColor} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold">{s.title}</p>
                <p className="mt-0.5 text-xs font-semibold text-accent">{formatSessionDate(s.date)}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <MapPin size={12} /> {s.place} · {s.area}
                </p>
              </div>
              <Badge color={full && !isJoined ? '#ef4444' : '#16a34a'}>
                {s.spotsTaken}/{s.spotsTotal}
              </Badge>
            </div>
            <p className="mt-2 text-[13px] text-muted">{s.description}</p>
            <div className="mt-2"><GoalChips goals={s.tags} /></div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
              <span>Organisé par <b>{s.hostPseudo}</b></span>
              <span>·</span><span>Niveau : {s.level}</span>
              {s.mine && <span>· <b>ta session</b></span>}
            </div>
            <div className="mt-3 flex gap-2">
              {s.mine ? (
                <Button variant="ghost" size="sm" onClick={() => { deleteSession(s.id); notify('Session supprimée', 'info') }}>
                  Supprimer
                </Button>
              ) : isJoined ? (
                <Button variant="secondary" size="sm" block onClick={() => leaveSession(s.id)}>Se désinscrire</Button>
              ) : (
                <Button variant="primary" size="sm" block disabled={full} onClick={() => { joinSession(s.id); notify(`Inscrit à « ${s.title} » 🤝`, 'success') }}>
                  {full ? 'Complet' : 'Rejoindre 🤝'}
                </Button>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function MatchsTab({ activeId, setActiveId, onPropose }: { activeId: string | null; setActiveId: (id: string | null) => void; onPropose: () => void }) {
  const matches = useGymBro((s) => s.matches)
  const messages = useGymBro((s) => s.messages)
  const sendMessage = useGymBro((s) => s.sendMessage)
  const unmatch = useGymBro((s) => s.unmatch)
  const [draft, setDraft] = useState('')

  const people = useMemo(
    () => matches
      .map((m) => ({ m, p: GYMBRO_SEED_PEOPLE.find((x) => x.id === m.personId)! }))
      .filter((x) => x.p),
    [matches],
  )
  const active = people.find((x) => x.p.id === activeId) ?? people[0] ?? null
  const thread = active ? (messages[active.p.id] ?? []) : []

  useEffect(() => {
    if (!activeId && people[0]) setActiveId(people[0].p.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people.length])

  if (people.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Heart size={24} />}
          title="Aucun match pour l’instant"
          message="Like des profils dans Découvrir : quand c’est réciproque, vous pouvez discuter ici et planifier une séance."
        />
      </Card>
    )
  }

  const send = () => {
    if (!active || !draft.trim()) return
    sendMessage(active.p.id, draft)
    setDraft('')
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
      <Card className="space-y-1 p-2">
        {people.map(({ p, m }) => {
          const last = (messages[p.id] ?? []).at(-1)
          const isActive = active?.p.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl p-2 text-left transition-colors',
                isActive ? 'bg-accent-soft' : 'hover:bg-surface-2',
              )}
            >
              <Avatar emoji={p.avatar} color={p.color} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.pseudo}</span>
                <span className="block truncate text-[11px] text-muted">
                  {last ? `${last.fromMe ? 'Toi : ' : ''}${last.text}` : `Matché le ${new Date(m.at).toLocaleDateString('fr-FR')}`}
                </span>
              </span>
            </button>
          )
        })}
      </Card>

      {active && (
        <Card className="flex min-h-[420px] flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-line p-3">
            <Avatar emoji={active.p.avatar} color={active.p.color} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{active.p.pseudo}, {active.p.age} · {active.p.area}</p>
              <p className="text-[11px] text-muted">{active.p.level} · {active.p.slots.map((s) => GYMBRO_SLOTS[s].label).join(', ')}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onPropose}><CalendarPlus size={14} /> Séance</Button>
            <Button variant="ghost" size="sm" onClick={() => unmatch(active.p.id)}>Retirer</Button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {thread.map((msg) => (
              <div key={msg.id} className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-[13px]',
                    msg.fromMe ? 'bg-accent-solid text-accent-contrast' : 'bg-surface-2 text-ink',
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-line p-3">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {GYMBRO_ICEBREAKERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => sendMessage(active.p.id, b)}
                  className="shrink-0 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink"
                >
                  {b}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder={`Écris à ${active.p.pseudo}…`}
              />
              <Button variant="primary" onClick={send}><MessageCircle size={16} /></Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ProfilTab() {
  const mine = useGymBro((s) => s.mine)
  const setMine = useGymBro((s) => s.setMine)
  const toggleGoal = useGymBro((s) => s.toggleGoal)
  const toggleSlot = useGymBro((s) => s.toggleSlot)
  const matches = useGymBro((s) => s.matches)
  const sessions = useGymBro((s) => s.sessions)
  const joined = useGymBro((s) => s.joinedSessions)
  const resetDemo = useGymBro((s) => s.resetDemo)
  const notify = useStore((s) => s.notify)

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <SectionTitle action={<Badge color={mine.visible ? '#16a34a' : '#6b7280'}>{mine.visible ? 'Visible' : 'Masqué'}</Badge>}>
          Mon profil GymBro
        </SectionTitle>
        <div className="flex items-center gap-3">
          <Avatar emoji={mine.avatar} color={mine.color} />
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setMine({ avatar: a })}
                className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg', mine.avatar === a ? 'border-accent-solid bg-accent-soft' : 'border-line')}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Pseudo"><Input value={mine.pseudo} onChange={(e) => setMine({ pseudo: e.target.value })} /></Field>
          <Field label="Quartier / ville (libre)"><Input value={mine.area} onChange={(e) => setMine({ area: e.target.value })} placeholder="Ex. Centre-ville" /></Field>
          <Field label="Niveau">
            <Select value={mine.level} onChange={(e) => setMine({ level: e.target.value as typeof mine.level })}>
              {GYMBRO_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Séances / semaine">
            <Select value={String(mine.sessionsPerWeek)} onChange={(e) => setMine({ sessionsPerWeek: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}× / sem</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Bio"><Textarea value={mine.bio} onChange={(e) => setMine({ bio: e.target.value })} rows={2} /></Field>
        <Field label="Objectifs (max 4)">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GYMBRO_GOALS) as GymBroGoal[]).map((g) => (
              <Chip key={g} active={mine.goals.includes(g)} onClick={() => toggleGoal(g)}>
                {GYMBRO_GOALS[g].emoji} {GYMBRO_GOALS[g].label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Dispos">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GYMBRO_SLOTS) as GymBroSlot[]).map((s) => (
              <Chip key={s} active={mine.slots.includes(s)} onClick={() => toggleSlot(s)}>
                {GYMBRO_SLOTS[s].emoji} {GYMBRO_SLOTS[s].label}
              </Chip>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          <Chip active={mine.canSpot} onClick={() => setMine({ canSpot: !mine.canSpot })}>🛡️ Je peux assurer la pare</Chip>
          <Chip active={mine.visible} onClick={() => setMine({ visible: !mine.visible })}>👁️ Visible des autres</Chip>
        </div>
      </Card>

      <Card className="grid grid-cols-3 gap-2 p-4 text-center">
        <div><p className="text-xl font-extrabold">{matches.length}</p><p className="text-[11px] text-muted">matchs</p></div>
        <div><p className="text-xl font-extrabold">{sessions.filter((s) => s.mine).length}</p><p className="text-[11px] text-muted">sessions créées</p></div>
        <div><p className="text-xl font-extrabold">{joined.length}</p><p className="text-[11px] text-muted">rejointes</p></div>
      </Card>

      <Card className="p-4 text-xs text-muted">
        Démo 100 % locale : profils et messages fictifs stockés sur cet appareil. Aucune salle scrapée —
        les lieux de rendez-vous sont saisis librement et partagés uniquement en match privé. Pense à la sécurité :
        premier rendez-vous dans un lieu public, pareur pour les barres lourdes.
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => { resetDemo(); notify('Démo GymBro réinitialisée', 'info') }}>
          Réinitialiser la démo
        </Button>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function CreateSessionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createSession = useGymBro((s) => s.createSession)
  const mine = useGymBro((s) => s.mine)
  const notify = useStore((s) => s.notify)
  const [title, setTitle] = useState('Push — pecs / épaules')
  const [day, setDay] = useState('1')
  const [hour, setHour] = useState('19:00')
  const [place, setPlace] = useState('')
  const [tags, setTags] = useState<GymBroGoal[]>(['poids-libres', 'pareur'])
  const [spots, setSpots] = useState('3')
  const [level, setLevel] = useState<'tous' | (typeof GYMBRO_LEVELS)[number]>('tous')
  const [desc, setDesc] = useState('Séance ouverte, on s’adapte aux niveaux. Je peux parer. 🛡️')

  if (!open) return null

  const submit = () => {
    const [h, m] = hour.split(':').map(Number)
    const d = new Date()
    d.setDate(d.getDate() + Number(day))
    d.setHours(h || 19, m || 0, 0, 0)
    createSession({
      title: title.trim() || 'Séance GymBro',
      date: d.toISOString(),
      place: place.trim() || 'Lieu précisé en privé',
      area: mine.area || 'Centre-ville',
      level,
      spotsTotal: Math.max(2, Math.min(8, Number(spots) || 3)),
      tags: tags.length ? tags : ['motivation'],
      description: desc.trim(),
    })
    notify('Session publiée 🤝', 'success')
    onClose()
  }

  const toggleTag = (g: GymBroGoal) =>
    setTags((t) => (t.includes(g) ? t.filter((x) => x !== g) : [...t, g].slice(0, 3)))

  return (
    <Modal open={open} onClose={onClose} title="Créer une séance ouverte">
      <div className="space-y-3">
        <Field label="Titre"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Jour">
            <Select value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="0">Aujourd’hui</option>
              <option value="1">Demain</option>
              <option value="2">Dans 2 j</option>
              <option value="3">Dans 3 j</option>
              <option value="6">Samedi prochain</option>
            </Select>
          </Field>
          <Field label="Heure"><Input type="time" value={hour} onChange={(e) => setHour(e.target.value)} /></Field>
          <Field label="Places">
            <Select value={spots} onChange={(e) => setSpots(e.target.value)}>
              {['2', '3', '4', '5', '6'].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Lieu (libre, jamais scrapé)" hint="Ex. « ma salle habituelle — adresse en privé ».">
          <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ma salle habituelle…" />
        </Field>
        <Field label="Niveau">
          <Select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
            <option value="tous">Tous niveaux</option>
            {GYMBRO_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Ambiance (max 3)">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GYMBRO_GOALS) as GymBroGoal[]).map((g) => (
              <Chip key={g} active={tags.includes(g)} onClick={() => toggleTag(g)}>
                {GYMBRO_GOALS[g].emoji} {GYMBRO_GOALS[g].label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></Field>
        <div className="flex gap-2">
          <Button variant="ghost" block onClick={onClose}>Annuler</Button>
          <Button variant="primary" block onClick={submit}><Dumbbell size={16} /> Publier</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */

export default function GymBroPage() {
  const ensureSeed = useGymBro((s) => s.ensureSeed)
  const matches = useGymBro((s) => s.matches)
  const joined = useGymBro((s) => s.joinedSessions)
  const [tab, setTab] = useState<Tab>('discover')
  const [createOpen, setCreateOpen] = useState(false)
  const [activeMatch, setActiveMatch] = useState<string | null>(null)

  useEffect(() => { ensureSeed() }, [ensureSeed])

  return (
    <div>
      <PageHeader
        title="GymBro 🤝"
        subtitle="Trouve ton partenaire de séance — lourd en sécurité"
        actions={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={15} /> Séance</Button>}
      >
        <div className="mx-auto w-full max-w-5xl px-4 pb-3">
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {(
              [
                { v: 'discover', label: 'Découvrir', icon: <Sparkles size={14} /> },
                { v: 'sessions', label: `Sessions${joined.length ? ` (${joined.length})` : ''}`, icon: <Dumbbell size={14} /> },
                { v: 'matchs', label: `Matchs${matches.length ? ` (${matches.length})` : ''}`, icon: <Heart size={14} /> },
                { v: 'profil', label: 'Mon profil', icon: <Users size={14} /> },
              ] as { v: Tab; label: string; icon: React.ReactNode }[]
            ).map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-all',
                  tab === t.v ? 'border-accent-solid bg-accent-solid text-accent-contrast' : 'border-line bg-surface text-muted',
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <Page className="max-w-3xl space-y-4 pb-10">
        {tab === 'discover' && (
          <DiscoverTab onMatch={(p) => { setActiveMatch(p.id); setTab('matchs') }} />
        )}
        {tab === 'sessions' && <SessionsTab onPropose={() => setCreateOpen(true)} />}
        {tab === 'matchs' && (
          <MatchsTab activeId={activeMatch} setActiveId={setActiveMatch} onPropose={() => setCreateOpen(true)} />
        )}
        {tab === 'profil' && <ProfilTab />}
      </Page>

      <CreateSessionModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
