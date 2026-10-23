import type { ReactNode } from 'react'

interface PixelBarProps {
  label: string
  value: number
  max: number
  color?: string
  icon?: ReactNode
  target?: number
  unit?: string
  overThreshold?: number
  overColor?: string
}

const GRADIENT_MAP: Record<string, string> = {
  '#E89B6C': '#FFB88A',
  '#F5C98B': '#FFD4A8',
  '#7BAFD4': '#A5C8E8',
  '#9B7FC8': '#C4A8E8',
  '#FFD166': '#FFE8A3',
  '#FF9F66': '#FFB88A',
  '#FFB88A': '#FFCAA0',
  '#E57373': '#EF9A9A',
  '#C4856A': '#DDA882',
  '#8BAF8C': '#A8C8A8',
  '#E8829F': '#F5B8CE',
  '#8B2020': '#C4544A',
}

export function PixelBar({
  label,
  value,
  max,
  color = '#E89B6C',
  icon,
  target,
  unit = '',
  overThreshold,
  overColor = '#E57373',
}: PixelBarProps) {
  // Bad inputs (NaN, negative, max 0) would emit invalid CSS widths, which the
  // browser drops — leaving a full bar for an empty state.
  const safeValue = Number.isFinite(value) ? value : 0
  const safeTarget = target !== undefined && Number.isFinite(target) ? target : undefined
  const clampPct = (n: number) => Math.min(100, Math.max(0, n))
  const ratio = (n: number) => (Number.isFinite(max) && max > 0 ? n / max : 0)
  const percentage = clampPct(ratio(safeValue) * 100)
  const targetPercentage = safeTarget ? clampPct(ratio(safeTarget) * 100) : null

  const isOver = overThreshold !== undefined && safeValue > overThreshold
  const effectiveColor = isOver ? overColor : color
  const gradientEnd = GRADIENT_MAP[effectiveColor] ?? effectiveColor

  const displayValue = unit === 'L' ? safeValue.toFixed(1) : Math.round(safeValue)
  const displayTarget = unit === 'L' ? safeTarget?.toFixed(1) : safeTarget
  const valueText = `${displayValue}${unit}${safeTarget !== undefined ? ` of ${displayTarget}${unit}` : ''}${isOver ? ', over limit' : ''}`

  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-2">
        {icon && (
          <div
            className="p-2 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 193, 148, 0.3) 0%, rgba(255, 207, 163, 0.3) 100%)',
              border: '2px solid #8B5A3E',
              borderRadius: '10px',
              color,
              boxShadow: '0 2px 8px rgba(255, 184, 138, 0.15)',
            }}
          >
            {icon}
          </div>
        )}
        <div className="flex justify-between items-center flex-1 min-w-0 gap-2">
          <span className="monument-text min-w-0 truncate" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>
            {label}
          </span>
          <span className="monument-text whitespace-nowrap" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
            {displayValue}{unit}
            {safeTarget !== undefined && ` / ${displayTarget}${unit}`}
            {isOver && <span style={{ color: '#C0504D' }}> · OVER</span>}
          </span>
        </div>
      </div>

      <div
        className="w-full h-3 relative"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={safeValue}
        aria-valuetext={valueText}
        style={{
          background: 'rgba(255, 184, 138, 0.2)',
          borderRadius: '10px',
          border: '2px solid #8B5A3E',
        }}
      >
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${effectiveColor} 0%, ${gradientEnd} 100%)`,
            boxShadow: '0 0 8px rgba(255, 159, 102, 0.3)',
            borderRadius: '10px',
          }}
        />
        {targetPercentage !== null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 transition-all duration-300"
            style={{
              left: `${targetPercentage}%`,
              background: '#8B5A3E',
              boxShadow: '0 0 6px rgba(139, 90, 62, 0.5)',
              zIndex: 10,
            }}
          >
            <div
              className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rounded-full"
              style={{ background: '#8B5A3E', boxShadow: '0 0 4px rgba(255, 184, 138, 0.5)' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
