import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/ui'

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  sticky = true,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: boolean | string
  actions?: ReactNode
  sticky?: boolean
  className?: string
  children?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header
      className={cn(
        'safe-t',
        sticky && 'glass sticky top-0 z-30 border-b border-line',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
        {back && (
          <IconButton
            label="Retour"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            className="-ml-2"
          >
            <ChevronLeft size={22} />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 py-4', className)}>{children}</div>
}