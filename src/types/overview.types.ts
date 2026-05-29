import type { LucideIcon } from 'lucide-react'

export interface RadarStat {
  stat: string
  value: number
}

export interface OverviewWorkoutCategory {
  category: string
  exercise: string
  current: number
  goal: number
  progress: number
  icon: LucideIcon
  unit: string
  exercises: string[]
}
