import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  CloudDownload,
  Database,
  Download,
  Info,
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
import { cn, downloadJSON, formatDate, fromDateKey, notificationPermission, pluralize, toDateKey } from '@/lib/utils'

const ACCENTS = [
  { name: 'Bleu', value: '#4f83ff' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Rouge', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Ambre', value: '#f59e0b' },
  { name: 'Vert', value: '#22c55e' },
  { name: 'Turquoise', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
]

export default function SettingsPage() {
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
      notify(name ? `Compte @${name} débloqué` : 'Compte débloqué', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Déblocage impossible', 'error')
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
      if (!fresh.length) throw new Error('Rien de nouveau : ces séances sont déjà importées')
      setHevyPreview({ workouts: fresh, newExercises: freshExos, skipped: parsed.workouts.length - fresh.length })
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fichier illisible', 'error')
    } finally {
      setHevyBusy(false)
    }
  }

  const confirmHevyImport = () => {
    if (!hevyPreview) return
    importData({ workouts: hevyPreview.workouts, exercises: hevyPreview.newExercises })
    const sets = hevyPreview.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
    notify(
      `${pluralize(hevyPreview.workouts.length, 'séance')} + ${sets} séries importées depuis Hevy 🎉`,
      'success',
    )
    setHevyPreview(null)
  }

  const lastSync = settings.lastSyncAt
    ? new Date(settings.lastSyncAt).toLocaleString('fr-FR')
    : 'jamais'

  const eraseCloud = async () => {
    try {
      await deleteCloudData()
      setCloudPaused(true)
      notify('Données d’entraînement supprimées du cloud. La synchro est en pause.', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error')
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
      notify('Compte supprimé', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error')
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
      notify('Notifications non prises en charge par ce navigateur', 'error')
      return
    }
    if (current === 'denied') {
      setNotifPerm(current)
      updateSettings({ restNotifyEnabled: true })
      notify('Notifications bloquées : autorisez-les dans les réglages du site', 'error')
      return
    }
    if (current === 'default') {
      try {
        const asked = await Notification.requestPermission()
        setNotifPerm(asked)
        if (asked !== 'granted') {
          notify('Autorisation de notification refusée', 'error')
          return
        }
      } catch {
        notify('Autorisation de notification impossible', 'error')
        return
      }
    }
    updateSettings({ restNotifyEnabled: true })
    notify('Notifications de fin de repos activées', 'success')
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
    notify('Sauvegarde téléchargée', 'success')
  }

  const exportExercises = () => {
    downloadJSON('veryhevy-exercices.json', exercises)
    notify('Bibliothèque exportée', 'success')
  }

  const handleImportFile = async (file: File) => {
    setBusy(true)
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>
      if (Array.isArray(json)) {
        const list = parseExternalExercises(json)
        importExercises(list)
        notify(`${list.length} exercices importés`, 'success')
      } else {
        // Sauvegarde complète : on valide le fichier et on affiche son contenu
        // avant de fusionner, pour éviter les mauvaises surprises.
        const rec = (json ?? {}) as Partial<AppData> & { app?: unknown }
        const looksLikeBackup =
          rec.app === 'VeryHevy' || (Array.isArray(rec.workouts) && Array.isArray(rec.exercises))
        if (json === null || typeof json !== 'object' || !looksLikeBackup) {
          throw new Error('Ce fichier n’est pas une sauvegarde VeryHevy')
        }
        const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0)
        const w = count(rec.workouts)
        const r = count(rec.routines)
        const e = count(rec.exercises)
        if (!w && !r && !e) throw new Error('Sauvegarde vide : rien à restaurer')
        setPendingRestore({ name: file.name, workouts: w, routines: r, exercises: e, data: rec })
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fichier illisible', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Réglages" />

      <Page className="max-w-3xl space-y-6 pb-10">
        {/* Compte */}
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-lg font-extrabold text-accent">
              {(user?.user_metadata?.full_name as string | undefined)?.slice(0, 1).toUpperCase()
                ?? user?.email?.slice(0, 1).toUpperCase()
                ?? '🏋️'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {cloudEnabled && user
                  ? ((user.user_metadata?.full_name as string | undefined) ?? user.email)
                  : 'Mode local'}
              </p>
              <p className="truncate text-xs text-muted">
                {cloudEnabled && user
                  ? `Connecté avec Google · ${user.email}`
                  : isCloudEnabled
                    ? 'Non connecté — tes données restent sur cet appareil'
                    : 'Cloud non configuré — 100 % local, aucune donnée envoyée'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/profil" className="flex-1">
              <Button size="sm" variant="primary" block>Mon profil</Button>
            </Link>
            {cloudEnabled && user && (
              <Button
                size="sm"
                variant="danger"
                block
                className="flex-1"
                onClick={() => {
                  void signOut()
                  notify('Déconnecté — tes données locales sont conservées', 'info')
                }}
              >
                <LogOut size={14} /> Déconnexion
              </Button>
            )}
          </div>
        </Card>

        {/* Apparence */}
        <Card className="space-y-4 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Palette size={13} /> Apparence
            </span>
          </SectionTitle>

          <Field label="Thème">
            <Segmented
              value={settings.theme}
              onChange={(v) => updateSettings({ theme: v })}
              options={[
                { value: 'dark', label: <span className="inline-flex items-center gap-1.5"><Moon size={14} /> Sombre</span> },
                { value: 'light', label: <span className="inline-flex items-center gap-1.5"><Sun size={14} /> Clair</span> },
                { value: 'system', label: <span className="inline-flex items-center gap-1.5"><Monitor size={14} /> Auto</span> },
              ]}
            />
          </Field>

          <Field label="Couleur d’accent">
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  title={a.name}
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
          <SectionTitle className="mb-0">Unités</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Poids">
              <Segmented
                value={settings.unit}
                onChange={(v) => updateSettings({ unit: v })}
                options={[
                  { value: 'kg', label: 'Kilogrammes' },
                  { value: 'lb', label: 'Livres' },
                ]}
              />
            </Field>
            <Field label="Distance">
              <Segmented
                value={settings.distanceUnit}
                onChange={(v) => updateSettings({ distanceUnit: v })}
                options={[
                  { value: 'km', label: 'Kilomètres' },
                  { value: 'mi', label: 'Miles' },
                ]}
              />
            </Field>
          </div>
        </Card>

        {/* Entraînement */}
        <Card className="space-y-4 p-4">
          <SectionTitle className="mb-0">Entraînement</SectionTitle>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Repos par défaut (secondes)">
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
            <Field label="Séries par défaut">
              <NumberField
                value={settings.defaultSets}
                onChange={(v) => updateSettings({ defaultSets: v ?? 3 })}
                step={1}
                min={1}
                max={12}
                decimals={0}
              />
            </Field>
            <Field label="Objectif hebdomadaire (séances)">
              <NumberField
                value={settings.weeklyGoal}
                onChange={(v) => updateSettings({ weeklyGoal: v ?? 4 })}
                step={1}
                min={0}
                max={14}
                decimals={0}
              />
            </Field>
            <Field label="Premier jour de la semaine">
              <Select
                value={String(settings.firstDayOfWeek)}
                onChange={(e) => updateSettings({ firstDayOfWeek: Number(e.target.value) === 0 ? 0 : 1 })}
              >
                <option value="1">Lundi</option>
                <option value="0">Dimanche</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <Checkbox
              checked={settings.autoStartRest}
              onChange={(v) => updateSettings({ autoStartRest: v })}
              label="Lancer le chrono de repos automatiquement quand je valide une série"
            />
            <Checkbox
              checked={settings.restSoundEnabled}
              onChange={(v) => updateSettings({ restSoundEnabled: v })}
              label="Bip sonore à la fin du repos"
            />
            <Checkbox
              checked={settings.restNotifyEnabled}
              onChange={(v) => void toggleRestNotify(v)}
              label="Notification système à la fin du repos (téléphone / PC)"
            />
            {settings.restNotifyEnabled && notifPerm === 'denied' && (
              <p className="text-xs text-danger">
                Notifications bloquées par le navigateur : autorisez-les dans les réglages du site pour
                en profiter.
              </p>
            )}
            {settings.restNotifyEnabled && notifPerm === 'unsupported' && (
              <p className="text-xs text-muted">Notifications non prises en charge par ce navigateur.</p>
            )}
            <Checkbox
              checked={settings.keepAwake}
              onChange={(v) => updateSettings({ keepAwake: v })}
              label="Garder l’écran allumé pendant la séance"
            />
            <Checkbox
              checked={settings.showRpe}
              onChange={(v) => updateSettings({ showRpe: v })}
              label="Afficher la colonne RPE (effort perçu)"
            />
          </div>
        </Card>

        {/* Records personnels */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Trophy size={13} /> Records personnels
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            Changement de salle, reprise après une pause ? Commence un nouvel
            arc : seules les séances postérieures à cette date comptent pour tes
            records (fiches exercices, statistiques et rapports).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={settings.recordsSince ? toDateKey(settings.recordsSince) : ''}
              onChange={(e) =>
                updateSettings({ recordsSince: e.target.value ? fromDateKey(e.target.value).toISOString() : null })
              }
              className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none transition-colors focus:border-accent focus:bg-surface"
              aria-label="Compter les records à partir du"
            />
            {settings.recordsSince && (
              <>
                <span className="text-xs text-muted">
                  Records comptés depuis le {formatDate(settings.recordsSince, 'long')}
                </span>
                <Button size="sm" onClick={() => updateSettings({ recordsSince: null })}>
                  <RotateCcw size={14} /> Tout recompter
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Bibliothèque */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Database size={13} /> Exercices
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            {exercises.length} exercices · {exercises.filter((e) => e.isCustom).length} personnalisés ·{' '}
            {exercises.filter((e) => e.images.length > 0).length} avec photos
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/exercices">
              <Button size="sm" variant="primary">
                <Database size={14} /> Voir les exercices
              </Button>
            </Link>
            <Button size="sm" disabled={busy} onClick={exportExercises}>
              <Download size={14} /> Exporter les exercices
            </Button>
          </div>
        </Card>

        {/* Données */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">Données</SectionTitle>
          <p className="text-sm text-muted">
            {pluralize(workouts.length, 'séance')} · {pluralize(routines.length, 'programme')} ·{' '}
            {pluralize(totalSets, 'série')} enregistrées. Stockées localement (IndexedDB)
            et synchronisées avec le cloud quand tu es connecté.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={exportAll}>
              <Download size={14} /> Sauvegarder (JSON)
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} /> Restaurer une sauvegarde
            </Button>
            <Button size="sm" onClick={() => hevyFileRef.current?.click()} disabled={hevyBusy}>
              <Download size={14} /> Importer depuis Hevy (CSV)
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
              <Trash2 size={14} /> Tout réinitialiser
            </Button>
          </div>
        </Card>

        {/* Synchronisation cloud */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <CloudDownload size={13} /> Synchronisation cloud
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            Tes données sont liées à ton compte Google et synchronisées automatiquement
            après chaque modification, toutes les 5 minutes et au retour d’internet.
          </p>
          <p className="text-xs text-muted">
            Dernière synchro : {lastSync}
            {settings.lastSyncError ? ` · ⚠ ${settings.lastSyncError}` : ''}
          </p>
          {cloudEnabled && user && (
            <div>
              {cloudPaused ? <Button size="sm" onClick={() => { resumeCloudSync(user.id); setCloudPaused(false) }}>
                Réactiver la synchronisation
              </Button> : <Button size="sm" variant="danger" onClick={() => setConfirmDeleteCloud(true)}>
                <Trash2 size={14} /> Supprimer mes entraînements du cloud
              </Button>}
              <p className="mt-1 text-[11px] text-muted">
                {cloudPaused ? 'La copie locale est conservée. Réactiver la synchro la renverra vers le cloud.'
                  : 'Efface séances, programmes et exercices en ligne puis met la synchro en pause. Les publications et le profil restent en ligne.'}
              </p>
            </div>
          )}
        </Card>

        {/* Zone danger : suppression de compte (cohérente, pas de demi-mesure) */}
        {cloudEnabled && user && (
          <Card className="space-y-3 border-danger/40 p-4">
            <SectionTitle className="mb-0">
              <span className="inline-flex items-center gap-1.5 text-danger">
                <Trash2 size={13} /> Zone danger
              </span>
            </SectionTitle>
            <Button size="sm" variant="danger" onClick={() => setConfirmDeleteAccount(true)}>
              <Trash2 size={14} /> Supprimer mon compte
            </Button>
            <p className="text-[11px] text-muted">
              Efface tout : séances, programmes, exercices, posts, sorties, messages,
              abonnements et profil — en ligne ET sur cet appareil — puis te déconnecte.
              Les notifs déjà reçues par d'autres peuvent rester visibles sans ton nom.
              Pense à faire une sauvegarde (Données) avant : irréversible.
            </p>
          </Card>
        )}

        {/* Comptes bloqués */}
        {cloudEnabled && user && (
          <Card className="space-y-3 p-4">
            <SectionTitle className="mb-0">
              <span className="inline-flex items-center gap-1.5">
                <Ban size={13} /> Comptes bloqués
              </span>
            </SectionTitle>
            <p className="text-xs text-muted">
              Un profil bloqué ne te voit plus (profil, recherche, listes, posts, séances)
              et ne peut plus te suivre. Toi, tu continues de le voir pour pouvoir le débloquer.
            </p>
            {!blocksLoaded ? (
              <p className="text-sm text-muted">Chargement…</p>
            ) : blocks.length === 0 ? (
              <p className="text-sm text-muted">Aucun compte bloqué.</p>
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
                      Débloquer
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
              <Info size={13} /> À propos
            </span>
          </SectionTitle>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Logo size={22} />
            </span>
            <p className="text-sm text-muted">
              <strong className="text-ink">VeryHevy</strong> — carnet d'entraînement personnel. Musculation, cardio,
              mobilité : tout se mesure, se coche et se compare.
            </p>
          </div>
          <p className="text-[11px] text-muted">
            Base d’exercices optionnelle : free-exercise-db (domaine public). Application 100 % locale, fonctionne
            hors ligne une fois installée.
          </p>
        </Card>
      </Page>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restaurer cette sauvegarde ?"
        message={
          pendingRestore && (
            <>
              « {pendingRestore.name} » contient {pluralize(pendingRestore.workouts, 'séance')},{' '}
              {pluralize(pendingRestore.routines, 'programme')} et {pendingRestore.exercises} exercice(s).
              <br />
              La restauration <strong>fusionne</strong> : vos données actuelles sont conservées, le
              contenu de la sauvegarde est ajouté ou mis à jour. Tes réglages de synchronisation
              restent inchangés.
            </>
          )
        }
        confirmLabel="Restaurer"
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => {
          if (pendingRestore) importData(pendingRestore.data)
          setPendingRestore(null)
        }}
      />

      <ConfirmDialog
        open={confirmDeleteCloud}
        title="Supprimer les entraînements du cloud ?"
        message="Séances, programmes et exercices en ligne seront effacés. La copie locale sera conservée et la synchronisation mise en pause. Publications et profil ne sont pas concernés."
        confirmLabel="Supprimer les entraînements"
        danger
        onCancel={() => setConfirmDeleteCloud(false)}
        onConfirm={() => void eraseCloud()}
      />

      <ConfirmDialog
        open={confirmDeleteAccount}
        title="Supprimer ton compte ?"
        message="Tes séances, programmes, exercices, posts, sorties, messages, abonnements et ton profil seront effacés en ligne ET sur cet appareil. Tu seras déconnecté. Irréversible — fais une sauvegarde avant."
        confirmLabel={wiping ? 'Suppression…' : 'Tout supprimer'}
        danger
        onCancel={() => setConfirmDeleteAccount(false)}
        onConfirm={() => void wipeAccount()}
      />

      <ConfirmDialog
        open={hevyPreview !== null}
        title="Importer depuis Hevy ?"
        message={
          hevyPreview && (
            <>
              {pluralize(hevyPreview.workouts.length, 'séance')} du{' '}
              {new Date(hevyPreview.workouts[0].startedAt).toLocaleDateString('fr-FR')}{' '}
              au {new Date(hevyPreview.workouts[hevyPreview.workouts.length - 1].startedAt).toLocaleDateString('fr-FR')}.
              <br />
              {hevyPreview.newExercises.length > 0
                ? `${hevyPreview.newExercises.length} nouvel(s) exercice(s) créé(s) : ${hevyPreview.newExercises.slice(0, 8).map((e) => e.name).join(', ')}${hevyPreview.newExercises.length > 8 ? '…' : ''}. Les autres sont rattachés à ta bibliothèque.`
                : 'Tous les exercices existent déjà dans ta bibliothèque.'}
              {hevyPreview.skipped > 0 && (
                <>
                  <br />
                  {hevyPreview.skipped} doublon(s) ignoré(s).
                </>
              )}
            </>
          )
        }
        confirmLabel="Importer"
        onCancel={() => setHevyPreview(null)}
        onConfirm={confirmHevyImport}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Tout réinitialiser ?"
        message="Tes séances, programmes et réglages de CET appareil seront effacés (propagé en ligne à la prochaine synchro). Ta bibliothèque repart de zéro. Tes posts, sorties, messages et abonnements en ligne sont conservés — supprime ton compte pour tout effacer. Pense à faire une sauvegarde avant."
        confirmLabel="Tout effacer"
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
