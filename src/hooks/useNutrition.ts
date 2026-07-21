import { useState, useEffect, useRef } from 'react'
import type { NutritionState } from '@/types'
import {
  WATER_MAX, CALORIES_MAX, PROTEIN_MAX, SUGAR_MAX,
  NUTRITION_LIMITS,
  WATER_STEP, CALORIES_STEP, PROTEIN_STEP, SUGAR_STEP,
} from '@/constants'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUserSettings } from '@/contexts/UserSettingsContext'

export const SUPPLEMENT_MOMENTUM_PER_VITAMIN = 5

/** Local date string for week start (Saturday), using local time — no UTC drift */
function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 6 ? 0 : -(day + 1)
  const saturday = new Date(d)
  saturday.setDate(d.getDate() + diff)
  return `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`
}


async function upsertDay(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: userId, log_date: getToday(), ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
  if (error) console.error('[nutrition] upsert error:', error)
}

export function useNutrition() {
  const { user } = useAuth()
  const { settings } = useUserSettings()

  const [state, setState] = useState<NutritionState>({
    waterLiters: 0,
    calories: 0,
    proteinGrams: 0,
    sugarGrams: 0,
    multivitamins: 0,
    uploadedImage: null,
  })
  const [loaded, setLoaded] = useState(false)

  const [weeklyMultivitamins, setWeeklyMultivitamins] = useState(0)
  const [todayMultivitamins, setTodayMultivitamins] = useState(0)
  const [creatineTaken, setCreatineTaken] = useState(false)
  const [celebration, setCelebration] = useState<string | null>(null)

  const prevWater = useRef(0)
  const prevCalories = useRef(0)
  const prevProtein = useRef(0)
  const userModified = useRef(false)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])
  const pendingNutrition = useRef<Record<string, unknown> | null>(null)
  // Date this hook's data was loaded for — used to detect a midnight rollover
  // while the PWA stays resident in memory (it never remounts on reopen).
  const loadedDate = useRef<string>('')

  const fetchToday = (userId: string) =>
    supabase
      .from('daily_logs')
      .select('water_liters, calories, protein_grams, sugar_grams, creatine_taken')
      .eq('user_id', userId)
      .eq('log_date', getToday())
      .order('log_date')
      .then(({ data: rows }) => {
        const data = rows?.length ? rows[rows.length - 1] : null
        // Always reset to the DB's authoritative values for today — a missing
        // row means a fresh day, so everything goes back to 0.
        setState(s => ({
          ...s,
          waterLiters: Number(data?.water_liters) || 0,
          calories: Number(data?.calories) || 0,
          proteinGrams: Number(data?.protein_grams) || 0,
          sugarGrams: Number(data?.sugar_grams) || 0,
        }))
        setCreatineTaken(Boolean(data?.creatine_taken))
        // Sync celebration baselines so we don't re-fire on a fresh load.
        prevWater.current = Number(data?.water_liters) || 0
        prevCalories.current = Number(data?.calories) || 0
        prevProtein.current = Number(data?.protein_grams) || 0
      })

  const loadAll = (userId: string) => {
    userModified.current = false
    loadedDate.current = getToday()
    const weekStart = getWeekStart()

    const p = fetchToday(userId)

    supabase
      .from('daily_logs')
      .select('log_date, multivitamins')
      .eq('user_id', userId)
      .gte('log_date', weekStart)
      .order('log_date')
      .then(({ data }) => {
        if (!data) return
        const todayRows = data.filter(r => r.log_date === getToday())
        const todayVal = todayRows.length ? todayRows[todayRows.length - 1].multivitamins ?? 0 : 0
        const otherDays = data.filter(r => r.log_date !== getToday())
        const weekly = otherDays.reduce((s, r) => s + (r.multivitamins ?? 0), 0) + todayVal
        setWeeklyMultivitamins(weekly)
        setTodayMultivitamins(todayVal)
      })

    return p
  }

  // Load from Supabase on mount
  useEffect(() => {
    if (!user) { setLoaded(true); return }
    loadAll(user.id).then(() => setLoaded(true))
  }, [user])

  // Reset/reload when the app returns to the foreground on a new calendar day.
  // The PWA stays in memory across midnight, so without this the previous day's
  // totals carry over and get written into today's row on the next edit.
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

  // Auto-save to Supabase 600ms after last user-initiated change (not on initial load)
  useEffect(() => {
    if (!loaded || !user || !userModified.current) return
    const { waterLiters, calories, proteinGrams, sugarGrams } = state
    const fields = {
      water_liters: waterLiters,
      calories,
      protein_grams: proteinGrams,
      sugar_grams: sugarGrams,
      multivitamins: todayMultivitamins,
    }
    pendingNutrition.current = fields
    const id = setTimeout(() => {
      upsertDay(user.id, fields)
      pendingNutrition.current = null
    }, 600)
    return () => clearTimeout(id)
  }, [state.waterLiters, state.calories, state.proteinGrams, state.sugarGrams, todayMultivitamins, loaded, user])

  // Flush any pending save when tab is switched (unmount)
  useEffect(() => {
    return () => {
      if (pendingNutrition.current && userRef.current) {
        upsertDay(userRef.current.id, pendingNutrition.current)
      }
    }
  }, [])

  useEffect(() => { healthSnapshot.waterLiters = state.waterLiters }, [state.waterLiters])
  useEffect(() => { healthSnapshot.calories = state.calories }, [state.calories])

  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 2500)
    return () => clearTimeout(t)
  }, [celebration])

  useEffect(() => {
    const prev = prevWater.current
    prevWater.current = state.waterLiters
    if (prev < settings.waterTarget && state.waterLiters >= settings.waterTarget) {
      setCelebration('HYDRATION GOAL REACHED')
    }
  }, [state.waterLiters, settings.waterTarget])

  useEffect(() => {
    const prev = prevCalories.current
    prevCalories.current = state.calories
    if (prev < settings.caloriesTarget && state.calories >= settings.caloriesTarget) {
      setCelebration('CALORIE TARGET HIT')
    }
  }, [state.calories, settings.caloriesTarget])

  useEffect(() => {
    const prev = prevProtein.current
    prevProtein.current = state.proteinGrams
    if (prev < settings.proteinTarget && state.proteinGrams >= settings.proteinTarget) {
      setCelebration('PROTEIN GOAL HIT')
    }
  }, [state.proteinGrams, settings.proteinTarget])

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val))

  const saveVitamins = (newTodayCount: number) => {
    if (!user) return
    upsertDay(user.id, { multivitamins: newTodayCount }).catch(e => console.error('saveVitamins failed:', e))
  }

  const toggleCreatine = async () => {
    const next = !creatineTaken
    setCreatineTaken(next)
    if (user) {
      await supabase.from('daily_logs').upsert(
        { user_id: user.id, log_date: getToday(), creatine_taken: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,log_date' }
      )
    }
  }

  const adjustWater = (delta: number) => { userModified.current = true; setState(s => ({ ...s, waterLiters: clamp(s.waterLiters + delta, 0, WATER_MAX) })) }
  const setWater = (val: number) => { userModified.current = true; setState(s => ({ ...s, waterLiters: clamp(val, 0, WATER_MAX) })) }
  const adjustCalories = (delta: number) => { userModified.current = true; setState(s => ({ ...s, calories: clamp(s.calories + delta, 0, CALORIES_MAX) })) }
  const setCalories = (val: number) => { userModified.current = true; setState(s => ({ ...s, calories: clamp(val, 0, CALORIES_MAX) })) }
  const adjustProtein = (delta: number) => { userModified.current = true; setState(s => ({ ...s, proteinGrams: clamp(s.proteinGrams + delta, 0, PROTEIN_MAX) })) }
  const setProtein = (val: number) => { userModified.current = true; setState(s => ({ ...s, proteinGrams: clamp(val, 0, PROTEIN_MAX) })) }
  const adjustSugar = (delta: number) => { userModified.current = true; setState(s => ({ ...s, sugarGrams: clamp(s.sugarGrams + delta, 0, SUGAR_MAX) })) }
  const setSugar = (val: number) => { userModified.current = true; setState(s => ({ ...s, sugarGrams: clamp(val, 0, SUGAR_MAX) })) }

  const adjustMultivitamins = (delta: number) => {
    const newWeekly = Math.min(NUTRITION_LIMITS.multivitaminTarget, Math.max(0, weeklyMultivitamins + delta))
    const actualDelta = newWeekly - weeklyMultivitamins
    if (actualDelta === 0) return
    const newToday = Math.max(0, todayMultivitamins + actualDelta)
    setTodayMultivitamins(newToday)
    setWeeklyMultivitamins(newWeekly)
    saveVitamins(newToday)
    if (actualDelta > 0 && newWeekly >= NUTRITION_LIMITS.multivitaminTarget) {
      setCelebration('SUPPLEMENT GOAL HIT')
    }
  }

  const setMultivitamins = (val: number) => {
    const newWeekly = Math.min(NUTRITION_LIMITS.multivitaminTarget, Math.max(0, val))
    const actualDelta = newWeekly - weeklyMultivitamins
    const newToday = Math.max(0, todayMultivitamins + actualDelta)
    setTodayMultivitamins(newToday)
    setWeeklyMultivitamins(newWeekly)
    saveVitamins(newToday)
  }

  const simulateAIScan = () => setState(s => ({ ...s, uploadedImage: 'scanned' }))

  const approveScan = (water: number, calories: number, protein: number, sugar: number) => {
    userModified.current = true
    setState(s => ({
      ...s,
      waterLiters: clamp(s.waterLiters + water, 0, WATER_MAX),
      calories: clamp(s.calories + calories, 0, CALORIES_MAX),
      proteinGrams: clamp(s.proteinGrams + protein, 0, PROTEIN_MAX),
      sugarGrams: clamp(s.sugarGrams + sugar, 0, SUGAR_MAX),
      uploadedImage: null,
    }))
  }

  const dismissScan = () => setState(s => ({ ...s, uploadedImage: null }))

  const dynamicLimits = {
    ...NUTRITION_LIMITS,
    waterTarget:    settings.waterTarget,
    caloriesTarget: settings.caloriesTarget,
    proteinTarget:  settings.proteinTarget,
  }

  return {
    state,
    loaded,
    limits: dynamicLimits,
    steps: { water: WATER_STEP, calories: CALORIES_STEP, protein: PROTEIN_STEP, sugar: SUGAR_STEP },
    maxes: { water: WATER_MAX, calories: CALORIES_MAX, protein: PROTEIN_MAX, sugar: SUGAR_MAX },
    adjustWater, setWater,
    adjustCalories, setCalories,
    adjustProtein, setProtein,
    adjustSugar, setSugar,
    celebration,
    weeklyMultivitamins,
    adjustMultivitamins,
    setMultivitamins,
    creatineTaken,
    toggleCreatine,
    simulateAIScan, approveScan, dismissScan,
  }
}
