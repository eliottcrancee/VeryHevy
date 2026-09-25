import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
import type { AppData } from '@/types'
import { useStore } from '@/store/store'
import { deleteCloudData } from '@/lib/cloudSync'
import { useAuth } from '@/lib/auth'
import { isCloudEnabled } from '@/lib/supabase'
import { Page, PageHeader } from '@/components/PageHeader'
import { Logo } from '@/components/Logo'
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
  const [confirmDeleteCloud, setConfirmDeleteCloud] = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(() =>
    notificationPermission(),
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const lastSync = settings.lastSyncAt
    ? new Date(settings.lastSyncAt).toLocaleString('fr-FR')
    : 'jamais'

  const eraseCloud = async () => {
    try {
      await deleteCloudData()
      notify('Données cloud supprimées (cet appareil garde sa copie locale)', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error')
    } finally {
      setConfirmDeleteCloud(false)
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
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-lg font-extrabold text-accent">
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
                  ? 'Non connecté — vos données restent sur cet appareil'
                  : 'Cloud non configuré — 100 % local, aucune donnée envoyée'}
            </p>
          </div>
          <Link to="/profil">
            <Button size="sm" variant="primary">Mon profil</Button>
          </Link>
          {cloudEnabled && user && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                void signOut()
                notify('Déconnecté — vos données locales sont conservées', 'info')
              }}
            >
              <LogOut size={14} /> Déconnexion
            </Button>
          )}
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
            Changement de salle, reprise après une pause ? Commencez un nouvel
            arc : seules les séances postérieures à cette date comptent pour vos
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
              <Database size={13} /> Bibliothèque d’exercices
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            {exercises.length} exercices · {exercises.filter((e) => e.isCustom).length} personnalisés ·{' '}
            {exercises.filter((e) => e.images.length > 0).length} avec photos
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/exercices">
              <Button size="sm" variant="primary">
                <Database size={14} /> Gérer la bibliothèque
              </Button>
            </Link>
            <Button size="sm" disabled={busy} onClick={exportExercises}>
              <Download size={14} /> Exporter la bibliothèque
            </Button>
          </div>
        </Card>

        {/* Données */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">Données</SectionTitle>
          <p className="text-sm text-muted">
            {pluralize(workouts.length, 'séance')} · {pluralize(routines.length, 'programme')} ·{' '}
            {pluralize(totalSets, 'série')} enregistrées. Stockées localement (IndexedDB)
            et synchronisées avec le cloud quand vous êtes connecté.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={exportAll}>
              <Download size={14} /> Sauvegarder (JSON)
            </Button>
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload size={14} /> Restaurer une sauvegarde
            </Button>
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
            Vos données sont liées à votre compte Google et synchronisées automatiquement
            après chaque modification, toutes les 5 minutes et au retour d’internet.
          </p>
          <p className="text-xs text-muted">
            Dernière synchro : {lastSync}
            {settings.lastSyncError ? ` · ⚠ ${settings.lastSyncError}` : ''}
          </p>
          {cloudEnabled && user && (
            <div>
              <Button size="sm" variant="danger" onClick={() => setConfirmDeleteCloud(true)}>
                <Trash2 size={14} /> Supprimer mes données cloud
              </Button>
              <p className="mt-1 text-[11px] text-muted">
                Efface séances, programmes et exercices en ligne. La copie locale de cet appareil est conservée.
              </p>
            </div>
          )}
        </Card>

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
              contenu de la sauvegarde est ajouté ou mis à jour. Vos réglages de synchronisation
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
        title="Supprimer les données cloud ?"
        message="Vos séances, programmes et exercices stockés en ligne seront effacés. La copie locale de CET appareil est conservée."
        confirmLabel="Tout supprimer en ligne"
        danger
        onCancel={() => setConfirmDeleteCloud(false)}
        onConfirm={() => void eraseCloud()}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Tout réinitialiser ?"
        message="Toutes vos séances, programmes et réglages seront effacés. La bibliothèque d’exercices sera remise à sa version par défaut. Pensez à faire une sauvegarde avant."
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