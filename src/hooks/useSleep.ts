import { useState, useEffect, useRef } from 'react'
import type { SleepState } from '@/types'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const SLEEP_HOURS_MAX = 12
const SLEEP_MINUTES_MAX = 59
const SLEEP_MINUTES_STEP = 15
const ENERGY_MAX = 10
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export interface SleepChartEntry { day: string; sleep: number; energy: number }

async function upsertDay(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: userId, log_date: getToday(), ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
  if (error) console.error('[sleep] upsert error:', error)
}

export function useSleep() {
  const { user } = useAuth()
  const [state, setState] = useState<SleepState>({
    sleepHours: 0,
    sleepMinutes: 0,
    energyLevel: 0,
  })
  const [loaded, setLoaded] = useState(false)
  const userModified = useRef(false)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])
  const pendingSleep = useRef<Record<string, unknown> | null>(null)
  const [weeklyChartData, setWeeklyChartData] = useState<SleepChartEntry[]>([])
  const totalSleepHours = state.sleepHours + state.sleepMinutes / 60
  // Date this hook's data was loaded for — used to detect a midnight rollover
  // while the PWA stays resident in memory (it never remounts on reopen).
  const loadedDate = useRef<string>('')

  // Load today + last 7 days — .limit(1) avoids duplicate-row crash
  const loadAll = (userId: string) => {
    userModified.current = false
    loadedDate.current = getToday()

    const since = new Date()
    since.setDate(since.getDate() - 6)
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

    return supabase
      .from('daily_logs')
      .select('log_date, sleep_hours, sleep_minutes, energy_level')
      .eq('user_id', userId)
      .gte('log_date', sinceStr)
      .order('log_date')
      .then(({ data }) => {
        if (data) {
          setWeeklyChartData(data.map(row => ({
            day: DAY_LABELS[new Date(row.log_date + 'T12:00:00').getDay()],
            sleep: Math.round(((Number(row.sleep_hours) || 0) + (Number(row.sleep_minutes) || 0) / 60) * 10) / 10,
            energy: Number(row.energy_level) || 0,
          })))
          // Get today's most recent row. A missing row means a fresh day, so
          // reset to zero rather than leaving yesterday's values in memory.
          const todayRows = data.filter(r => r.log_date === getToday())
          const todayRow = todayRows[todayRows.length - 1]
          setState({
            sleepHours: Number(todayRow?.sleep_hours) || 0,
            sleepMinutes: Number(todayRow?.sleep_minutes) || 0,
            energyLevel: Number(todayRow?.energy_level) || 0,
          })
        }
        setLoaded(true)
      })
  }

  useEffect(() => {
    if (!user) { setLoaded(true); return }
    loadAll(user.id)
  }, [user])

  // Reload when the app returns to the foreground on a new calendar day, so the
  // previous day's energy/sleep don't carry over into today.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const u = userRef.current
      if (!u) return
      if (getToday() !== loadedDate.current) loadAll(u.id)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // Keep today's chart entry in sync with live state
  useEffect(() => {
    if (!loaded) return
    const todayLabel = DAY_LABELS[new Date(getToday() + 'T12:00:00').getDay()]
    setWeeklyChartData(prev => {
      const entry: SleepChartEntry = {
        day: todayLabel,
        sleep: Math.round(totalSleepHours * 10) / 10,
        energy: state.energyLevel,
      }
      return [...prev.filter(d => d.day !== todayLabel), entry]
    })
  }, [loaded, totalSleepHours, state.energyLevel])

  useEffect(() => { healthSnapshot.sleepHours = totalSleepHours }, [totalSleepHours])

  // Auto-save 600ms after last user-initiated change (not on initial load)
  useEffect(() => {
    if (!loaded || !user || !userModified.current) return
    const { sleepHours, sleepMinutes, energyLevel } = state
    const fields = { sleep_hours: sleepHours, sleep_minutes: sleepMinutes, energy_level: energyLevel }
    pendingSleep.current = fields
    const id = setTimeout(() => {
      upsertDay(user.id, fields)
      pendingSleep.current = null
    }, 600)
    return () => clearTimeout(id)
  }, [state.sleepHours, state.sleepMinutes, state.energyLevel, loaded, user])

  // Flush any pending save when tab is switched (unmount)
  useEffect(() => {
    return () => {
      if (pendingSleep.current && userRef.current) {
        upsertDay(userRef.current.id, pendingSleep.current)
      }
    }
  }, [])

  const adjustSleepHours = (delta: number) => { userModified.current = true; setState(s => ({ ...s, sleepHours: Math.min(SLEEP_HOURS_MAX, Math.max(0, s.sleepHours + delta)) })) }
  const setSleepHours = (val: number) => { userModified.current = true; setState(s => ({ ...s, sleepHours: Math.min(SLEEP_HOURS_MAX, Math.max(0, val)) })) }
  const adjustSleepMinutes = (delta: number) => { userModified.current = true; setState(s => ({ ...s, sleepMinutes: Math.min(SLEEP_MINUTES_MAX, Math.max(0, s.sleepMinutes + delta)) })) }
  const setSleepMinutes = (val: number) => { userModified.current = true; setState(s => ({ ...s, sleepMinutes: Math.min(SLEEP_MINUTES_MAX, Math.max(0, val)) })) }
  const adjustEnergy = (delta: number) => { userModified.current = true; setState(s => ({ ...s, energyLevel: Math.min(ENERGY_MAX, Math.max(0, s.energyLevel + delta)) })) }
  const setEnergy = (val: number) => { userModified.current = true; setState(s => ({ ...s, energyLevel: Math.min(ENERGY_MAX, Math.max(0, val)) })) }

  return {
    state,
    totalSleepHours,
    loaded,
    weeklyChartData,
    constants: { hoursMax: SLEEP_HOURS_MAX, minutesMax: SLEEP_MINUTES_MAX, minutesStep: SLEEP_MINUTES_STEP, energyMax: ENERGY_MAX },
    adjustSleepHours, setSleepHours,
    adjustSleepMinutes, setSleepMinutes,
    adjustEnergy, setEnergy,
  }
}
