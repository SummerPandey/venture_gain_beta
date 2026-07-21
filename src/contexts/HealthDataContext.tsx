import { createContext, useContext, type ReactNode } from 'react'
import { useWorkout } from '@/hooks/useWorkout'
import { useNutrition } from '@/hooks/useNutrition'
import { useSleep } from '@/hooks/useSleep'

type WorkoutData = ReturnType<typeof useWorkout>
type NutritionData = ReturnType<typeof useNutrition>
type SleepData = ReturnType<typeof useSleep>

interface HealthDataContextValue {
  workout: WorkoutData
  nutrition: NutritionData
  sleep: SleepData
}

const HealthDataContext = createContext<HealthDataContextValue | null>(null)

export function HealthDataProvider({ children }: { children: ReactNode }) {
  const workout = useWorkout()
  const nutrition = useNutrition()
  const sleep = useSleep()

  return (
    <HealthDataContext.Provider value={{ workout, nutrition, sleep }}>
      {children}
    </HealthDataContext.Provider>
  )
}

export function useHealthData() {
  const ctx = useContext(HealthDataContext)
  if (!ctx) throw new Error('useHealthData must be used within HealthDataProvider')
  return ctx
}
