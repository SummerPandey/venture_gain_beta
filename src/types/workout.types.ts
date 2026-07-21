import type { LucideIcon } from 'lucide-react'

export interface WorkoutSet {
  reps: number
  weight: number
}

export interface WorkoutEntry {
  exercise: string
  type: 'energy' | 'weights'
  energyRating?: number
  sets?: WorkoutSet[]
  time: string
  category?: string   // which training category this was logged under
}

export interface ExerciseProgress {
  exercise: string
  current: number
  goal: number
  progress: number
  icon: LucideIcon
  unit: string
}

export type TrackingMode = 'energy' | 'weights'
