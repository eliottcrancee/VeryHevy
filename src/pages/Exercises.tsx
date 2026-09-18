import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CloudDownload,
  Database,
  Dumbbell,
  FileJson,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import type { ExerciseCategory } from '@/types'
import { CATEGORY_META, MUSCLE_GROUPS } from '@/types'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Chip, ConfirmDialog, EmptyState, Field, IconButton, Input, Menu, Modal, Segmented } from '@/components/ui'
import { ExercisePicker, ExerciseRow } from '@/components/ExercisePicker'
import { ExerciseFormModal } from '@/components/ExerciseFormModal'
import { fetchFreeExerciseDb, parseExternalExercises } from '@/lib/importers'
import { SEED_EXERCISES } from '@/lib/seed'
import { normalize } from '@/lib/utils'

const SEED_IDS = new Set(SEED_EXERCISES.map((e) => e.id))

type SortKey = 'nom' | 'recent' | 'favoris'

export default function ExercisesPage() {
  const exercises = useStore((s) => s.exercises)
  const importExercises = useStore((s) => s.importExercises)
  const replaceLibraryWith = useStore((s) => s.replaceLibraryWith)
  const restoreBuiltinExercises = useStore((s) => s.restoreBuiltinExercises)
  const removeImportedExercises = useStore((s) => s.removeImportedExercises)
  const notify = useStore((s) => s.notify)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ExerciseCategory | 'tous'>('tous')
  const [muscle, setMuscle] = useState('tous')
  const [equipment, setEquipment] = useState('tous')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [onlyCustom, setOnlyCustom] = useState(false)
  const [onlyPhotos, setOnlyPhotos] = useState(false)
  const [sort, setSort] = useState<SortKey>('nom')
  const [showFilters, setShowFilters] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState<string[]>([])
  const [confirmPrune, setConfirmPrune] = useState(false)

  const importedCount = exercises.filter((e) => !e.isCustom && !SEED_IDS.has(e.id)).length

  const isDefault = exercises.length > 0 && exercises.every((e) => e.source === 'veryhevy')
  const hasPhotos = exercises.some((e) => e.images.length > 0)

  const filtered = useMemo(() => {
    const q = normalize(query)
    const list = exercises
      .filter((e) => (category === 'tous' ? true : e.category === category))
      .filter((e) => (muscle === 'tous' ? true : e.primaryMuscles.includes(muscle) || e.secondaryMuscles.includes(muscle)))
      .filter((e) => (equipment === 'tous' ? true : e.equipment === equipment))
      .filter((e) => (onlyFavorites ? e.isFavorite : true))
      .filter((e) => (onlyCustom ? e.isCustom : true))
      .filter((e) => (onlyPhotos ? e.images.length > 0 : true))
      .filter((e) => {
        if (!q) return true
        return (
          normalize(e.name).includes(q) ||
          normalize(e.altName ?? '').includes(q) ||
          e.primaryMuscles.some((m) => normalize(m).includes(q)) ||
          normalize(e.equipment).includes(q)
        )
      })

    if (sort === 'favoris') {
      list.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name, 'fr'))
    } else if (sort === 'recent') {
      list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    }
    return list
  }, [exercises, query, category, muscle, equipment, onlyFavorites, onlyCustom, onlyPhotos, sort])

  const equipmentOptions = useMemo(() => [...new Set(exercises.map((e) => e.equipment))].sort(), [exercises])
  const activeFilters =
    (category !== 'tous' ? 1 : 0) +
    (muscle !== 'tous' ? 1 : 0) +
    (equipment !== 'tous' ? 1 : 0) +
    (onlyFavorites ? 1 : 0) +
    (onlyCustom ? 1 : 0) +
    (onlyPhotos ? 1 : 0)

  /* -------------------------------- import -------------------------------- */

  const runImport = async (mode: 'merge' | 'replace') => {
    setImporting(true)
    setImportLog(['Téléchargement de la base free-exercise-db…'])
    try {
      const list = await fetchFreeExerciseDb()
      setImportLog((l) => [...l, `${list.length} exercices reçus, import en cours…`])
      if (mode === 'replace') {
        replaceLibraryWith(list)
        setImportLog((l) => [...l, `✓ Bibliothèque remplacée par ${list.length} exercices.`])
      } else {
        const result = importExercises(list)
        setImportLog((l) => [
          ...l,
          `✓ ${result.added} ajoutés, ${result.updated} enrichis (photos), ${result.skipped} déjà présents.`,
        ])
      }
      notify(`${list.length} exercices importés`, 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setImportLog((l) => [...l, `✗ Échec : ${message}`])
      notify('Import impossible', 'error')
    } finally {
      setImporting(false)
    }
  }

  const importFile = async (file: File) => {
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = parseExternalExercises(JSON.parse(text))
      const result = importExercises(parsed)
      setImportLog([
        `Fichier « ${file.name} » : ${parsed.length} exercices lus.`,
        `✓ ${result.added} ajoutés, ${result.updated} enrichis, ${result.skipped} ignorés.`,
      ])
      notify(`${result.added} exercices importés`, 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue'
      setImportLog([`✗ Échec : ${message}`])
      notify('Fichier invalide', 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Exercices"
        subtitle={`${exercises.length} exercices · ${exercises.filter((e) => e.isCustom).length} personnalisés`}
        actions={
          <>
            <IconButton label="Importer" onClick={() => setImportOpen(true)}>
              <CloudDownload size={18} />
            </IconButton>
            <Menu
              align="right"
              trigger={({ toggle }) => (
                <IconButton label="Options" onClick={toggle}>
                  <Plus size={19} />
                </IconButton>
              )}
              items={[
                { label: 'Créer un exercice', icon: <Plus size={15} />, onClick: () => setCreateOpen(true) },
                { label: 'Importer la base complète', icon: <Database size={15} />, onClick: () => setImportOpen(true) },
                { label: 'Parcourir et ajouter', icon: <Dumbbell size={15} />, onClick: () => setPickerOpen(true) },
                {
                  label: 'Restaurer les exercices par défaut',
                  icon: <RefreshCw size={15} />,
                  onClick: restoreBuiltinExercises,
                },
                {
                  label: `Retirer les exercices importés (${importedCount})`,
                  icon: <Trash2 size={15} />,
                  danger: true,
                  hidden: importedCount === 0,
                  onClick: () => setConfirmPrune(true),
                },
              ]}
            />
          </>
        }
      />

      <Page className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="pl-9"
            />
            {query && (
              <IconButton
                label="Effacer"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2"
              >
                <X size={14} />
              </IconButton>
            )}
          </div>
          <Button
            variant={activeFilters ? 'primary' : 'secondary'}
            onClick={() => setShowFilters((v) => !v)}
            className="h-11 shrink-0"
          >
            <Filter size={16} />
            {activeFilters > 0 && <span className="text-xs">{activeFilters}</span>}
          </Button>
          <Button variant="secondary" className="h-11 shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
          </Button>
        </div>

        {showFilters && (
          <Card className="space-y-3 p-3.5">
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">Catégorie</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={category === 'tous'} onClick={() => setCategory('tous')}>
                  Toutes
                </Chip>
                {(Object.keys(CATEGORY_META) as ExerciseCategory[]).map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                    {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">Muscle</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={muscle === 'tous'} onClick={() => setMuscle('tous')}>
                  Tous
                </Chip>
                {MUSCLE_GROUPS.map((m) => (
                  <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
                    {m}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">Matériel</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip active={equipment === 'tous'} onClick={() => setEquipment('tous')}>
                  Tout
                </Chip>
                {equipmentOptions.map((eq) => (
                  <Chip key={eq} active={equipment === eq} onClick={() => setEquipment(eq)}>
                    {eq}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Chip active={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
                <Star size={12} fill={onlyFavorites ? 'currentColor' : 'none'} /> Favoris
              </Chip>
              <Chip active={onlyCustom} onClick={() => setOnlyCustom((v) => !v)}>
                Personnalisés
              </Chip>
              {hasPhotos && (
                <Chip active={onlyPhotos} onClick={() => setOnlyPhotos((v) => !v)}>
                  Avec photos
                </Chip>
              )}
              {activeFilters > 0 && (
                <Chip
                  onClick={() => {
                    setCategory('tous')
                    setMuscle('tous')
                    setEquipment('tous')
                    setOnlyFavorites(false)
                    setOnlyCustom(false)
                    setOnlyPhotos(false)
                  }}
                >
                  <X size={12} /> Réinitialiser
                </Chip>
              )}
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-muted">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</p>
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'nom', label: 'A→Z' },
              { value: 'favoris', label: 'Favoris' },
              { value: 'recent', label: 'Récents' },
            ]}
            className="w-56"
          />
        </div>

        {!filtered.length ? (
          <Card>
            <EmptyState
              icon={<Dumbbell size={26} />}
              title="Aucun exercice"
              message={
                isDefault
                  ? 'Importez la base complète ou créez vos propres exercices.'
                  : 'Ajustez vos filtres ou créez un nouvel exercice.'
              }
              action={
                <Button variant="primary" onClick={() => (isDefault ? setImportOpen(true) : setCreateOpen(true))}>
                  {isDefault ? (
                    <>
                      <CloudDownload size={16} /> Importer la base
                    </>
                  ) : (
                    <>
                      <Plus size={16} /> Créer un exercice
                    </>
                  )}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-1.5">
            {filtered.slice(0, 400).map((ex) => (
              <Link key={ex.id} to={`/exercices/${ex.id}`}>
                <ExerciseRow exercise={ex} showFavorite={false} />
              </Link>
            ))}
            {filtered.length > 400 && (
              <p className="py-3 text-center text-xs text-muted">
                400 exercices affichés sur {filtered.length} — affinez la recherche.
              </p>
            )}
          </div>
        )}
      </Page>

      <ExerciseFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ExercisePicker open={pickerOpen} onClose={() => setPickerOpen(false)} multiple onPick={() => {}} />

      {/* Import */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importer des exercices" size="md">
        <div className="space-y-4">
          <Card className="border-accent-line bg-accent-soft p-3.5">
            <p className="text-sm font-bold">Base libre free-exercise-db</p>
            <p className="mt-1 text-xs text-muted">
              876 exercices (musculation, cardio, étirements, pliométrie, haltérophilie…) avec photos animées et
              instructions. Domaine public, téléchargé depuis GitHub.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" disabled={importing} onClick={() => runImport('merge')}>
                {importing ? <RefreshCw size={14} className="animate-spin" /> : <CloudDownload size={14} />}
                Compléter ma bibliothèque
              </Button>
              <Button size="sm" disabled={importing} onClick={() => runImport('replace')}>
                Remplacer tout
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              « Remplacer tout » efface la bibliothèque actuelle (y compris vos exercices personnalisés).
              Préférez « Compléter », qui détecte les doublons par nom.
            </p>
          </Card>

          <Field label="Or, importer un fichier JSON">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-2 py-6 text-sm text-muted transition-colors hover:text-ink">
              <Upload size={16} />
              Choisir un fichier .json
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importFile(file)
                }}
              />
            </label>
          </Field>

          <p className="flex items-start gap-2 text-[11px] text-muted">
            <FileJson size={14} className="mt-0.5 shrink-0" />
            Formats acceptés : export VeryHevy, ou tableau d’objets au format free-exercise-db (name, category,
            primaryMuscles, equipment, images…). Les doublons sont détectés par nom.
          </p>

          {importLog.length > 0 && (
            <pre className="max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-[11px] whitespace-pre-wrap text-muted">
              {importLog.join('\n')}
            </pre>
          )}

          {importing && (
            <p className="flex items-center gap-2 text-xs text-accent">
              <RefreshCw size={13} className="animate-spin" /> Opération en cours…
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmPrune}
        title="Retirer les exercices importés ?"
        message={
          <>
            {importedCount > 1
              ? `${importedCount} exercices issus de la base libre seront retirés de la bibliothèque.`
              : `1 exercice issu de la base libre sera retiré de la bibliothèque.`}{' '}
            La base VeryHevy et vos exercices personnalisés sont conservés.
            <br />
            Vos séances passées ne sont pas touchées (leurs séries restent enregistrées).
          </>
        }
        confirmLabel="Retirer"
        danger
        onCancel={() => setConfirmPrune(false)}
        onConfirm={() => {
          removeImportedExercises()
          setConfirmPrune(false)
        }}
      />
    </div>
  )
}
