/** Petits utilitaires graphiques partagés (tooltips lisibles, curseurs doux). */

export function ChartTooltipContent({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }[]
  label?: string | number
  format?: (entry: { name?: string; value?: number | string; dataKey?: string | number }, payload: Record<string, unknown>) => string | null
}) {
  if (!active || !payload?.length) return null
  const datum = (payload[0]?.payload ?? {}) as Record<string, unknown>
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '8px 10px',
        fontSize: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,.25)',
        maxWidth: 220,
      }}
    >
      {label !== undefined && <p style={{ fontWeight: 800, marginBottom: 4 }}>{label}</p>}
      {payload.map((p, i) => {
        const text = format ? format(p, datum) : `${p.value} ${p.name ?? ''}`
        if (!text) return null
        return (
          <p key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: p.color ?? 'var(--accent)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 600 }}>{text}</span>
          </p>
        )
      })}
    </div>
  )
}

export const chartCursor = { fill: 'var(--surface-3)', opacity: 0.35 }
export const chartLineCursor = { stroke: 'var(--border)', strokeDasharray: '4 4' }
export const chartTooltipWrapper = { outline: 'none', zIndex: 50 } as const
