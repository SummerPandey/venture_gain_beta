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
import { fetchCaloriesBurned, GoogleHealthNotConnectedError } from '@/lib/googleHealth'

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


/** Returns the Supabase error (if any) so callers can surface it — previously
 *  this only logged to the console, which nobody sees on a phone, so a save
 *  could fail silently forever with no visible symptom besides "it didn't save". */
async function upsertDay(userId: string, fields: Record<string, unknown>): Promise<string | null> {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: userId, log_date: getToday(), ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
  if (error) console.error('[nutrition] upsert error:', error)
  return error?.message ?? null
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
  const [caloriesBurned, setCaloriesBurned] = useState(0)
  const [caloriesBurnedStatus, setCaloriesBurnedStatus] = useState<'loading' | 'connected' | 'not_connected' | 'error'>('loading')

  const [weeklyMultivitamins, setWeeklyMultivitamins] = useState(0)
  const [todayMultivitamins, setTodayMultivitamins] = useState(0)
  const [creatineTaken, setCreatineTaken] = useState(false)
  const [celebration, setCelebration] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const prevWater = useRef(0)
  const prevCalories = useRef(0)
  const prevProtein = useRef(0)
  const userModified = useRef(false)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])
  // Debounced, not-yet-saved edit — tagged with its owner so a sign-out/sign-in
  // can never flush one account's totals into another account's row.
  const pendingNutrition = useRef<{ userId: string; fields: Record<string, unknown> } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Date this hook's data was loaded for — used to detect a midnight rollover
  // while the PWA stays resident in memory (it never remounts on reopen).
  const loadedDate = useRef<string>('')
  // True while today's row is being (re)fetched — edits are ignored meanwhile,
  // since the incoming response would overwrite them anyway.
  const loadingRef = useRef(false)
  const loadSeq = useRef(0)
  // All writes go through one promise chain so they reach the DB in the order
  // they were made; only the newest write's result drives the error banner.
  const writeChain = useRef<Promise<unknown>>(Promise.resolve())
  const writeSeq = useRef(0)
  const lastFitbitFetch = useRef(0)

  const save = (userId: string, fields: Record<string, unknown>): Promise<string | null> => {
    const seq = ++writeSeq.current
    const p = writeChain.current.then(() => upsertDay(userId, fields))
    writeChain.current = p.catch(() => null)
    return p.then(
      err => { if (seq === writeSeq.current || err) setSaveError(err); return err },
      e => { const msg = e instanceof Error ? e.message : String(e); setSaveError(msg); return msg },
    )
  }

  /** Resolves true when today's row loaded; on a failed read nothing is reset,
   *  so a network blip can't turn into a "fresh empty day" that the next
   *  auto-save writes over the real totals. */
  const fetchToday = (userId: string, seq: number) =>
    supabase
      .from('daily_logs')
      .select('water_liters, calories, protein_grams, sugar_grams, creatine_taken')
      .eq('user_id', userId)
      .eq('log_date', getToday())
      .order('log_date')
      .then(({ data: rows, error }) => {
        if (seq !== loadSeq.current) return false
        if (error) {
          console.error('[nutrition] load error:', error)
          setSaveError("Couldn't load today's totals — tap retry")
          return false
        }
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
        return true
      })

  const loadAll = (userId: string): Promise<boolean> => {
    const seq = ++loadSeq.current
    userModified.current = false
    loadingRef.current = true
    setLoaded(false)
    loadedDate.current = getToday()
    const weekStart = getWeekStart()

    const p = Promise.resolve(fetchToday(userId, seq)).then(ok => {
      if (seq !== loadSeq.current) return ok
      loadingRef.current = false
      setLoaded(ok)
      if (ok) setSaveError(prev => (prev?.startsWith("Couldn't load") ? null : prev))
      return ok
    }, () => {
      if (seq === loadSeq.current) { loadingRef.current = false; setSaveError("Couldn't load today's totals — tap retry") }
      return false
    })

    supabase
      .from('daily_logs')
      .select('log_date, multivitamins')
      .eq('user_id', userId)
      .gte('log_date', weekStart)
      .order('log_date')
      .then(({ data }) => {
        if (!data || seq !== loadSeq.current) return
        const todayRows = data.filter(r => r.log_date === getToday())
        const todayVal = todayRows.length ? todayRows[todayRows.length - 1].multivitamins ?? 0 : 0
        const otherDays = data.filter(r => r.log_date !== getToday())
        const weekly = otherDays.reduce((s, r) => s + (r.multivitamins ?? 0), 0) + todayVal
        setWeeklyMultivitamins(weekly)
        setTodayMultivitamins(todayVal)
      })

    return p
  }

  // Load from Supabase on mount / account change
  useEffect(() => {
    // A pending edit belongs to whoever made it — never carry it across accounts.
    if (pendingNutrition.current && pendingNutrition.current.userId !== user?.id) pendingNutrition.current = null
    if (!user) { loadSeq.current++; loadingRef.current = false; setLoaded(true); return }
    loadAll(user.id)
  }, [user?.id])

  const flushPendingNutrition = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    const pending = pendingNutrition.current
    pendingNutrition.current = null
    if (pending && userRef.current?.id === pending.userId) save(pending.userId, pending.fields)
  }

  /** Call before applying an edit. Returns true (and reloads) when the edit must
   *  be dropped: today's row is still loading, or the day rolled over while the
   *  app stayed open — otherwise yesterday's totals would be saved into today. */
  const blockEdit = () => {
    if (loadingRef.current) return true
    const u = userRef.current
    // Today's row never loaded (see fetchToday) — editing on top of placeholder
    // zeros would overwrite the real totals once it's saved.
    if (u && !loaded) return true
    if (u && loadedDate.current && getToday() !== loadedDate.current) {
      flushPendingNutrition()
      loadAll(u.id)
      return true
    }
    return false
  }

  // Reset/reload when the app returns to the foreground on a new calendar day.
  // The PWA stays in memory across midnight, so without this the previous day's
  // totals carry over and get written into today's row on the next edit.
  //
  // Also flush any pending (debounced, not-yet-saved) edit the moment the page
  // goes hidden — this provider lives at the app root and never actually
  // unmounts during normal tab switching, so it's the only reliable point to
  // save before iOS/Android can reclaim a backgrounded PWA mid-debounce.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') { flushPendingNutrition(); return }
      if (document.visibilityState !== 'visible') return
      const u = userRef.current
      if (!u) return
      if (getToday() !== loadedDate.current) loadAll(u.id)
      // Fitbit's burned total keeps climbing through the day — refresh it on
      // return when it's stale or last failed.
      if (Date.now() - lastFitbitFetch.current > 5 * 60_000) refreshFitbitCalories()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)
    window.addEventListener('pagehide', flushPendingNutrition)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
      window.removeEventListener('pagehide', flushPendingNutrition)
    }
  }, [])

  // Auto-save to Supabase 600ms after last user-initiated change (not on initial load)
  useEffect(() => {
    if (!loaded || !user || !userModified.current) return
    const { waterLiters, calories, proteinGrams, sugarGrams } = state
    // calories/protein/sugar/multivitamins are `integer` columns — round
    // defensively here too, since this is the actual DB write boundary.
    // log_date is frozen to the day this data belongs to, so a flush that
    // fires after midnight can't land in the next day's row.
    const fields = {
      log_date: loadedDate.current || getToday(),
      water_liters: waterLiters,
      calories: Math.round(calories),
      protein_grams: Math.round(proteinGrams),
      sugar_grams: Math.round(sugarGrams),
      multivitamins: Math.round(todayMultivitamins),
    }
    const pending = { userId: user.id, fields }
    pendingNutrition.current = pending
    const id = setTimeout(() => {
      saveTimer.current = null
      if (pendingNutrition.current !== pending) return // already flushed
      pendingNutrition.current = null
      save(user.id, fields)
    }, 600)
    saveTimer.current = id
    return () => { clearTimeout(id); if (saveTimer.current === id) saveTimer.current = null }
  }, [state.waterLiters, state.calories, state.proteinGrams, state.sugarGrams, todayMultivitamins, loaded, user?.id])

  // Last-resort flush on a genuine unmount (e.g. sign-out) — the visibilitychange/
  // pagehide handlers above cover the normal backgrounding case, since this
  // provider otherwise stays mounted for the life of the session.
  useEffect(() => {
    return () => {
      flushPendingNutrition()
    }
  }, [])

  useEffect(() => { healthSnapshot.waterLiters = state.waterLiters }, [state.waterLiters])
  useEffect(() => { healthSnapshot.calories = state.calories }, [state.calories])

  /** Pulls today's total calories burned (BMR + activity) from the Google Health proxy
   *  — an informational read next to calories eaten, not something the user edits. */
  const refreshFitbitCalories = () => {
    if (!userRef.current) return
    lastFitbitFetch.current = Date.now()
    setCaloriesBurnedStatus(prev => (prev === 'error' ? 'loading' : prev))
    fetchCaloriesBurned(getToday())
      .then(kcal => {
        setCaloriesBurned(kcal)
        setCaloriesBurnedStatus('connected')
      })
      .catch(e => {
        setCaloriesBurnedStatus(e instanceof GoogleHealthNotConnectedError ? 'not_connected' : 'error')
      })
  }

  useEffect(() => {
    if (!loaded || !user) return
    refreshFitbitCalories()
  }, [loaded, user?.id])

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

  /** Non-finite input (NaN, a stray string from AI output) clamps to `min`
   *  instead of leaking NaN into state and the DB. */
  const clamp = (val: number, min: number, max: number) => {
    const n = Number(val)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
  }

  /** Re-attempts the last save immediately, for a "tap to retry" banner.
   *  If today's totals never loaded, retries the load instead — saving would
   *  overwrite the real row with this screen's empty placeholders. */
  const retrySave = () => {
    if (!user) return
    if (!loaded) { loadAll(user.id); return }
    const { waterLiters, calories, proteinGrams, sugarGrams } = state
    save(user.id, {
      log_date: loadedDate.current || getToday(),
      water_liters: waterLiters,
      calories: Math.round(calories),
      protein_grams: Math.round(proteinGrams),
      sugar_grams: Math.round(sugarGrams),
      multivitamins: Math.round(todayMultivitamins),
    })
  }

  const saveVitamins = (newTodayCount: number) => {
    if (!user) return
    save(user.id, { multivitamins: Math.round(newTodayCount) })
  }

  const creatineSeq = useRef(0)
  const toggleCreatine = async () => {
    if (blockEdit()) return
    const next = !creatineTaken
    const seq = ++creatineSeq.current
    setCreatineTaken(next)
    if (user) {
      const err = await save(user.id, { creatine_taken: next })
      // Roll back the optimistic toggle if this (still latest) write failed.
      if (err && seq === creatineSeq.current) setCreatineTaken(!next)
    }
  }

  /** Applies a nutrition edit unless it must be dropped (see blockEdit). */
  const edit = (fn: (s: NutritionState) => NutritionState) => {
    if (blockEdit()) return
    userModified.current = true
    setState(fn)
  }

  // calories/protein/sugar are integer columns — round here so what's shown
  // (and what the goal celebrations see) matches what gets saved.
  const adjustWater = (delta: number) => edit(s => ({ ...s, waterLiters: clamp(s.waterLiters + delta, 0, WATER_MAX) }))
  const setWater = (val: number) => edit(s => ({ ...s, waterLiters: clamp(Math.round(val * 100) / 100, 0, WATER_MAX) }))
  const adjustCalories = (delta: number) => edit(s => ({ ...s, calories: clamp(s.calories + delta, 0, CALORIES_MAX) }))
  const setCalories = (val: number) => edit(s => ({ ...s, calories: clamp(Math.round(val), 0, CALORIES_MAX) }))
  const adjustProtein = (delta: number) => edit(s => ({ ...s, proteinGrams: clamp(s.proteinGrams + delta, 0, PROTEIN_MAX) }))
  const setProtein = (val: number) => edit(s => ({ ...s, proteinGrams: clamp(Math.round(val), 0, PROTEIN_MAX) }))
  const adjustSugar = (delta: number) => edit(s => ({ ...s, sugarGrams: clamp(s.sugarGrams + delta, 0, SUGAR_MAX) }))
  const setSugar = (val: number) => edit(s => ({ ...s, sugarGrams: clamp(Math.round(val), 0, SUGAR_MAX) }))

  // Only today's row can be changed from here, so the weekly count can't drop
  // below what earlier days already hold — otherwise a decrement "works" and
  // then reverts on the next reload.
  const weeklyFloor = () => Math.max(0, weeklyMultivitamins - todayMultivitamins)

  const adjustMultivitamins = (delta: number) => {
    if (blockEdit()) return
    const newWeekly = Math.min(NUTRITION_LIMITS.multivitaminTarget, Math.max(weeklyFloor(), weeklyMultivitamins + delta))
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
    if (blockEdit()) return
    const newWeekly = Math.round(clamp(val, weeklyFloor(), NUTRITION_LIMITS.multivitaminTarget))
    const actualDelta = newWeekly - weeklyMultivitamins
    const newToday = Math.max(0, todayMultivitamins + actualDelta)
    setTodayMultivitamins(newToday)
    setWeeklyMultivitamins(newWeekly)
    saveVitamins(newToday)
  }

  const simulateAIScan = () => setState(s => ({ ...s, uploadedImage: 'scanned' }))

  const approveScan = (water: number, calories: number, protein: number, sugar: number) => {
    if (blockEdit()) return
    // Coerce — AI output can carry numeric strings ("300"), and `n + "300"`
    // would concatenate instead of add.
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
    water = num(water); calories = num(calories); protein = num(protein); sugar = num(sugar)
    userModified.current = true
    setState(s => ({
      ...s,
      waterLiters: clamp(Math.round((s.waterLiters + water) * 100) / 100, 0, WATER_MAX),
      // calories/protein/sugar are `integer` columns in daily_logs — AI-estimated
      // values (e.g. "30.4g protein") must be rounded here or the whole day's
      // upsert fails with a Postgres type error, silently dropping water too
      // since all four fields save together in one call.
      calories: Math.round(clamp(s.calories + calories, 0, CALORIES_MAX)),
      proteinGrams: Math.round(clamp(s.proteinGrams + protein, 0, PROTEIN_MAX)),
      sugarGrams: Math.round(clamp(s.sugarGrams + sugar, 0, SUGAR_MAX)),
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
    caloriesBurned, caloriesBurnedStatus,
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
    saveError, retrySave,
    refreshFitbitCalories,
  }
}
