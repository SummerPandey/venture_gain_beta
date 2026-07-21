import type { NutritionLimits } from '@/types'

export const NUTRITION_LIMITS: NutritionLimits = {
  waterTarget: 3,
  waterLimit: 4,
  caloriesTarget: 2500,
  caloriesLimit: 3500,
  proteinTarget: 170,
  proteinLimit: 250,
  sugarLimit: 30,
  multivitaminTarget: 3,
}

export const WATER_MAX = 6
export const CALORIES_MAX = 4000
export const PROTEIN_MAX = 300
export const SUGAR_MAX = 100

export const WATER_STEP = 0.5
export const CALORIES_STEP = 100
export const PROTEIN_STEP = 10
export const SUGAR_STEP = 5
