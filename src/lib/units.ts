import type { WeightUnit } from '@/types'

const KG_PER_LB = 0.45359237

/** Plain two-state KG/LBS switch for the manual weight-entry toggle button.
 *  Any other unit (e.g. 'km' from an AI-detected sprint distance) flips to 'kg' on first tap. */
export function toggleKgLbs(unit: WeightUnit | undefined): WeightUnit {
  return unit === 'kg' ? 'lbs' : 'kg'
}

export function unitLabel(unit: WeightUnit | undefined): string {
  return (unit ?? 'kg').toUpperCase()
}

/** Converts a weight value to kg for volume/PR aggregation. Distance (km) entries aren't a weight, so they contribute 0. */
export function toKgValue(value: number, unit: WeightUnit | undefined): number {
  if (unit === 'lbs') return value * KG_PER_LB
  if (unit === 'km') return 0
  return value
}

/** Converts a weight value between kg and lbs, rounded to 1 decimal for display/editing.
 *  Non-weight units (km) and a same-unit toggle pass the value through unchanged. */
export function convertWeightValue(value: number, from: WeightUnit | undefined, to: WeightUnit): number {
  if (!value || from === to || from === 'km') return value
  const kg = from === 'lbs' ? value * KG_PER_LB : value
  const converted = to === 'lbs' ? kg / KG_PER_LB : kg
  return Math.round(converted * 10) / 10
}

/** Flips kg/lbs and converts every set's weight to match, so the numbers stay
 *  physically accurate (15kg -> 33.1lbs) instead of just relabeling the unit. */
export function toggleSetsUnit<T extends { weight: number }>(
  sets: T[],
  unit: WeightUnit | undefined
): { unit: WeightUnit; sets: T[] } {
  const nextUnit = toggleKgLbs(unit)
  return { unit: nextUnit, sets: sets.map(s => ({ ...s, weight: convertWeightValue(s.weight, unit, nextUnit) })) }
}
