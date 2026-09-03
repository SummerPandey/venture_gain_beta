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
