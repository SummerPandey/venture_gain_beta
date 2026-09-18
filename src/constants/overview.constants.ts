// March 23, 2019 — the day the streak started. This is the ONLY source of truth for
// the streak: it's computed live from this date every render, so it can never
// accidentally show as broken/reset the way a manually-maintained counter could.
export const STREAK_START_DATE = { year: 2019, month: 2, day: 23 } // month is 0-indexed

/** Whole days elapsed since STREAK_START_DATE, using local calendar dates (not a raw
 *  millisecond diff, which can be off by a day around DST changes). */
export function getStreakDays(): number {
  const start = new Date(STREAK_START_DATE.year, STREAK_START_DATE.month, STREAK_START_DATE.day)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today.getTime() - start.getTime()) / 86400000)
}

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
