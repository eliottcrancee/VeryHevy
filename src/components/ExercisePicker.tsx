import { useEffect, useMemo, useState } from 'react'
import { Check, Dumbbell, Plus, Search, Star, X } from 'lucide-react'
import type { Exercise, ExerciseCategory } from '@/types'
import { CATEGORY_META, MUSCLE_GROUPS } from '@/types'
import { Button, Chip, IconButton, Input, Modal } from '@/components/ui'
import { useStore } from '@/store/store'
import { cn, normalize } from '@/lib/utils'
import { CategoryBadge, ExerciseFormModal } from '@/components/ExerciseFormModal'
import { t, tx, useLang } from '@/lib/i18n'

export function ExerciseAvatar({ exercise, size = 40 }: { exercise: Exercise; size?: number }) {
  const [failed, setFailed] = useState(false)
  const src = exercise.images[0]
  const meta = CATEGORY_META[exercise.category]
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl border border-line object-cover"
      />
    )
  }
  return (
    <span
      style={{ width: size, height: size, background: `color-mix(in srgb, ${meta.color} 18%, transparent)` }}
      className="flex shrink-0 items-center justify-center rounded-xl text-base"
    >
      {meta.emoji}
    </span>
  )
}

export function ExerciseRow({
  exercise,
  onClick,
  selected,
  trailing,
  showFavorite = true,
}: {
  exercise: Exercise
  onClick?: () => void
  selected?: boolean
  trailing?: React.ReactNode
  showFavorite?: boolean
}) {
  useLang()
  const toggleFavorite = useStore((s) => s.toggleFavorite)
  // Toute la ligne est la cible de sélection (pas seulement le nom) : sur
  // mobile, taper à côté du texte doit aussi sélectionner l'exercice.
  const clickable = Boolean(onClick)
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
        selected ? 'border-accent-line bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2',
        clickable && 'cursor-pointer select-none',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <ExerciseAvatar exercise={exercise} size={38} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{exercise.name}</span>
            {exercise.isCustom && (
              <span className="shrink-0 rounded bg-surface-3 px-1 py-0.5 text-[9px] font-bold text-muted uppercase">
                {t('exercise.perso')}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
            <span className="truncate">
              {exercise.primaryMuscles.slice(0, 2).map((m) => tx('muscle', m)).join(', ') ||
                tx('cat', exercise.category)}
            </span>
            <span>·</span>
            <span className="truncate">{tx('equip', exercise.equipment)}</span>
          </span>
        </span>
      </div>
      {showFavorite && (
        <IconButton
          label={exercise.isFavorite ? t('exercise.removeFav') : t('exercise.addFav')}
          onClick={(e) => {
            // Ne déclenche pas la sélection / navigation de la ligne.
            e.stopPropagation()
            toggleFavorite(exercise.id)
          }}
          className={cn('h-8 w-8', exercise.isFavorite && 'text-warning')}
        >
          <Star size={15} fill={exercise.isFavorite ? 'currentColor' : 'none'} />
        </IconButton>
      )}
      {trailing}
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface Props {
  open: boolean
  onClose: () => void
  onPick: (ids: string[]) => void
  multiple?: boolean
  title?: string
  initialSelected?: string[]
}

export function ExercisePicker({ open, onClose, onPick, multiple, title, initialSelected = [] }: Props) {
  useLang()
  const exercises = useStore((s) => s.exercises)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<ExerciseCategory | 'tous'>('tous')
  const [muscle, setMuscle] = useState<string>('tous')
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [showCreate, setShowCreate] = useState(false)

  // La sélection repart de zéro à chaque ouverture.
  useEffect(() => {
    if (open) setSelected(initialSelected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const results = useMemo(() => {
    const q = normalize(query)
    return exercises
      .filter((e) => (category === 'tous' ? true : e.category === category))
      .filter((e) => (muscle === 'tous' ? true : e.primaryMuscles.includes(muscle)))
      .filter((e) => (onlyFavorites ? e.isFavorite : true))
      .filter((e) => {
        if (!q) return true
        return (
          normalize(e.name).includes(q) ||
          normalize(e.altName ?? '').includes(q) ||
          e.primaryMuscles.some((m) => normalize(m).includes(q)) ||
          normalize(e.equipment).includes(q)
        )
      })
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
        return a.name.localeCompare(b.name, 'fr')
      })
  }, [exercises, query, category, muscle, onlyFavorites])

  const toggleSelect = (id: string) => {
    if (!multiple) {
      onPick([id])
      onClose()
      return
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const usedMuscles = useMemo(() => {
    const set = new Set<string>()
    exercises.forEach((e) => e.primaryMuscles.forEach((m) => set.add(m)))
    return MUSCLE_GROUPS.filter((m) => set.has(m))
  }, [exercises])

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={title ?? t('exercise.pickTitle')}
        size="lg"
        footer={
          multiple ? (
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!selected.length}
                onClick={() => {
                  onPick(selected)
                  onClose()
                }}
              >
                {selected.length > 0 ? t('exercise.addCount', { n: selected.length }) : t('exercise.add')}
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('exercise.searchEx')}
                className="pl-9"
                autoFocus
              />
              {query && (
                <IconButton
                  label={t('common.clear')}
                  onClick={() => setQuery('')}
                  className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2"
                >
                  <X size={14} />
                </IconButton>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowCreate(true)}
              className="h-11 w-11 shrink-0 px-0"
              aria-label={t('exercise.createAria')}
            >
              <Plus size={18} />
            </Button>
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Chip active={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
              <Star size={12} fill={onlyFavorites ? 'currentColor' : 'none'} /> {t('exercise.favorites')}
            </Chip>
            <Chip active={category === 'tous'} onClick={() => setCategory('tous')}>
              {t('exercise.allShort')}
            </Chip>
            {(Object.keys(CATEGORY_META) as ExerciseCategory[]).map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_META[c].emoji} {tx('cat', c)}
              </Chip>
            ))}
          </div>

          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <Chip active={muscle === 'tous'} onClick={() => setMuscle('tous')}>
              {t('exercise.allMuscles')}
            </Chip>
            {usedMuscles.map((m) => (
              <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
                {tx('muscle', m)}
              </Chip>
            ))}
          </div>

          <div className="space-y-1.5">
            {results.map((ex) => (
              <ExerciseRow
                key={ex.id}
                exercise={ex}
                showFavorite={false}
                selected={multiple && selected.includes(ex.id)}
                onClick={() => toggleSelect(ex.id)}
                trailing={
                  multiple ? (
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-md border',
                        selected.includes(ex.id)
                          ? 'border-accent-solid bg-accent-solid text-accent-contrast'
                          : 'border-line',
                      )}
                    >
                      {selected.includes(ex.id) && <Check size={14} strokeWidth={3} />}
                    </span>
                  ) : (
                    <Plus size={18} className="shrink-0 text-muted" />
                  )
                }
              />
            ))}
            {!results.length && (
              <div className="py-10 text-center text-sm text-muted">
                <Dumbbell className="mx-auto mb-2 opacity-40" />
                {t('exercise.noneFound')}
                <div className="mt-3">
                  <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
                    <Plus size={14} /> {t('exercise.createName', { name: query })}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ExerciseFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(created) => {
          if (multiple) setSelected((prev) => [...prev, created.id])
          else {
            onPick([created.id])
            onClose()
          }
        }}
      />
    </>
  )
}

export { CategoryBadge }