export type LogCategory = 'workouts' | 'hydration' | 'sleep' | 'energy'
export type LogPeriod = 'daily' | 'weekly' | 'monthly'
export type LogView = 'log' | 'summary'

export interface ChatMessage {
  text: string
  isUser: boolean
}

export interface SummaryPeriodData {
  percentage: number
  insights: string[]
}

export interface CategorySummary {
  daily: SummaryPeriodData
  weekly: SummaryPeriodData
  monthly: SummaryPeriodData
}

export interface SummaryData {
  workouts: CategorySummary
  hydration: CategorySummary
  sleep: CategorySummary
  energy: CategorySummary
}

export interface WeekGroup {
  weekNumber: number
  days: number[]
}
