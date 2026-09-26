/**
 * Filtre de période canonique de l'app : 30 j · 3 mois · 6 mois · 1 an · tout.
 * Toujours ces 5 boutons, toujours dans cet ordre (défaut : 3 mois).
 * Utilisé par les stats, les stats d'exercice, l'historique et les profils.
 */
import { Chip } from '@/components/ui'
import { t, useLang } from '@/lib/i18n'
import { RANGE_LABEL_KEYS, type RangeFilter } from '@/lib/utils'

export function RangeChips({
  value,
  onChange,
  size = 'md',
}: {
  value: RangeFilter
  onChange: (range: RangeFilter) => void
  size?: 'sm' | 'md'
}) {
  useLang()
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {RANGE_LABEL_KEYS.map(([range, key]) => (
        <Chip key={range} size={size} active={value === range} onClick={() => onChange(range)}>
          {t(key)}
        </Chip>
      ))}
    </div>
  )
}