export interface SleepState {
  sleepHours: number
  sleepMinutes: number
  energyLevel: number
}

export interface WeeklyDataPoint {
  day: string
  sleep: number
  energy: number
}
