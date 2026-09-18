import { useRef, useState } from 'react'
import {
  CloudDownload,
  Database,
  Download,
  Info,
  Moon,
  Monitor,
  Palette,
  RefreshCw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AppData, Exercise } from '@/types'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
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
import { fetchFreeExerciseDb, parseExternalExercises } from '@/lib/importers'
import { cn, downloadJSON, pluralize } from '@/lib/utils'

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
  const replaceLibraryWith = useStore((s) => s.replaceLibraryWith)
  const notify = useStore((s) => s.notify)

  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const totalSets = workouts.reduce((n, w) => n + w.exercises.reduce((m, we) => m + we.sets.length, 0), 0)

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
        importData(json as Partial<AppData>)
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Fichier illisible', 'error')
    } finally {
      setBusy(false)
    }
  }

  const loadFullLibrary = async () => {
    setBusy(true)
    try {
      const list = await fetchFreeExerciseDb()
      const res = importExercises(list)
      notify(`${res.added} exercices ajoutés (${res.updated} enrichis)`, 'success')
    } catch {
      notify('Import impossible : vérifiez votre connexion', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Réglages" />

      <Page className="max-w-3xl space-y-6 pb-10">
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
            <Button size="sm" variant="primary" disabled={busy} onClick={loadFullLibrary}>
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <CloudDownload size={14} />}
              Importer free-exercise-db
            </Button>
            <Button size="sm" disabled={busy} onClick={exportExercises}>
              <Download size={14} /> Exporter la bibliothèque
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => setConfirmReplace(true)}
            >
              Remplacer par la base complète
            </Button>
          </div>
        </Card>

        {/* Données */}
        <Card className="space-y-3 p-4">
          <SectionTitle className="mb-0">Données</SectionTitle>
          <p className="text-sm text-muted">
            {pluralize(workouts.length, 'séance')} · {pluralize(routines.length, 'programme')} ·{' '}
            {pluralize(totalSets, 'série')} enregistrées. Tout est stocké localement dans votre navigateur
            (IndexedDB) — aucune donnée n’est envoyée sur un serveur.
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

        {/* À propos */}
        <Card className="space-y-2 p-4">
          <SectionTitle className="mb-0">
            <span className="inline-flex items-center gap-1.5">
              <Info size={13} /> À propos
            </span>
          </SectionTitle>
          <p className="text-sm text-muted">
            <strong className="text-ink">VeryHevy</strong> — carnet d’entraînement personnel. Musculation, cardio,
            mobilité : tout se mesure, se coche et se compare.
          </p>
          <p className="text-[11px] text-muted">
            Base d’exercices optionnelle : free-exercise-db (domaine public). Application 100 % locale, fonctionne
            hors ligne une fois installée.
          </p>
        </Card>
      </Page>

      <ConfirmDialog
        open={confirmReplace}
        title="Remplacer toute la bibliothèque ?"
        message="Vos exercices personnalisés et la base française seront effacés, puis remplacés par les 876 exercices de free-exercise-db."
        confirmLabel="Remplacer"
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={async () => {
          setConfirmReplace(false)
          setBusy(true)
          try {
            const list = await fetchFreeExerciseDb()
            replaceLibraryWith(list as Exercise[])
            notify('Bibliothèque remplacée', 'success')
          } catch {
            notify('Import impossible', 'error')
          } finally {
            setBusy(false)
          }
        }}
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