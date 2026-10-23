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

/** Whole streak years completed as of today (calendar-based, so leap days don't drift). */
export function getStreakYearsCompleted(): number {
  const now = new Date()
  const { year, month, day } = STREAK_START_DATE
  const beforeAnniversary = now.getMonth() < month || (now.getMonth() === month && now.getDate() < day)
  return now.getFullYear() - year - (beforeAnniversary ? 1 : 0)
}

/** Days until the next March 23 anniversary. On the anniversary itself this counts to
 *  the following year's (365 or 366), since today's year has just been completed. */
export function daysUntilNextAnniversary(): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(today.getFullYear(), STREAK_START_DATE.month, STREAK_START_DATE.day)
  if (next.getTime() <= today.getTime()) {
    next = new Date(today.getFullYear() + 1, STREAK_START_DATE.month, STREAK_START_DATE.day)
  }
  return Math.round((next.getTime() - today.getTime()) / 86400000)
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
