import type { ReactNode } from 'react'

interface PixelBarProps {
  label: string
  value: number
  max: number
  color?: string
  textColor?: string
  secondaryTextColor?: string
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
}

export function PixelBar({
  label,
  value,
  max,
  color = '#E89B6C',
  textColor = '#5C3D2E',
  secondaryTextColor = '#8B6F47',
  icon,
  target,
  unit = '',
  overThreshold,
  overColor = '#E57373',
}: PixelBarProps) {
  const percentage = (value / max) * 100
  const targetPercentage = target ? (target / max) * 100 : null

  const effectiveColor = (overThreshold !== undefined && value > overThreshold) ? overColor : color
  const gradientEnd = GRADIENT_MAP[effectiveColor] ?? effectiveColor

  const displayValue = unit === 'L' ? value.toFixed(1) : Math.round(value)
  const displayTarget = unit === 'L' ? target?.toFixed(1) : target

  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-2">
        {icon && (
          <div
            className="p-2"
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
        <div className="flex justify-between items-center flex-1">
          <span className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>
            {label}
          </span>
          <span className="monument-text" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
            {displayValue}{unit}
            {target !== undefined && ` / ${displayTarget}${unit}`}
          </span>
        </div>
      </div>

      <div
        className="w-full h-3 relative overflow-hidden"
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
