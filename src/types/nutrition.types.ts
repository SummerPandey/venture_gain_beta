export interface NutritionLimits {
  waterTarget: number
  waterLimit: number
  caloriesTarget: number
  caloriesLimit: number
  proteinTarget: number
  proteinLimit: number
  sugarLimit: number
  multivitaminTarget: number
}

export interface NutritionState {
  waterLiters: number
  calories: number
  proteinGrams: number
  sugarGrams: number
  multivitamins: number
  uploadedImage: string | null
}
