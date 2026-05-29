import type { RadarStat } from '@/types'

export const STREAK_YEARS = 7
export const STREAK_ANNIVERSARY = { month: 2, day: 23 } // March 23 (month is 0-indexed)

export const LEVEL = 8
export const CURRENT_MOMENTUM = 642
export const NEXT_LEVEL_MOMENTUM = 700

export const TIER_THRESHOLDS = [
  { min: 30, name: 'Elite' },
  { min: 20, name: 'Strong' },
  { min: 10, name: 'Consistent' },
  { min: 5, name: 'Momentum' },
  { min: 0, name: 'Foundation' },
] as const

export const RADAR_STATS: RadarStat[] = [
  { stat: 'FOOD', value: 65 },
  { stat: 'WATER', value: 80 },
  { stat: 'SLEEP', value: 70 },
  { stat: 'WORKOUT', value: 55 },
  { stat: 'ENERGY', value: 75 },
]

export const WEEKLY_CHART_DATA = [
  { day: 'Mon', sleep: 65, energy: 70 },
  { day: 'Tue', sleep: 72, energy: 68 },
  { day: 'Wed', sleep: 68, energy: 75 },
  { day: 'Thu', sleep: 75, energy: 80 },
  { day: 'Fri', sleep: 70, energy: 75 },
  { day: 'Sat', sleep: 80, energy: 85 },
  { day: 'Sun', sleep: 78, energy: 72 },
]
