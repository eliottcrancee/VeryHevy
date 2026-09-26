import {
  createContext,
  memo,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, Minus, Palette, Plus, Star, X } from 'lucide-react'
import { t, useLang } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------
   Button
------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-solid text-accent-contrast hover:brightness-110 active:brightness-95 shadow-sm',
  secondary: 'bg-surface-3 text-ink hover:bg-surface-3/70 border border-line',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  outline: 'border border-line text-ink hover:bg-surface-2',
  danger: 'bg-danger-solid text-white hover:brightness-110',
  success: 'bg-success-solid text-white hover:brightness-110',
}

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-[filter,background-color,color,transform] duration-150 select-none',
        'disabled:opacity-45 disabled:pointer-events-none active:scale-[0.98]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        block && 'w-full',
        className,
      )}
    />
  )
}

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors',
        'hover:bg-surface-2 hover:text-ink active:scale-95 disabled:opacity-40',
        className,
      )}
    />
  )
}

/* ------------------------------------------------------------------
   Surfaces
------------------------------------------------------------------ */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-2xl border border-line bg-surface', className)}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="text-[13px] font-bold tracking-wider text-muted uppercase">{children}</h2>
      {action}
    </div>
  )
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode
  color?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        className,
      )}
      style={
        color
          ? { color, background: `color-mix(in srgb, ${color} 16%, transparent)` }
          : undefined
      }
    >
      {children}
    </span>
  )
}

export function Chip({
  active,
  children,
  onClick,
  className,
  color,
  size = 'md',
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
  color?: string
  size?: 'sm' | 'md'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active && color ? { background: color, borderColor: color } : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap transition-all',
        size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]',
        active
          ? 'border-accent-solid bg-accent-solid text-accent-contrast'
          : 'border-line bg-surface text-muted hover:border-muted/40 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Palette de couleurs proposée pour les programmes. */
export const PROGRAM_COLORS = [
  '#4f83ff',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#ef4444',
  '#0ea5e9',
  '#eab308',
  '#14b8a6',
]

/** Sélecteur de couleur : pastilles + roue libre pour une teinte perso. */
export function ColorPicker({
  value,
  onChange,
  className,
  label,
}: {
  value: string
  onChange: (color: string) => void
  className?: string
  label?: string
}) {
  const normalized = value.toLowerCase()
  const isCustom = !PROGRAM_COLORS.some((c) => c.toLowerCase() === normalized)
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {PROGRAM_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          aria-pressed={normalized === c.toLowerCase()}
          onClick={() => onChange(c)}
          style={{ background: c }}
          className={cn(
            'h-9 w-9 rounded-full transition-transform hover:scale-105',
            normalized === c.toLowerCase()
              ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
              : 'ring-1 ring-black/10',
          )}
        />
      ))}
      <label
        className={cn(
          'relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-dashed text-muted transition-colors hover:text-ink',
          isCustom ? 'border-transparent ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'border-line',
        )}
        style={isCustom ? { background: value } : undefined}
        title={label}
      >
        {!isCustom && <Palette size={16} />}
        <input
          type="color"
          value={value}
          aria-label={label}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer rounded-full opacity-0"
        />
      </label>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cn('flex rounded-xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------
   Formulaires
------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  )
}

const inputBase =
  'w-full rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-accent focus:bg-surface'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, 'h-11', className)} />
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputBase, 'min-h-24 resize-y py-2.5', className)} />
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputBase, 'h-11 appearance-none pr-9', className)}>
      {children}
    </select>
  )
}

export interface NumberFieldProps {
  value: number | undefined
  onChange: (v: number | undefined) => void
  step?: number
  min?: number
  max?: number
  placeholder?: string
  suffix?: string
  className?: string
  inputClassName?: string
  decimals?: number
  ariaLabel?: string
  /** Version dense pour les lignes de séries (boutons + texte réduits). */
  compact?: boolean
  /** Masque les boutons +/- : toute la largeur est dédiée à la saisie. */
  stepless?: boolean
  /** Valeur pré-remplie non encore touchée : affichée en fantôme (grisé). */
  phantom?: boolean
}

/** Champ numérique tactile : saisie directe + boutons +/- */
export const NumberField = memo(function NumberField({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  placeholder,
  suffix,
  className,
  inputClassName,
  decimals = 1,
  ariaLabel,
  compact,
  stepless,
  phantom,
}: NumberFieldProps) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value))
  }, [value])

  const commit = (raw: string) => {
    const cleaned = raw.replace(',', '.').trim()
    if (cleaned === '' || cleaned === '-') {
      onChange(undefined)
      return
    }
    let n = Number(cleaned)
    if (Number.isNaN(n)) return
    if (min !== undefined) n = Math.max(min, n)
    if (max !== undefined) n = Math.min(max, n)
    onChange(n)
  }

  const bump = (dir: 1 | -1) => {
    const base = value ?? 0
    let next = base + dir * step
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    next = Number(next.toFixed(decimals))
    onChange(next)
    setText(String(next))
  }

  const btnCls = compact
    ? 'flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-90'
    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-90'

  return (
    <div
      className={cn(
        'flex h-11 min-w-0 items-center rounded-xl border border-line bg-surface-2 px-1 transition-colors focus-within:border-accent',
        className,
      )}
    >
      {!stepless && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(-1)}
          className={btnCls}
          aria-label={t('ui.minus')}
        >
          <Minus size={compact ? 12 : 14} />
        </button>
      )}
      <div className="relative min-w-0 flex-1">
        <input
          aria-label={ariaLabel}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            focused.current = true
            // Remplacement direct : pas besoin d'effacer la valeur pré-remplie.
            e.target.select()
          }}
          onBlur={() => {
            focused.current = false
            commit(text)
          }}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          className={cn(
            // 16px minimum : iOS ne zoome pas automatiquement au focus.
            'tabular w-full min-w-0 bg-transparent text-center text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted/60',
            // Fantôme : valeur pré-remplie pas encore touchée.
            phantom && 'font-medium text-muted/70',
            suffix ? 'pr-7 pl-1' : 'px-1',
            inputClassName,
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[10px] font-semibold whitespace-nowrap text-muted">
            {suffix}
          </span>
        )}
      </div>
      {!stepless && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(1)}
          className={btnCls}
          aria-label={t('ui.plus')}
        >
          <Plus size={compact ? 12 : 14} />
        </button>
      )}
    </div>
  )
})

/** Secondes → "m:ss" (ex. 90 → "1:30"). */
export function formatClock(totalSeconds: number | undefined): string {
  if (totalSeconds === undefined || totalSeconds === null || Number.isNaN(totalSeconds)) return ''
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export interface DurationFieldProps {
  /** Durée en secondes. */
  value: number | undefined
  onChange: (v: number | undefined) => void
  className?: string
  ariaLabel?: string
  /** Valeur pré-remplie non encore touchée : affichée en fantôme (grisé). */
  phantom?: boolean
}

/**
 * Saisie de durée en continu, style chrono (idéal cardio) : UN seul champ,
 * chaque chiffre tapé décale les précédents vers la gauche — « 1 » → 0:01,
 * « 13 » → 0:13, « 130 » → 1:30, « 13045 » → 1:30:45. Pas de « : » à taper,
 * aucun saut de focus, retour arrière = on retire le dernier chiffre.
 */
export const DurationField = memo(function DurationField({ value, onChange, className, ariaLabel, phantom }: DurationFieldProps) {
  /** Secondes → chiffres bruts, sans zéros de tête (90 → « 130 », 3723 → « 10203 », 5 → « 5 »). */
  const digitsOf = (v: number | undefined): string => {
    if (v === undefined || v === null || Number.isNaN(v)) return ''
    const s = Math.max(0, Math.round(v))
    if (s === 0) return ''
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}${String(m).padStart(2, '0')}${String(sec).padStart(2, '0')}`
    if (m > 0) return `${m}${String(sec).padStart(2, '0')}`
    return String(sec)
  }

  /** Chiffres bruts → secondes (groupés par la droite : SS MM HH). Tout-zéro = vide. */
  const totalOf = (digits: string): number | undefined => {
    if (!digits || /^0+$/.test(digits)) return undefined
    const d = digits.slice(-6).padStart(6, '0')
    const sec = Number(d.slice(4, 6))
    const min = Number(d.slice(2, 4))
    const h = Number(d.slice(0, 2))
    return h * 3600 + min * 60 + sec
  }

  const [digits, setDigits] = useState(() => digitsOf(value))
  const focused = useRef(false)

  // Resynchronise depuis le store quand on n'est pas en train de saisir.
  useEffect(() => {
    if (!focused.current) setDigits(digitsOf(value))
  }, [value])

  // Affichage BRUT groupé (sans report de retenue) pendant la saisie : taper
  // « 5923 » montre transitoirement « 5:92 » puis « 59:23 ». Si on normalisait
  // en direct (« 5:92 » → « 6:32 »), la suite de la frappe repartirait d'un
  // texte différent de ce qui a été tapé et tout serait corrompu (« 1:03:23 »).
  // La normalisation n'a lieu qu'au blur (et pour les valeurs du store).
  const rawDisplay = (d: string): string => {
    if (!d) return ''
    const sec = d.slice(-2).padStart(2, '0')
    const rest = d.slice(0, -2)
    if (!rest) return `0:${sec}`
    const min = rest.slice(-2)
    const h = rest.slice(0, -2)
    return h ? `${h}:${min}:${sec}` : `${min}:${sec}`
  }

  const display = rawDisplay(digits)

  return (
    <div
      className={cn(
        'flex h-9 min-w-0 items-center justify-center rounded-xl border border-line bg-surface-2/70 px-1 transition-colors focus-within:border-accent',
        className,
      )}
      title={t('ui.durationHint')}
    >
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder="0:00"
        onFocus={(e) => {
          focused.current = true
          // Remplacement direct : pas besoin d'effacer la valeur pré-remplie.
          e.target.select()
        }}
        onBlur={() => {
          focused.current = false
          // Renormalise l'affichage (ex. « 199 » → 2:39).
          setDigits(digitsOf(totalOf(digits)))
        }}
        onChange={(e) => {
          // Chiffres seuls, sans zéros de tête, 6 derniers max : la frappe
          // décale tout seule (« 0:05 » + « 9 » → « 59 », pas « 0059 »).
          // Tout-zéro (ex. restes du rembourrage « 00 » après effacements) = vide,
          // sinon on ne pourrait jamais tout effacer au retour arrière.
          const next = e.target.value.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(-6)
          if (!next) {
            setDigits('')
            onChange(undefined)
            return
          }
          setDigits(next)
          onChange(totalOf(next))
        }}
        className={cn(
          'tabular w-full min-w-0 bg-transparent px-1 text-center text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted/60',
          phantom && 'font-medium text-muted/70',
        )}
      />
    </div>
  )
})

export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  className?: string
}) {
  useLang()
  useLang()
  const id = useId()
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            // Piste 40 px, pastille 20 px, marges 2 px : positions en px fixes
            // (pas de rem, insensible à la taille de police racine).
            // Repos : x = 2. Actif : x = 40 − 20 − 2 − 2 = 16.
            'absolute top-[2px] left-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[16px]' : 'translate-x-0',
          )}
        />
      </button>
      {/* `htmlFor` suffit : le navigateur transfère lui-même le clic au bouton,
          un onClick supplémentaire déclencherait le basculement deux fois. */}
      <label htmlFor={id} className="cursor-pointer text-sm">
        {label}
      </label>
    </div>
  )
}

export function Rating({
  value,
  onChange,
  size = 20,
}: {
  value?: number
  onChange: (v: number) => void
  size?: number
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          className="transition-transform hover:scale-110 active:scale-95"
          aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
        >
          <Star
            size={size}
            className={cn(n <= (value ?? 0) ? 'text-warning' : 'text-muted/30')}
            fill={n <= (value ?? 0) ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------
   Overlays
------------------------------------------------------------------ */

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'full'
  className?: string
}

export function Modal({ open, onClose, title, children, footer, size = 'md', className }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const width = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-lg',
    lg: 'sm:max-w-2xl',
    full: 'sm:max-w-4xl',
  }[size]

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="animate-in absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-slide-up relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-surface shadow-2xl',
          'rounded-t-3xl sm:rounded-2xl',
          width,
          className,
        )}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h3 className="truncate text-base font-bold">{title}</h3>
            <IconButton label={t('ui.close')} onClick={onClose} className="-mr-2">
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="safe-b shrink-0 border-t border-line bg-surface px-5 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="text-sm text-muted">{message}</div>
      <div className="mt-5 flex gap-2">
        <Button block onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button block variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

/** Menu contextuel ancré (rendu en portal pour passer au-dessus de tout). */
export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode
  items: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; hidden?: boolean }[]
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0, right: 0 })
  const anchorRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const computePos = () => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = Math.min(r.bottom + 6, window.innerHeight - 8)
    if (align === 'right') {
      setPos({ top, right: Math.max(8, window.innerWidth - r.right) })
    } else {
      setPos({ top, left: Math.max(8, r.left) })
    }
  }

  useEffect(() => {
    if (!open) return
    computePos()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // Un scroll / resize referme le menu (position ancrée devenue fausse).
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const visible = items.filter((i) => !i.hidden)

  return (
    <div ref={anchorRef} className="relative shrink-0">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              right: pos.right,
              zIndex: 80,
              maxWidth: 'calc(100vw - 16px)',
            }}
            className="animate-pop min-w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
          >
            {visible.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm whitespace-nowrap transition-colors hover:bg-surface-2',
                  item.danger ? 'text-danger' : 'text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}

/* ------------------------------------------------------------------
   Divers
------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  message?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  icon,
  compact,
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  /** Version condensée (grille de chiffres, comme dans les stats du profil). */
  compact?: boolean
  className?: string
}) {
  if (compact) {
    return (
      <div className={cn('rounded-xl bg-surface-2 px-1 py-2 text-center', className)}>
        <p className="tabular truncate text-sm font-extrabold">{value}</p>
        <p className="flex items-center justify-center gap-1 text-[10px] font-semibold text-muted uppercase">
          {icon}
          {label}
        </p>
        {sub && <p className="truncate text-[10px] text-muted">{sub}</p>}
      </div>
    )
  }
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-3.5', className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {icon}
        {label}
      </div>
      <div className="tabular mt-1.5 text-xl font-extrabold">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

export function ProgressBar({
  value,
  max,
  color,
  className,
}: {
  value: number
  max: number
  color?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }}
      />
    </div>
  )
}

export function ProgressRing({
  progress,
  size = 44,
  stroke = 4,
  children,
}: {
  progress: number
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold">{children}</span>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="tablist" className={cn('no-scrollbar flex gap-1 overflow-x-auto', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
            value === t.value ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink',
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function CheckBadge({
  done,
  onClick,
  size = 30,
  title,
  disabled,
}: {
  done: boolean
  onClick: () => void
  size?: number
  title?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      title={title}
      disabled={disabled}
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border transition-all active:scale-90',
        done
          ? 'border-success bg-success text-white'
          : disabled
            ? 'cursor-not-allowed border-line bg-surface-2 text-transparent opacity-40'
            : 'border-line bg-surface-2 text-transparent hover:border-success/60',
      )}
    >
      <Check size={size * 0.55} strokeWidth={3} />
    </button>
  )
}

/* ------------------------------------------------------------------
   Toaster
------------------------------------------------------------------ */

export function Toaster({ toasts }: { toasts: { id: string; message: string; tone: string }[] }) {
  if (!toasts.length) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-stack,0px)+var(--bottom-bar,0px)+var(--kb-inset,0px)+28px)] z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'animate-slide-up pointer-events-auto max-w-sm rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl',
            t.tone === 'success' && 'border-success/40 bg-success-solid text-white',
            t.tone === 'error' && 'border-danger/40 bg-danger-solid text-white',
            t.tone === 'info' && 'border-line bg-surface text-ink',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------
   Layout helpers
------------------------------------------------------------------ */

export function StickyScreen({
  header,
  children,
  footer,
}: {
  header?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <div className="flex-1">{children}</div>
      {footer}
    </div>
  )
}

const ScrollTargetCtx = createContext<HTMLElement | null>(null)
export const ScrollTargetProvider = ScrollTargetCtx.Provider
export const useScrollTarget = () => useContext(ScrollTargetCtx)

/** Remonte en haut lors d'un changement d'onglet (usage mobile). */
export function useScrollReset(_dep: unknown) {
  const el = useScrollTarget()
  useLayoutEffect(() => {
    el?.scrollTo({ top: 0 })
  }, [_dep, el])
}
