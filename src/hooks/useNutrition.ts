import { useState, useEffect, useRef } from 'react'
import type { NutritionState } from '@/types'
import {
  WATER_MAX, CALORIES_MAX, PROTEIN_MAX, SUGAR_MAX,
  NUTRITION_LIMITS,
  WATER_STEP, CALORIES_STEP, PROTEIN_STEP, SUGAR_STEP,
} from '@/constants'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, TODAY } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export const SUPPLEMENT_MOMENTUM_PER_VITAMIN = 5

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 6 ? 0 : -(day + 1)
  const saturday = new Date(d)
  saturday.setDate(d.getDate() + diff)
  return saturday.toISOString().split('T')[0]
}

const LS_KEY = `nutrition_${TODAY}`
const CREATINE_KEY = `creatine_${TODAY}`
const VITAMINS_KEY = `vitamins_${getWeekStart()}`

function lsLoad(): Partial<{ waterLiters: number; calories: number; proteinGrams: number; sugarGrams: number }> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') ?? {} } catch { return {} }
}
function lsSave(waterLiters: number, calories: number, proteinGrams: number, sugarGrams: number) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ waterLiters, calories, proteinGrams, sugarGrams })) } catch {}
}
function lsCreatineLoad(): boolean {
  try { return localStorage.getItem(CREATINE_KEY) === 'true' } catch { return false }
}
function lsCreatineSave(val: boolean) {
  try { localStorage.setItem(CREATINE_KEY, String(val)) } catch {}
}
function lsVitaminsLoad(): { weekly: number; today: number; ts?: number } {
  try { return JSON.parse(localStorage.getItem(VITAMINS_KEY) ?? 'null') ?? { weekly: 0, today: 0 } } catch { return { weekly: 0, today: 0 } }
}
function lsVitaminsSave(weekly: number, today: number, userInitiated = false) {
  try { localStorage.setItem(VITAMINS_KEY, JSON.stringify({ weekly, today, ts: userInitiated ? Date.now() : undefined })) } catch {}
}

async function upsertDay(userId: string, fields: Record<string, unknown>) {
  const { data: updated, error: updateError } = await supabase
    .from('daily_logs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('log_date', TODAY)
    .select('id')
  if (updateError) console.error('[nutrition] UPDATE error:', updateError)
  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase.from('daily_logs').insert({
      user_id: userId,
      log_date: TODAY,
      ...fields,
      updated_at: new Date().toISOString(),
    })
    if (insertError) console.error('[nutrition] INSERT error:', insertError)
    else console.log('[nutrition] INSERT ok', fields)
  } else {
    console.log('[nutrition] UPDATE ok', fields)
  }
}

export function useNutrition() {
  const { user } = useAuth()

  const cached = lsLoad()
  const [state, setState] = useState<NutritionState>({
    waterLiters: cached.waterLiters ?? 0,
    calories: cached.calories ?? 0,
    proteinGrams: cached.proteinGrams ?? 0,
    sugarGrams: cached.sugarGrams ?? 0,
    multivitamins: 0,
    uploadedImage: null,
  })
  const [loaded, setLoaded] = useState(false)

  const vitCached = lsVitaminsLoad()
  const [weeklyMultivitamins, setWeeklyMultivitamins] = useState(vitCached.weekly)
  const [todayMultivitamins, setTodayMultivitamins] = useState(vitCached.today)
  const [allTimeMultivitamins, setAllTimeMultivitamins] = useState(0)
  const [creatineTaken, setCreatineTaken] = useState(lsCreatineLoad)
  const [celebration, setCelebration] = useState<string | null>(null)

  const prevWater = useRef(0)
  const prevCalories = useRef(0)
  const prevProtein = useRef(0)

  const fetchToday = (userId: string) =>
    supabase
      .from('daily_logs')
      .select('water_liters, calories, protein_grams, sugar_grams')
      .eq('user_id', userId)
      .eq('log_date', TODAY)
      .order('log_date')
      .then(({ data: rows }) => {
        const data = rows?.length ? rows[rows.length - 1] : null
        if (data) {
          setState(s => ({
            ...s,
            waterLiters: Number(data.water_liters) || 0,
            calories: Number(data.calories) || 0,
            proteinGrams: Number(data.protein_grams) || 0,
            sugarGrams: Number(data.sugar_grams) || 0,
          }))
        }
      })

  // Load from Supabase on mount — overrides localStorage with authoritative DB values
  useEffect(() => {
    if (!user) { setLoaded(true); return }

    const weekStart = getWeekStart()

    fetchToday(user.id).then(() => setLoaded(true))

    supabase
      .from('daily_logs')
      .select('log_date, multivitamins')
      .eq('user_id', user.id)
      .gte('log_date', weekStart)
      .order('log_date')
      .then(({ data }) => {
        if (!data) return
        const lsVit = lsVitaminsLoad()
        const lsAge = lsVit.ts ? Date.now() - lsVit.ts : Infinity
        if (lsAge < 30000) return
        const todayRows = data.filter(r => r.log_date === TODAY)
        const todayVal = todayRows.length ? todayRows[todayRows.length - 1].multivitamins ?? 0 : 0
        const otherDays = data.filter(r => r.log_date !== TODAY)
        const weekly = otherDays.reduce((s, r) => s + (r.multivitamins ?? 0), 0) + todayVal
        setWeeklyMultivitamins(weekly)
        setTodayMultivitamins(todayVal)
        lsVitaminsSave(weekly, todayVal)
      })

    supabase
      .from('daily_logs')
      .select('multivitamins')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const total = data?.reduce((s, r) => s + (r.multivitamins ?? 0), 0) ?? 0
        setAllTimeMultivitamins(total)
      })
  }, [user])

  // Auto-save to Supabase 600ms after last change — exactly like sleep
  useEffect(() => {
    if (!loaded || !user) return
    const { waterLiters, calories, proteinGrams, sugarGrams } = state
    const id = setTimeout(() => {
      upsertDay(user.id, {
        water_liters: waterLiters,
        calories,
        protein_grams: proteinGrams,
        sugar_grams: sugarGrams,
        multivitamins: todayMultivitamins,
      })
    }, 600)
    return () => clearTimeout(id)
  }, [state.waterLiters, state.calories, state.proteinGrams, state.sugarGrams, todayMultivitamins, loaded, user])

  useEffect(() => { healthSnapshot.waterLiters = state.waterLiters }, [state.waterLiters])
  useEffect(() => { healthSnapshot.calories = state.calories }, [state.calories])

  useEffect(() => {
    lsSave(state.waterLiters, state.calories, state.proteinGrams, state.sugarGrams)
  }, [state.waterLiters, state.calories, state.proteinGrams, state.sugarGrams])

  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 2500)
    return () => clearTimeout(t)
  }, [celebration])

  useEffect(() => {
    const prev = prevWater.current
    prevWater.current = state.waterLiters
    if (prev < NUTRITION_LIMITS.waterTarget && state.waterLiters >= NUTRITION_LIMITS.waterTarget) {
      setCelebration('HYDRATION GOAL REACHED')
    }
  }, [state.waterLiters])

  useEffect(() => {
    const prev = prevCalories.current
    prevCalories.current = state.calories
    if (prev < NUTRITION_LIMITS.caloriesTarget && state.calories >= NUTRITION_LIMITS.caloriesTarget) {
      setCelebration('CALORIE TARGET HIT')
    }
  }, [state.calories])

  useEffect(() => {
    const prev = prevProtein.current
    prevProtein.current = state.proteinGrams
    if (prev < NUTRITION_LIMITS.proteinTarget && state.proteinGrams >= NUTRITION_LIMITS.proteinTarget) {
      setCelebration('PROTEIN GOAL HIT')
    }
  }, [state.proteinGrams])

  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val))

  const saveVitamins = (newTodayCount: number, newWeeklyCount: number) => {
    lsVitaminsSave(newWeeklyCount, newTodayCount, true)
    if (!user) return
    upsertDay(user.id, { multivitamins: newTodayCount }).catch(e => console.error('saveVitamins failed:', e))
  }

  const toggleCreatine = async () => {
    const next = !creatineTaken
    setCreatineTaken(next)
    lsCreatineSave(next)
    // creatine_taken column not yet in DB — local-only for now
  }

  const adjustWater = (delta: number) => setState(s => ({ ...s, waterLiters: clamp(s.waterLiters + delta, 0, WATER_MAX) }))
  const setWater = (val: number) => setState(s => ({ ...s, waterLiters: clamp(val, 0, WATER_MAX) }))
  const adjustCalories = (delta: number) => setState(s => ({ ...s, calories: clamp(s.calories + delta, 0, CALORIES_MAX) }))
  const setCalories = (val: number) => setState(s => ({ ...s, calories: clamp(val, 0, CALORIES_MAX) }))
  const adjustProtein = (delta: number) => setState(s => ({ ...s, proteinGrams: clamp(s.proteinGrams + delta, 0, PROTEIN_MAX) }))
  const setProtein = (val: number) => setState(s => ({ ...s, proteinGrams: clamp(val, 0, PROTEIN_MAX) }))
  const adjustSugar = (delta: number) => setState(s => ({ ...s, sugarGrams: clamp(s.sugarGrams + delta, 0, SUGAR_MAX) }))
  const setSugar = (val: number) => setState(s => ({ ...s, sugarGrams: clamp(val, 0, SUGAR_MAX) }))

  const adjustMultivitamins = (delta: number) => {
    const newWeekly = Math.min(NUTRITION_LIMITS.multivitaminTarget, Math.max(0, weeklyMultivitamins + delta))
    const actualDelta = newWeekly - weeklyMultivitamins
    if (actualDelta === 0) return
    const newToday = Math.max(0, todayMultivitamins + actualDelta)
    setTodayMultivitamins(newToday)
    setWeeklyMultivitamins(newWeekly)
    setAllTimeMultivitamins(a => Math.max(0, a + actualDelta))
    saveVitamins(newToday, newWeekly)
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
    setAllTimeMultivitamins(a => Math.max(0, a + actualDelta))
    saveVitamins(newToday, newWeekly)
  }

  const toggleMultivitamin = () => adjustMultivitamins(todayMultivitamins > 0 ? -todayMultivitamins : 1)
  const incrementMultivitamins = () => adjustMultivitamins(1)
  const decrementMultivitamins = () => adjustMultivitamins(-1)

  const simulateAIScan = () => setState(s => ({ ...s, uploadedImage: 'scanned' }))

  const approveScan = (water: number, calories: number, protein: number, sugar: number) => {
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

  return {
    state,
    loaded,
    limits: NUTRITION_LIMITS,
    steps: { water: WATER_STEP, calories: CALORIES_STEP, protein: PROTEIN_STEP, sugar: SUGAR_STEP },
    maxes: { water: WATER_MAX, calories: CALORIES_MAX, protein: PROTEIN_MAX, sugar: SUGAR_MAX },
    adjustWater, setWater,
    adjustCalories, setCalories,
    adjustProtein, setProtein,
    adjustSugar, setSugar,
    celebration,
    weeklyMultivitamins,
    todayMultivitamins,
    todayVitaminTaken: todayMultivitamins > 0,
    supplementMomentumBoost: allTimeMultivitamins * SUPPLEMENT_MOMENTUM_PER_VITAMIN,
    adjustMultivitamins,
    setMultivitamins,
    saveVitamins,
    toggleMultivitamin,
    incrementMultivitamins,
    decrementMultivitamins,
    creatineTaken,
    toggleCreatine,
    simulateAIScan, approveScan, dismissScan,
  }
}
