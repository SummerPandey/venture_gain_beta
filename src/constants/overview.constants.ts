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
