import {
  createContext,
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
import { Check, Minus, Plus, Star, X } from 'lucide-react'
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
}: {
  active?: boolean
  children: ReactNode
  onClick?: () => void
  className?: string
  color?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={active && color ? { background: color, borderColor: color } : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-all',
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
}

/** Champ numérique tactile : saisie directe + boutons +/- */
export function NumberField({
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

  return (
    <div
      className={cn(
        'flex h-11 items-center rounded-xl border border-line bg-surface-2 px-1 transition-colors focus-within:border-accent',
        className,
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={() => bump(-1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-90"
      >
        <Minus size={14} />
      </button>
      <div className="relative flex-1">
        <input
          aria-label={ariaLabel}
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false
            commit(text)
          }}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          className={cn(
            'tabular w-full bg-transparent text-center text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-muted/60',
            inputClassName,
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-[10px] font-semibold text-muted">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => bump(1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink active:scale-90"
      >
        <Plus size={14} />
      </button>
    </div>
  )
}

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
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
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
            <IconButton label="Fermer" onClick={onClose} className="-mr-2">
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

/** Menu contextuel ancré, fermé au clic extérieur. */
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'animate-pop absolute top-full z-40 mt-1 min-w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items
            .filter((i) => !i.hidden)
            .map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2',
                  item.danger ? 'text-danger' : 'text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
        </div>
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
  className,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  className?: string
}) {
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
    <div className={cn('no-scrollbar flex gap-1 overflow-x-auto', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors',
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

export function CheckBadge({ done, onClick, size = 30 }: { done: boolean; onClick: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg border transition-all active:scale-90',
        done
          ? 'border-success bg-success text-white'
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottom-stack,0px)+var(--bottom-bar,0px)+28px)] z-[60] flex flex-col items-center gap-2 px-4">
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