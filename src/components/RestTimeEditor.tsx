import { useEffect, useState } from 'react'
import { Play, Timer } from 'lucide-react'
import { Button, Modal, NumberField } from '@/components/ui'
import { t, useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** Paliers rapides proposés dans l'éditeur de repos. */
const PRESETS = [30, 60, 90, 120, 180]

/**
 * Pastille « temps de repos » : identique dans la séance en cours et dans
 * l'éditeur de programme (même geste, même modale des deux côtés).
 * `onStart` n'est fourni que pendant une séance : il lance le chrono.
 */
export function RestTimeChip({
  seconds,
  onEdit,
  onStart,
  className,
}: {
  seconds: number
  onEdit: () => void
  onStart?: () => void
  className?: string
}) {
  useLang()
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        type="button"
        onClick={onEdit}
        title={t('logger.restEdit')}
        aria-label={t('logger.restEdit')}
        className="tabular flex h-7 items-center gap-1 rounded-lg bg-surface-2 px-2 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
      >
        <Timer size={12} />
        {seconds}s
      </button>
      {onStart && (
        <button
          type="button"
          onClick={onStart}
          title={t('logger.restStart')}
          aria-label={t('logger.restStart')}
          className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-surface-2 px-1.5 text-accent transition-colors hover:brightness-110"
        >
          <Play size={12} />
        </button>
      )}
    </div>
  )
}

/** Modale d'édition du temps de repos d'un exercice (séance ou programme). */
export function RestTimeModal({
  open,
  onClose,
  exerciseName,
  value,
  onSave,
  onStart,
}: {
  open: boolean
  onClose: () => void
  exerciseName?: string
  value: number
  onSave: (seconds: number) => void
  onStart?: (seconds: number) => void
}) {
  useLang()
  const [draft, setDraft] = useState(value)

  // La valeur de référence peut changer (autre exercice) : on repart du réel.
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  const seconds = () => Math.max(0, Math.round(draft))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('logger.restTitle', { name: exerciseName ?? t('logger.restFallbackName') })}
      size="sm"
    >
      <p className="mb-2 text-xs font-semibold text-muted">{t('logger.restHint')}</p>
      <NumberField
        value={draft}
        onChange={(v) => setDraft(v ?? 0)}
        step={15}
        min={0}
        max={600}
        decimals={0}
        suffix="s"
        ariaLabel={t('logger.restAria')}
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setDraft(s)}
            className={cn(
              'tabular rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
              draft === s
                ? 'border-accent-solid bg-accent-solid text-accent-contrast'
                : 'border-line bg-surface-2 text-muted hover:text-ink',
            )}
          >
            {s}s
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {onStart && (
          <Button
            block
            variant="primary"
            onClick={() => {
              const secs = seconds()
              onSave(secs)
              onClose()
              if (secs > 0) onStart(secs)
            }}
          >
            <Play size={14} /> {t('logger.restLaunch')}
          </Button>
        )}
        <Button block onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          block
          onClick={() => {
            onSave(seconds())
            onClose()
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}