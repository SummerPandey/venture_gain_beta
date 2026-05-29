import { useState, useEffect } from 'react'
import type { SleepState } from '@/types'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, TODAY } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const SLEEP_HOURS_MAX = 12
const SLEEP_MINUTES_MAX = 59
const SLEEP_MINUTES_STEP = 15
const ENERGY_MAX = 10
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface SleepChartEntry { day: string; sleep: number; energy: number }

async function upsertDay(userId: string, fields: Record<string, unknown>) {
  const { data: updated } = await supabase
    .from('daily_logs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('log_date', TODAY)
    .select('id')
  if (!updated || updated.length === 0) {
    await supabase.from('daily_logs').insert({
      user_id: userId,
      log_date: TODAY,
      ...fields,
      updated_at: new Date().toISOString(),
    })
  }
}

export function useSleep() {
  const { user } = useAuth()
  const [state, setState] = useState<SleepState>({
    sleepHours: 0,
    sleepMinutes: 0,
    energyLevel: 0,
  })
  const [loaded, setLoaded] = useState(false)
  const [weeklyChartData, setWeeklyChartData] = useState<SleepChartEntry[]>([])
  const totalSleepHours = state.sleepHours + state.sleepMinutes / 60

  // Load today + last 7 days — .limit(1) avoids duplicate-row crash
  useEffect(() => {
    if (!user) { setLoaded(true); return }

    const since = new Date()
    since.setDate(since.getDate() - 6)
    const sinceStr = since.toISOString().split('T')[0]

    supabase
      .from('daily_logs')
      .select('log_date, sleep_hours, sleep_minutes, energy_level')
      .eq('user_id', user.id)
      .gte('log_date', sinceStr)
      .order('log_date')
      .then(({ data }) => {
        if (data) {
          setWeeklyChartData(data.map(row => ({
            day: DAY_LABELS[new Date(row.log_date + 'T12:00:00').getDay()],
            sleep: Math.min(10, Math.round(((Number(row.sleep_hours) || 0) + (Number(row.sleep_minutes) || 0) / 60) * 10) / 10),
            energy: Number(row.energy_level) || 0,
          })))
          // Get today's most recent row
          const todayRows = data.filter(r => r.log_date === TODAY)
          const todayRow = todayRows[todayRows.length - 1]
          if (todayRow) {
            setState({
              sleepHours: Number(todayRow.sleep_hours) || 0,
              sleepMinutes: Number(todayRow.sleep_minutes) || 0,
              energyLevel: Number(todayRow.energy_level) || 0,
            })
          }
        }
        setLoaded(true)
      })
  }, [user])

  // Keep today's chart entry in sync with live state
  useEffect(() => {
    if (!loaded) return
    const todayLabel = DAY_LABELS[new Date(TODAY + 'T12:00:00').getDay()]
    setWeeklyChartData(prev => {
      const entry: SleepChartEntry = {
        day: todayLabel,
        sleep: Math.min(10, Math.round(totalSleepHours * 10) / 10),
        energy: state.energyLevel,
      }
      return [...prev.filter(d => d.day !== todayLabel), entry]
    })
  }, [loaded, totalSleepHours, state.energyLevel])

  useEffect(() => { healthSnapshot.sleepHours = totalSleepHours }, [totalSleepHours])

  // Auto-save 600ms after last change
  useEffect(() => {
    if (!loaded || !user) return
    const { sleepHours, sleepMinutes, energyLevel } = state
    const id = setTimeout(() => {
      upsertDay(user.id, {
        sleep_hours: sleepHours,
        sleep_minutes: sleepMinutes,
        energy_level: energyLevel,
      })
    }, 600)
    return () => clearTimeout(id)
  }, [state.sleepHours, state.sleepMinutes, state.energyLevel, loaded, user])

  const save = () => {
    if (!user) return
    upsertDay(user.id, {
      sleep_hours: state.sleepHours,
      sleep_minutes: state.sleepMinutes,
      energy_level: state.energyLevel,
    })
  }

  const adjustSleepHours = (delta: number) => setState(s => ({ ...s, sleepHours: Math.min(SLEEP_HOURS_MAX, Math.max(0, s.sleepHours + delta)) }))
  const setSleepHours = (val: number) => setState(s => ({ ...s, sleepHours: Math.min(SLEEP_HOURS_MAX, Math.max(0, val)) }))
  const adjustSleepMinutes = (delta: number) => setState(s => ({ ...s, sleepMinutes: Math.min(SLEEP_MINUTES_MAX, Math.max(0, s.sleepMinutes + delta)) }))
  const setSleepMinutes = (val: number) => setState(s => ({ ...s, sleepMinutes: Math.min(SLEEP_MINUTES_MAX, Math.max(0, val)) }))
  const adjustEnergy = (delta: number) => setState(s => ({ ...s, energyLevel: Math.min(ENERGY_MAX, Math.max(0, s.energyLevel + delta)) }))
  const setEnergy = (val: number) => setState(s => ({ ...s, energyLevel: Math.min(ENERGY_MAX, Math.max(0, val)) }))

  return {
    state,
    totalSleepHours,
    loaded,
    save,
    weeklyChartData,
    constants: { hoursMax: SLEEP_HOURS_MAX, minutesMax: SLEEP_MINUTES_MAX, minutesStep: SLEEP_MINUTES_STEP, energyMax: ENERGY_MAX },
    adjustSleepHours, setSleepHours,
    adjustSleepMinutes, setSleepMinutes,
    adjustEnergy, setEnergy,
  }
}
