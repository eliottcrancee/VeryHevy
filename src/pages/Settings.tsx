import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  CloudDownload,
  Database,
  Download,
  Dumbbell,
  Info,
  Languages,
  LogOut,
  Moon,
  Monitor,
  Palette,
  RotateCcw,
  Sun,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react'
import type { AppData, Exercise, SocialProfile, Workout } from '@/types'
import { useStore } from '@/store/store'
import { deleteCloudData, isCloudSyncPaused, resumeCloudSync } from '@/lib/cloudSync'
import { deleteAccountEverywhere } from '@/lib/account'
import { listMyBlocks, unblockUser } from '@/lib/social'
import { useAuth } from '@/lib/auth'
import { isCloudEnabled } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/PageHeader'
import { Logo } from '@/components/Logo'
import { ProfileAvatar } from '@/components/ProfileAvatar'
import { applyLangAttr, t, useLang, type Lang } from '@/lib/i18n'
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Field,
  NumberField,
  SectionTitle,
  Segmented,
  Select,
} from '@/components/ui'
import { parseExternalExercises } from '@/lib/importers'
import { parseHevyCsv } from '@/lib/hevy'
import { cn, downloadJSON, formatDate, fromDateKey, notificationPermission, toDateKey } from '@/lib/utils'

const ACCENTS = [
  { key: 'settings.cBlue', value: '#4f83ff' },
  { key: 'settings.cIndigo', value: '#6366f1' },
  { key: 'settings.cViolet', value: '#8b5cf6' },
  { key: 'settings.cPink', value: '#ec4899' },
  { key: 'settings.cRed', value: '#ef4444' },
  { key: 'settings.cOrange', value: '#f97316' },
  { key: 'settings.cAmber', value: '#f59e0b' },
  { key: 'settings.cGreen', value: '#22c55e' },
  { key: 'settings.cTeal', value: '#14b8a6' },
  { key: 'settings.cCyan', value: '#06b6d4' },
]

export default function SettingsPage() {
  useLang()
  const setLang = (l: Lang) => {
    updateSettings({ lang: l })
    applyLangAttr(l)
  }
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const exercises = useStore((s) => s.exercises)
  const workouts = useStore((s) => s.workouts)
  const routines = useStore((s) => s.routines)
  const importData = useStore((s) => s.importData)
  const resetAll = useStore((s) => s.resetAll)
  const importExercises = useStore((s) => s.importExercises)
  const notify = useStore((s) => s.notify)
  const { user, cloudEnabled, signOut } = useAuth()

  const [confirmReset, setConfirmReset] = useState(false)
  const [pendingRestore, setPendingRestore] = useState<{
    name: string
    workouts: number
    routines: number
    exercises: number
    data: Partial<AppData>
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [hevyPreview, setHevyPreview] = useState<{ workouts: Workout[]; newExercises: Exercise[]; skipped: number } | null>(null)
  const [hevyBusy, setHevyBusy] = useState(false)
  const [confirmDeleteCloud, setConfirmDeleteCloud] = useState(false)
  const [cloudPaused, setCloudPaused] = useState(() => user ? isCloudSyncPaused(user.id) : false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)
  const [wiping, setWiping] = useState(false)
  const [blocks, setBlocks] = useState<SocialProfile[]>([])
  const [blocksLoaded, setBlocksLoaded] = useState(false)

  useEffect(() => {
    if (!cloudEnabled || !user) return
    listMyBlocks().then((l) => { setBlocks(l); setBlocksLoaded(true) }).catch(() => setBlocksLoaded(true))
  }, [cloudEnabled, user])

  const doUnblock = async (id: string) => {
    setBusy(true)
    try {
      await unblockUser(id)
      const name = blocks.find((p) => p.id === id)?.username
      setBlocks((prev) => prev.filter((p) => p.id !== id))
      notify(name ? t('settings.unblockedUser', { name }) : t('settings.unblocked'), 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : t('settings.unblockFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationPermission(),
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const hevyFileRef = useRef<HTMLInputElement>(null)

  const handleHevyFile = async (f: File) => {
    setHevyBusy(true)
    try {
      const text = await f.text()
      const parsed = parseHevyCsv(text, exercises, settings.defaultRestSeconds)
      const seen = new Set(workouts.map((w) => `${w.name}|||${w.startedAt}`))
      const fresh = parsed.workouts.filter((w) => !seen.has(`${w.name}|||${w.startedAt}`))
      const usedIds = new Set(fresh.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
      const freshExos = parsed.newExercises.filter((e) => usedIds.has(e.id))
      if (!fresh.length) throw new Error(t('settings.hevyEmpty'))
      setHevyPreview({ workouts: fresh, newExercises: freshExos, skipped: parsed.workouts.length - fresh.length })
    } catch (err) {
      notify(err instanceof Error ? err.message : t('settings.unreadable'), 'error')
    } finally {
      setHevyBusy(false)
    }
  }

  const confirmHevyImport = () => {
    if (!hevyPreview) return
    importData({ workouts: hevyPreview.workouts, exercises: hevyPreview.newExercises })
    const sets = hevyPreview.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
    notify(
      t('settings.hevyImported', { w: hevyPreview.workouts.length, sets }),
      'success',
    )
    setHevyPreview(null)
  }

  const lastSync = settings.lastSyncAt
    ? new Date(settings.lastSyncAt).toLocaleString('fr-FR')
    : t('settings.never')

  const eraseCloud = async () => {
    try {
      await deleteCloudData()
      setCloudPaused(true)
      notify(t('settings.cloudDeleted'), 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : t('settings.deleteFailed'), 'error')
    } finally {
      setConfirmDeleteCloud(false)
    }
  }

  const wipeAccount = async () => {
    setWiping(true)
    try {
      await deleteAccountEverywhere()
      resetAll()
      setConfirmDeleteAccount(false)
      await signOut()
      notify(t('settings.accountDeleted'), 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : t('settings.deleteFailed'), 'error')
    } finally {
      setWiping(false)
    }
  }

  const totalSets = workouts.reduce((n, w) => n + w.exercises.reduce((m, we) => m + we.sets.length, 0), 0)

  /** Active la notif de fin de repos (demande l'autorisation système au besoin). */
  const toggleRestNotify = async (v: boolean) => {
    if (!v) {
      updateSettings({ restNotifyEnabled: false })
      return
    }
    const current = notificationPermission()
    if (current === 'unsupported') {
      setNotifPerm(current)
      notify(t('settings.notifUnsupported'), 'error')
      return
    }
    if (current === 'denied') {
      setNotifPerm(current)
      updateSettings({ restNotifyEnabled: true })
      notify(t('settings.notifBlocked'), 'error')
      return
    }
    if (current === 'default') {
      try {
        const asked = await Notification.requestPermission()
        setNotifPerm(asked)
        if (asked !== 'granted') {
          notify(t('settings.notifDenied'), 'error')
          return
        }
      } catch {
        notify(t('settings.notifFailed'), 'error')
        return
      }
    }
    updateSettings({ restNotifyEnabled: true })
    notify(t('settings.notifEnabled'), 'success')
  }

  const exportAll = () => {
    downloadJSON(`veryhevy-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, {
      app: 'VeryHevy',
      version: 1,
      exportedAt: new Date().toISOString(),
      exercises,
      workouts,
      routines,
      settings,
    })
    notify(t('settings.backupDone'), 'success')
  }

  const exportExercises = () => {
    downloadJSON('veryhevy-exercices.json', exercises)
    notify(t('settings.exportedExercises'), 'success')
  }

  const handleImportFile = async (file: File) => {
    setBusy(true)
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>
      if (Array.isArray(json)) {
        const list = parseExternalExercises(json)
        importExercises(list)
        notify(t('settings.importedCount', { n: list.length }), 'success')
      } else {
        // Sauvegarde complète : on valide le fichier et on affiche son contenu
        // avant de fusionner, pour éviter les mauvaises surprises.
        const rec = (json ?? {}) as Partial<AppData> & { app?: unknown }
        const looksLikeBackup =
          rec.app === 'VeryHevy' || (Array.isArray(rec.workouts) && Array.isArray(rec.exercises))
        if (json === null || typeof json !== 'object' || !looksLikeBackup) {
          throw new Error(t('settings.notBackup'))
        }
        const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
        const w = count(rec.workouts)
        const r = count(rec.routines)
        const e = count(rec.exercises)
        if (!w && !r && !e) throw new Error(t('settings.backupEmpty'))
        setPendingRestore({ name: file.name, workouts: w, routines: r, exercises: e, data: rec })
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t('settings.unreadable'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} />

      <Page className="max-w-3xl space-y-6 pb-10">
        {/* Compte */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-extrabold text-accent">
              {(user?.user_metadata?.full_name as string | undefined)?.slice(0, 1).toUpperCase()
                ?? user?.email?.slice(0, 1).toUpperCase()
                ?? <Dumbbell size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {cloudEnabled && user
                  ? ((user.user_metadata?.full_name as string | undefined) ?? user.email)
                  : t('settings.accountLocal')}
              </p>
              {/* Fournisseur puis email sur sa propre ligne (l'email est long). */}
              {cloudEnabled && user ? (
                <>
                  <p className="truncate text-xs text-muted">{t('settings.accountGoogle')}</p>
                  <p className="truncate text-[11px] text-muted">{user.email}</p>
                </>
              ) : (
                <p className="truncate text-xs text-muted">
                  {isCloudEnabled ? t('settings.accountOffline') : t('settings.accountNoCloud')}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/profil" className="flex-1">
              <Button size="sm" variant="primary" block>{t('settings.myProfile')}</Button>
            </Link>
            {cloudEnabled && user && (
              <Button
                size="sm"
                variant="danger"
                block
                className="flex-1"
                onClick={() => {
                  void signOut()
                  notify(t('settings.signedOut'), 'info')
                }}
              >
                <LogOut size={14} /> {t('settings.logout')}
              </Button>
            )}
          </div>
        </Card>

        {/* Langue */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Languages size={13} /> {t('lang.title')}
            </span>
          </SectionTitle>
          <Segmented
            value={settings.lang ?? 'fr'}
            onChange={(v) => setLang(v as Lang)}
            options={[
              { value: 'fr', label: `🇫🇷 ${t('lang.fr')}` },
              { value: 'en', label: `🇬🇧 ${t('lang.en')}` },
            ]}
          />
          <p className="text-xs text-muted">{t('lang.hint')}</p>
        </Card>

        {/* Apparence */}
        <Card className="space-y-4 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Palette size={13} /> {t('settings.appearance')}
            </span>
          </SectionTitle>

          <Field label={t('settings.theme')}>
            <Segmented
              value={settings.theme}
              onChange={(v) => updateSettings({ theme: v })}
              options={[
                { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> {t('settings.themeDark')}</span> },
                { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={14} /> {t('settings.themeLight')}</span> },
                { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={14} /> {t('settings.themeAuto')}</span> },
              ]}
            />
          </Field>

          <Field label={t('settings.accent')}>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  title={t(a.key)}
                  onClick={() => updateSettings({ accent: a.value })}
                  style={{ background: a.value }}
                  className={cn(
                    'h-9 w-9 rounded-full transition-transform hover:scale-110',
                    settings.accent === a.value && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                  )}
                />
              ))}
            </div>
          </Field>
        </Card>

        {/* Unités */}
        <Card className="space-y-4 p-4">
          <SectionTitle className="mb-0">{t('settings.units')}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.weight')}>
              <Segmented
                value={settings.unit}
                onChange={(v) => updateSettings({ unit: v })}
                options={[
                  { value: 'kg', label: t('settings.kg') },
                  { value: 'lb', label: t('settings.lb') },
                ]}
              />
            </Field>
            <Field label={t('settings.distance')}>
              <Segmented
                value={settings.distanceUnit}
                onChange={(v) => updateSettings({ distanceUnit: v })}
                options={[
                  { value: 'km', label: t('settings.km') },
                  { value: 'mi', label: t('settings.mi') },
                ]}
              />
            </Field>
          </div>
        </Card>

        {/* Entraînement */}
        <Card className="space-y-4 p-4">
          <SectionTitle className="mb-0">{t('settings.training')}</SectionTitle>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.restDefault')}>
              <NumberField
                value={settings.defaultRestSeconds}
                onChange={(v) => updateSettings({ defaultRestSeconds: v ?? 90 })}
                step={15}
                min={0}
                max={900}
                decimals={0}
                suffix="s"
              />
            </Field>
            <Field label={t('settings.setsDefault')}>
              <NumberField
                value={settings.defaultSets}
                onChange={(v) => updateSettings({ defaultSets: v ?? 3 })}
                step={1}
                min={1}
                max={12}
                decimals={0}
              />
            </Field>
            <Field label={t('settings.weeklyGoal')}>
              <NumberField
                value={settings.weeklyGoal}
                onChange={(v) => updateSettings({ weeklyGoal: v ?? 4 })}
                step={1}
                min={0}
                max={14}
                decimals={0}
              />
            </Field>
            <Field label={t('settings.firstDay')}>
              <Select
                value={String(settings.firstDayOfWeek)}
                onChange={(e) => updateSettings({ firstDayOfWeek: Number(e.target.value) === 0 ? 0 : 1 })}
              >
                <option value="1">{t('settings.monday')}</option>
                <option value="0">{t('settings.sunday')}</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <Checkbox
              checked={settings.autoStartRest}
              onChange={(v) => updateSettings({ autoStartRest: v })}
              label={t('settings.autoStartRest')}
            />
            <Checkbox
              checked={settings.restSoundEnabled}
              onChange={(v) => updateSettings({ restSoundEnabled: v })}
              label={t('settings.restSound')}
            />
            <Checkbox
              checked={settings.restVibrateEnabled}
              onChange={(v) => updateSettings({ restVibrateEnabled: v })}
              label={t('settings.restVibrate')}
            />
            <Checkbox
              checked={settings.restNotifyEnabled}
              onChange={(v) => void toggleRestNotify(v)}
              label={t('settings.restNotify')}
            />
            {settings.restNotifyEnabled && notifPerm === 'denied' && (
              <p className="text-xs text-danger">{t('settings.notifBlockedDetail')}</p>
            )}
            {settings.restNotifyEnabled && notifPerm === 'unsupported' && (
              <p className="text-xs text-muted">{t('settings.notifUnsupportedDetail')}</p>
            )}
            <Checkbox
              checked={settings.keepAwake}
              onChange={(v) => updateSettings({ keepAwake: v })}
              label={t('settings.keepAwake')}
            />
            <Checkbox
              checked={settings.showRpe}
              onChange={(v) => updateSettings({ showRpe: v })}
              label={t('settings.showRpe')}
            />
          </div>
        </Card>

        {/* Records personnels */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Trophy size={13} /> {t('settings.prTitle')}
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">{t('settings.prHint')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={settings.recordsSince ? toDateKey(settings.recordsSince) : ''}
              onChange={(e) =>
                updateSettings({ recordsSince: e.target.value ? fromDateKey(e.target.value).toISOString() : null })
              }
              className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none transition-colors focus:border-accent focus:bg-surface"
              aria-label={t('settings.prAria')}
            />
            {settings.recordsSince && (
              <>
                <span className="text-xs text-muted">
                  {t('settings.prSince', { date: formatDate(settings.recordsSince, 'long') })}
                </span>
                <Button size="sm" onClick={() => updateSettings({ recordsSince: null })}>
                  <RotateCcw size={14} /> {t('settings.prReset')}
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Bibliothèque */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Database size={13} /> {t('settings.library')}
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            {t('settings.libraryStats', {
              t: exercises.length,
              c: exercises.filter((e) => e.isCustom).length,
              p: exercises.filter((e) => e.images.length > 0).length,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/exercices">
              <Button size="sm" variant="primary">
                <Database size={14} /> {t('settings.viewExercises')}
              </Button>
            </Link>
            <Button size="sm" disabled={busy} onClick={exportExercises}>
              <Download size={14} /> {t('settings.exportExercises')}
            </Button>
          </div>
        </Card>

        {/* Données */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">{t('settings.data')}</SectionTitle>
          <p className="text-sm text-muted">
            {t('settings.dataSummary', { w: workouts.length, r: routines.length, s: totalSets })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={exportAll}>
              <Download size={14} /> {t('settings.backup')}
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} /> {t('settings.restore')}
            </Button>
            <Button size="sm" onClick={() => hevyFileRef.current?.click()} disabled={hevyBusy}>
              <Download size={14} /> {t('settings.importHevy')}
            </Button>
            <input
              ref={hevyFileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleHevyFile(f)
                e.target.value = ''
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleImportFile(f)
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
              <Trash2 size={14} /> {t('settings.resetAll')}
            </Button>
          </div>
        </Card>

        {/* Synchronisation cloud */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <CloudDownload size={13} /> {t('settings.syncTitle')}
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">{t('settings.syncHint')}</p>
          <p className="text-xs text-muted">
            {t('settings.lastSync', { when: lastSync })}
            {settings.lastSyncError ? ` · ${settings.lastSyncError}` : ''}
          </p>
          {cloudEnabled && user && (
            <div>
              {cloudPaused ? <Button size="sm" onClick={() => { resumeCloudSync(user.id); setCloudPaused(false) }}>
                {t('settings.enableSync')}
              </Button> : <Button size="sm" variant="danger" onClick={() => setConfirmDeleteCloud(true)}>
                <Trash2 size={14} /> {t('settings.deleteCloud')}
              </Button>}
              <p className="mt-1 text-[11px] text-muted">
                {cloudPaused ? t('settings.syncPausedHint') : t('settings.deleteCloudHint')}
              </p>
            </div>
          )}
        </Card>

        {/* Zone danger : suppression de compte (cohérente, pas de demi-mesure) */}
        {cloudEnabled && user && (
          <Card className="space-y-3 border-danger/40 p-4">
            <SectionTitle className="mb-0">
              <span className="inline-flex items-center gap-1.5 text-danger">
                <Trash2 size={13} /> {t('settings.danger')}
              </span>
            </SectionTitle>
            <Button size="sm" variant="danger" onClick={() => setConfirmDeleteAccount(true)}>
              <Trash2 size={14} /> {t('settings.deleteAccount')}
            </Button>
            <p className="text-[11px] text-muted">{t('settings.deleteAccountHint')}</p>
          </Card>
        )}

        {/* Comptes bloqués */}
        {cloudEnabled && user && (
          <Card className="space-y-3 p-4">
            <SectionTitle className="mb-0">
              <span className="inline-flex items-center gap-1.5">
                <Ban size={13} /> {t('settings.blockedTitle')}
              </span>
            </SectionTitle>
            <p className="text-xs text-muted">{t('settings.blockedHint')}</p>
            {!blocksLoaded ? (
              <p className="text-sm text-muted">{t('settings.blockedLoading')}</p>
            ) : blocks.length === 0 ? (
              <p className="text-sm text-muted">{t('settings.blockedEmpty')}</p>
            ) : (
              <div className="space-y-1.5">
                {blocks.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
                    <ProfileAvatar url={p.avatar_url} name={p.display_name ?? p.username ?? '?'} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">@{p.username ?? '?'}</span>
                      {p.display_name && <span className="block truncate text-xs text-muted">{p.display_name}</span>}
                    </span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void doUnblock(p.id)}>
                      {t('settings.unblock')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* À propos */}
        <Card className="space-y-2 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Info size={13} /> {t('settings.about')}
            </span>
          </SectionTitle>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Logo size={22} />
            </span>
            <p className="text-sm text-muted">
              <strong className="text-ink">VeryHevy</strong> {t('settings.aboutText')}
            </p>
          </div>
          <p className="text-[11px] text-muted">{t('settings.aboutDb')}</p>
        </Card>
      </Page>

      <ConfirmDialog
        open={pendingRestore !== null}
        title={t('settings.restoreTitle')}
        message={
          pendingRestore && (
            <>
              {t('settings.restoreMessage1', {
                name: pendingRestore.name,
                w: pendingRestore.workouts,
                r: pendingRestore.routines,
                e: pendingRestore.exercises,
              })}
              <br />
              {t('settings.restoreMessage2a')}
              <strong>{t('settings.restoreMerge')}</strong>
              {t('settings.restoreMessage2b')}
            </>
          )
        }
        confirmLabel={t('settings.restoreConfirm')}
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          if (pendingRestore) importData(pendingRestore.data)
          setPendingRestore(null)
        }}
      />

      <ConfirmDialog
        open={confirmDeleteCloud}
        title={t('settings.deleteCloudTitle')}
        message={t('settings.deleteCloudMessage')}
        confirmLabel={t('settings.deleteCloudConfirm')}
        danger
        onCancel={() => setConfirmDeleteCloud(false)}
        onConfirm={() => void eraseCloud()}
      />

      <ConfirmDialog
        open={confirmDeleteAccount}
        title={t('settings.deleteAccountTitle')}
        message={t('settings.deleteAccountMessage')}
        confirmLabel={wiping ? t('settings.deleting') : t('settings.deleteEverything')}
        danger
        onCancel={() => setConfirmDeleteAccount(false)}
        onConfirm={() => void wipeAccount()}
      />

      <ConfirmDialog
        open={hevyPreview !== null}
        title={t('settings.hevyTitle')}
        message={
          hevyPreview && (
            <>
              {t('settings.hevyRange', {
                n: hevyPreview.workouts.length,
                d1: new Date(hevyPreview.workouts[0].startedAt).toLocaleDateString('fr-FR'),
                d2: new Date(hevyPreview.workouts[hevyPreview.workouts.length - 1].startedAt).toLocaleDateString('fr-FR'),
              })}
              <br />
              {hevyPreview.newExercises.length > 0
                ? t('settings.hevyNew', {
                    n: hevyPreview.newExercises.length,
                    names: hevyPreview.newExercises.slice(0, 8).map((e) => e.name).join(', '),
                    more: hevyPreview.newExercises.length > 8 ? '…' : '',
                  })
                : t('settings.hevyAllKnown')}
              {hevyPreview.skipped > 0 && (
                <>
                  <br />
                  {t('settings.hevySkipped', { n: hevyPreview.skipped })}
                </>
              )}
            </>
          )
        }
        confirmLabel={t('settings.hevyConfirm')}
        onCancel={() => setHevyPreview(null)}
        onConfirm={confirmHevyImport}
      />

      <ConfirmDialog
        open={confirmReset}
        title={t('settings.resetTitle')}
        message={t('settings.resetMessage')}
        confirmLabel={t('settings.resetConfirm')}
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetAll()
          setConfirmReset(false)
        }}
      />
    </div>
  )
}
