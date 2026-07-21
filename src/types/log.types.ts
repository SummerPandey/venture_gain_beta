export type LogCategory = 'workouts' | 'hydration' | 'sleep' | 'energy'
export type LogPeriod = 'daily' | 'weekly' | 'monthly'
export type LogView = 'log' | 'summary'

export interface ChatMessage {
  text: string
  isUser: boolean
}

export interface WeekGroup {
  weekNumber: number
  days: number[]
}
