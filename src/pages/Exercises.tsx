import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Dumbbell,
  Filter,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react'
import type { ExerciseCategory } from '@/types'
import { CATEGORY_META, MUSCLE_GROUPS } from '@/types'
import { useStore } from '@/store/store'
import { Page, PageHeader } from '@/components/PageHeader'
import { Button, Card, Chip, EmptyState, IconButton, Input, Segmented } from '@/components/ui'
import { ExerciseRow } from '@/components/ExercisePicker'
import { ExerciseFormModal } from '@/components/ExerciseFormModal'
import { normalize } from '@/lib/utils'

type SortKey = 'nom' | 'recent' | 'favoris'

export default function ExercisesPage() {
  const exercises = useStore((s) => s.exercises)

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

  /* -------------------------------- liste -------------------------------- */

  return (
    <div>
      <PageHeader
        title="Exercices"
        subtitle={`${exercises.length} exercices · ${exercises.filter((e) => e.isCustom).length} personnalisés`}
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
          <Button
            variant="secondary"
            className="h-11 shrink-0"
            aria-label="Créer un exercice"
            onClick={() => setCreateOpen(true)}
          >
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
              message="Ajustez vos filtres ou créez un nouvel exercice."
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus size={16} /> Créer un exercice
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
    </div>
  )
}
