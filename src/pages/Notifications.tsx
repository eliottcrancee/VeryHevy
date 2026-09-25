import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, Check, UserPlus, X } from 'lucide-react'
import { useStore } from '@/store/store'
import type { AppNotification, FollowRequest } from '@/types'
import {
  acceptFollowRequest,
  declineFollowRequest,
  cancelFollowRequest,
  listIncomingFollowRequests,
  listNotifications,
  listOutgoingFollowRequests,
  markAllRead,
  markOneRead,
} from '@/lib/notifications'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, EmptyState } from '@/components/ui'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return "à l'instant"
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)} h`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" referrerPolicy="no-referrer" />
  }
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg font-extrabold text-accent">
      {(name || '?').slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Libellé + destination d'une notification générique. */
function describe(n: AppNotification): { text: string; to: string | null } {
  const p = n.payload as Record<string, string | undefined>
  const who = p.from_username ? `@${p.from_username}` : 'Un sportif'
  switch (n.type) {
    case 'follow_request':
      return { text: `${who} veut te suivre`, to: null }
    case 'follow_accepted':
      return { text: `${who} a accepté ta demande 🎉`, to: p.username ? `/profil/${p.username}` : null }
    case 'new_follower':
      return { text: `${who} te suit`, to: p.from_username ? `/profil/${p.from_username}` : null }
    case 'session_request':
      return { text: `${who} veut rejoindre ta séance`, to: '/explorer' }
    case 'session_invite':
      return { text: `${who} t'invite à « ${p.session_title ?? 'une séance'} » 🎉`, to: '/explorer' }
    case 'session_invite_declined':
      return { text: `${who} a décliné ton invitation${p.session_title ? ` (« ${p.session_title} »)` : ''}`, to: '/explorer' }
    case 'session_accepted':
      return { text: `Match ! ${who} t'a accepté${p.session_title ? ` : « ${p.session_title} »` : ''} 🤝`, to: '/explorer' }
    default:
      return { text: 'Nouvelle notification', to: null }
  }
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const notify = useStore((s) => s.notify)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AppNotification[]>([])
  const [incoming, setIncoming] = useState<FollowRequest[]>([])
  const [outgoing, setOutgoing] = useState<FollowRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [a, b, c] = await Promise.all([
        listNotifications(),
        listIncomingFollowRequests(),
        listOutgoingFollowRequests(),
      ])
      setItems(a)
      setIncoming(b)
      setOutgoing(c)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Notifications illisibles', 'error')
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    void reload()
  }, [reload])

  const unread = items.filter((n) => !n.read_at).length

  const readAll = async () => {
    try {
      await markAllRead()
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    }
  }

  const decide = async (r: FollowRequest, ok: boolean) => {
    setBusy(r.requester)
    try {
      if (ok) {
        await acceptFollowRequest(r.requester)
        notify(`Tu suis @${r.profile?.username ?? '?'} 🎉`, 'success')
      } else {
        await declineFollowRequest(r.requester)
        notify('Demande refusée', 'info')
      }
      const [a, b] = await Promise.all([listNotifications(), listIncomingFollowRequests()])
      setItems(a)
      setIncoming(b)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (r: FollowRequest) => {
    setBusy(r.target)
    try {
      await cancelFollowRequest(r.target)
      notify('Demande annulée', 'info')
      setOutgoing((prev) => prev.filter((x) => x.target !== r.target))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Action impossible', 'error')
    } finally {
      setBusy(null)
    }
  }

  const open = async (n: AppNotification) => {
    const { to } = describe(n)
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      void markOneRead(n.id)
    }
    if (to) navigate(to)
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        back
        subtitle={unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est à jour'}
        actions={
          unread > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => void readAll()}>
              <Check size={15} /> Tout lire
            </Button>
          ) : undefined
        }
      />
      <Page className="max-w-2xl space-y-4 pb-10">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Chargement…</p>
        ) : (
          <>
            {incoming.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                  Demandes d'amis ({incoming.length})
                </p>
                {incoming.map((r) => (
                  <Card key={r.requester} className="border-accent-line bg-accent-soft p-3">
                    <div className="flex items-center gap-3">
                      <Avatar url={r.profile?.avatar_url} name={r.profile?.display_name ?? r.profile?.username ?? '?'} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold">@{r.profile?.username ?? '?'}</p>
                        <p className="text-[11px] text-muted">veut te suivre · {fmtWhen(r.created_at)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        block
                        disabled={busy === r.requester}
                        onClick={() => void decide(r, true)}
                      >
                        <Check size={14} /> Accepter
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        block
                        disabled={busy === r.requester}
                        onClick={() => void decide(r, false)}
                      >
                        <X size={14} /> Refuser
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {outgoing.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                  Demandes envoyées ({outgoing.length})
                </p>
                {outgoing.map((r) => (
                  <Card key={r.target} className="flex items-center gap-3 p-3">
                    <Avatar url={r.profile?.avatar_url} name={r.profile?.display_name ?? r.profile?.username ?? '?'} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">@{r.profile?.username ?? '?'}</p>
                      <p className="text-[11px] text-muted">en attente · {fmtWhen(r.created_at)}</p>
                    </div>
                    <Button size="sm" variant="ghost" disabled={busy === r.target} onClick={() => void cancel(r)}>
                      Annuler
                    </Button>
                  </Card>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <p className="text-xs font-extrabold tracking-wide text-muted uppercase">Activité récente</p>
              {items.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<BellRing size={24} />}
                    title="Aucune notification"
                    message="Demandes d'amis, candidatures et matchs apparaîtront ici."
                  />
                </Card>
              ) : (
                items.map((n) => {
                  const { text, to } = describe(n)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => void open(n)}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                        n.read_at ? 'border-line bg-surface' : 'border-accent-line bg-accent-soft'
                      } ${to ? 'active:scale-[0.99]' : ''}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${n.read_at ? 'bg-surface-2 text-muted' : 'bg-accent text-accent-contrast'}`}>
                        <UserPlus size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{text}</span>
                        <span className="block text-[11px] text-muted">{fmtWhen(n.created_at)}</span>
                      </span>
                      {!n.read_at && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" />}
                    </button>
                  )
                })
              )}
            </section>
          </>
        )}
      </Page>
    </div>
  )
}
