import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing, Check, Dumbbell, HeartHandshake, MessageCircle, UserPlus, X } from 'lucide-react'
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
import { ProfileAvatar, profileNameOf } from '@/components/ProfileAvatar'
import { intlLocale } from '@/lib/utils'
import { t, useLang } from '@/lib/i18n'
import { Button, Card, EmptyState } from '@/components/ui'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return t('notif.justNow')
  if (diff < 3_600_000) return t('notif.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('notif.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return d.toLocaleDateString(intlLocale(), { day: 'numeric', month: 'short' })
}

/** Icône par type de notification. */
function notifIcon(type: string) {
  switch (type) {
    case 'follow_accepted':
    case 'new_follower':
      return <Check size={16} />
    case 'session_request':
    case 'session_invite':
      return <Dumbbell size={16} />
    case 'session_accepted':
      return <HeartHandshake size={16} />
    case 'session_invite_declined':
      return <MessageCircle size={16} />
    case 'message':
      return <MessageCircle size={16} />
    default:
      return <UserPlus size={16} />
  }
}
function describe(n: AppNotification): { text: string; to: string | null } {
  const p = n.payload as Record<string, string | undefined>
  const who = p.from_username ? `@${p.from_username}` : p.username ? `@${p.username}` : t('notif.someAthlete')
  const whoLink = p.from_username ? `/profil/${p.from_username}` : p.username ? `/profil/${p.username}` : null
  const sessionLink = p.session_id ? `/explorer?session=${encodeURIComponent(p.session_id)}` : '/explorer'
  switch (n.type) {
    case 'follow_request':
      return { text: t('notif.followRequest', { who }), to: whoLink }
    case 'follow_accepted':
      return { text: t('notif.followAccepted', { who }), to: whoLink }
    case 'new_follower':
      return { text: t('notif.newFollower', { who }), to: whoLink }
    case 'session_request': {
      const session = p.session_title ? `« ${p.session_title} »` : t('notif.yourOuting')
      return { text: t('notif.sessionJoin', { who, session }), to: sessionLink }
    }
    case 'session_invite': {
      const session = p.session_title ?? t('notif.aWorkout')
      return { text: t('notif.sessionInvite', { who, session }), to: sessionLink }
    }
    case 'session_invite_declined': {
      const detail = p.session_title ? ` (« ${p.session_title} »)` : ''
      return { text: t('notif.sessionDeclined', { who, detail }), to: sessionLink }
    }
    case 'session_accepted': {
      const detail = p.session_title ? ` : « ${p.session_title} »` : ''
      return { text: t('notif.sessionMatched', { who, detail }), to: sessionLink }
    }
    case 'message':
      return { text: t('notif.newMessage', { who }), to: p.from_id ? `/explorer?message=${encodeURIComponent(p.from_id)}` : '/explorer' }
    default:
      return { text: t('notif.generic'), to: null }
  }
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  useLang()
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
      notify(err instanceof Error ? err.message : t('notif.loadFailed'), 'error')
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
      notify(err instanceof Error ? err.message : t('notif.actionFailed'), 'error')
    }
  }

  const decide = async (r: FollowRequest, ok: boolean) => {
    setBusy(r.requester)
    try {
      if (ok) {
        await acceptFollowRequest(r.requester)
        notify(t('notif.requestAccepted', { who: `@${r.profile?.username ?? '?'}` }), 'success')
      } else {
        await declineFollowRequest(r.requester)
        notify(t('notif.requestDeclined'), 'info')
      }
      const [a, b] = await Promise.all([listNotifications(), listIncomingFollowRequests()])
      setItems(a)
      setIncoming(b)
    } catch (err) {
      notify(err instanceof Error ? err.message : t('notif.actionFailed'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const cancel = async (r: FollowRequest) => {
    setBusy(r.target)
    try {
      await cancelFollowRequest(r.target)
      notify(t('notif.requestCancelled'), 'info')
      setOutgoing((prev) => prev.filter((x) => x.target !== r.target))
    } catch (err) {
      notify(err instanceof Error ? err.message : t('notif.actionFailed'), 'error')
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
        title={t('notif.title')}
        back
        subtitle={unread > 0 ? `${unread} ${unread > 1 ? t('notif.unreadMany') : t('notif.unreadOne')}` : t('notif.allCaughtUp')}
        actions={
          unread > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => void readAll()}>
              <Check size={15} /> {t('notif.markAllRead')}
            </Button>
          ) : undefined
        }
      />
      <Page className="max-w-2xl space-y-4 pb-10">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">{t('common.loading')}</p>
        ) : (
          <>
            {incoming.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                  {t('notif.incomingTitle', { count: incoming.length })}
                </p>
                {incoming.map((r) => (
                  <Card key={r.requester} className="border-accent-line bg-accent-soft p-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => r.profile?.username && navigate(`/profil/${r.profile.username}`)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <ProfileAvatar url={r.profile?.avatar_url} name={profileNameOf(r.profile)} size={44} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold">@{r.profile?.username ?? '?'}</span>
                          {r.profile?.display_name && (
                            <span className="block truncate text-xs text-muted">{r.profile.display_name}</span>
                          )}
                          <span className="block text-[11px] text-muted">{t('notif.wantsToFollow')} · {fmtWhen(r.created_at)}</span>
                        </span>
                      </button>
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        block
                        disabled={busy === r.requester}
                        onClick={() => void decide(r, true)}
                      >
                        <Check size={14} /> {t('notif.accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        block
                        disabled={busy === r.requester}
                        onClick={() => void decide(r, false)}
                      >
                        <X size={14} /> {t('notif.decline')}
                      </Button>
                    </div>
                  </Card>
                ))}
              </section>
            )}

            {outgoing.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-extrabold tracking-wide text-muted uppercase">
                  {t('notif.outgoingTitle', { count: outgoing.length })}
                </p>
                {outgoing.map((r) => (
                  <Card key={r.target} className="flex items-center gap-3 p-3">
                    <button
                      type="button"
                      onClick={() => r.profile?.username && navigate(`/profil/${r.profile.username}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <ProfileAvatar url={r.profile?.avatar_url} name={profileNameOf(r.profile)} size={44} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">@{r.profile?.username ?? '?'}</span>
                        {r.profile?.display_name && (
                          <span className="block truncate text-xs text-muted">{r.profile.display_name}</span>
                        )}
                        <span className="block text-[11px] text-muted">{t('notif.pending')} · {fmtWhen(r.created_at)}</span>
                      </span>
                    </button>
                    <Button size="sm" variant="ghost" disabled={busy === r.target} onClick={() => void cancel(r)}>
                      {t('common.cancel')}
                    </Button>
                  </Card>
                ))}
              </section>
            )}

            <section className="space-y-2">
              <p className="text-xs font-extrabold tracking-wide text-muted uppercase">{t('notif.recentActivity')}</p>
              {items.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<BellRing size={24} />}
                    title={t('notif.emptyTitle')}
                    message={t('notif.emptyMessage')}
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
                        {notifIcon(n.type)}
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
