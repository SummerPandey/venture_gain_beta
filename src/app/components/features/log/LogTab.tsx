import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Dumbbell, Droplet, Moon, Zap, MessageCircle, Send } from 'lucide-react'
import { RadarChart, PolarGrid, Radar } from 'recharts'
import { useLog } from '@/hooks'
import type { LogCategory, LogPeriod } from '@/types'
import { groqChat, groqText, parseAIJson } from '@/lib/groq'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHealthData } from '@/contexts/HealthDataContext'
import { WORKOUT_LEVEL_LOG_BOOST } from '@/constants'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const LOG_CATEGORIES: { id: LogCategory; label: string; icon: typeof Dumbbell }[] = [
  { id: 'workouts', label: 'WORKOUTS', icon: Dumbbell },
  { id: 'hydration', label: 'HYDRATION', icon: Droplet },
  { id: 'sleep', label: 'SLEEP', icon: Moon },
  { id: 'energy', label: 'ENERGY', icon: Zap },
]

const LOG_PERIODS: LogPeriod[] = ['daily', 'weekly', 'monthly']


type DayEntry = {
  workouts: Array<{ exercise: string; sets?: Array<{ reps: number; weight: number }>; energyRating?: number; type?: string }>
  sleep: number
  energy: number
  water: number
  calories: number
  protein: number
  sugar: number
  workoutLevel: number
  energyWorkout: number
  plannedTime?: string | null
  plannedCategories?: string[]
}

const BTN_ACTIVE = { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' } as const
const BTN_INACTIVE = { background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' } as const

function MiniRadar({ data }: { data: DayEntry }) {
  const radarData = [
    { stat: 'F', value: Math.min(100, Math.round(data.calories / 2500 * 100)) },
    { stat: 'W', value: Math.min(100, Math.round((data.water / 3) * 100)) },
    { stat: 'S', value: Math.min(100, Math.round((data.sleep / 9) * 100)) },
    { stat: 'WO', value: data.workouts.length > 0 ? Math.min(100, data.workoutLevel) : 0 },
    { stat: 'E', value: Math.min(100, data.energy * 10) },
  ]
  return (
    <RadarChart width={52} height={52} data={radarData} style={{ flexShrink: 0 }}>
      <PolarGrid stroke="rgba(139, 90, 62, 0.25)" strokeWidth={0.8} />
      <Radar dataKey="value" fill="#FF9F66" fillOpacity={0.55} stroke="#FF9F66" strokeWidth={1.2} dot={false} />
    </RadarChart>
  )
}

export function LogTab({ isActive }: { isActive?: boolean }) {
  const { user } = useAuth()
  const {
    currentMonth, currentYear, selectedDay, setSelectedDay,
    expandedWeek, setExpandedWeek,
    activeView, setActiveView,
    selectedCategory, setSelectedCategory,
    selectedPeriod, setSelectedPeriod,
    showChat, setShowChat,
    showInsights, setShowInsights,
    chatMessages, chatInput,
    getDayName, getWeeks,
    goToPrevMonth, goToNextMonth,
  } = useLog()

  const [monthData, setMonthData] = useState<Record<number, DayEntry>>({})
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, string>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [openDetail, setOpenDetail] = useState<string | null>(null)

  // Live data from other tabs — always up to date in memory
  const { workout: workoutCtx, nutrition: nutritionCtx, sleep: sleepCtx } = useHealthData()
  const { workoutLevel, energyLevel: workoutEnergy, todayWorkouts, syncFromChat, plannedCategory } = workoutCtx
  const { state: liveNutrition, adjustCalories, adjustWater, adjustProtein, adjustSugar } = nutritionCtx
  const { state: liveSleep, totalSleepHours, setSleepHours, setSleepMinutes, setEnergy } = sleepCtx

  // Keep today's log entry in sync with live context (no debounce, instant)
  useEffect(() => {
    const today = new Date()
    if (currentMonth !== today.getMonth() || currentYear !== today.getFullYear()) return
    const todayDay = today.getDate()
    const hasSomeData = todayWorkouts.length > 0 || workoutLevel > 0 ||
      liveNutrition.waterLiters > 0 || liveNutrition.calories > 0 ||
      liveNutrition.proteinGrams > 0 || liveNutrition.sugarGrams > 0 ||
      totalSleepHours > 0 || liveSleep.energyLevel > 0
    if (!hasSomeData) return
    setMonthData(prev => ({
      ...prev,
      [todayDay]: {
        workouts: todayWorkouts,
        sleep: parseFloat(totalSleepHours.toFixed(1)),
        energy: liveSleep.energyLevel,
        water: liveNutrition.waterLiters,
        calories: liveNutrition.calories,
        protein: liveNutrition.proteinGrams,
        sugar: liveNutrition.sugarGrams,
        workoutLevel,
        energyWorkout: workoutEnergy,
        plannedTime: prev[todayDay]?.plannedTime ?? null,
        plannedCategories: prev[todayDay]?.plannedCategories ?? [],
      },
    }))
  }, [todayWorkouts, workoutLevel, workoutEnergy, liveNutrition.waterLiters, liveNutrition.calories,
    liveNutrition.proteinGrams, liveNutrition.sugarGrams, totalSleepHours, liveSleep.energyLevel,
    currentMonth, currentYear])

  const fetchExerciseDetail = async (exercise: string) => {
    if (exerciseDetails[exercise]) { setOpenDetail(openDetail === exercise ? null : exercise); return }
    setOpenDetail(exercise)
    setLoadingDetail(exercise)
    try {
      const info = await groqText(
        `Give brief info for the exercise "${exercise}" in exactly this compact format (no extra text):
Muscles: <2-3 primary muscles>
Tip: <one key form cue, max 10 words>
Level: <Beginner / Intermediate / Advanced>`,
        'You are a concise fitness coach.'
      )
      setExerciseDetails(prev => ({ ...prev, [exercise]: info.trim() }))
    } catch {
      setExerciseDetails(prev => ({ ...prev, [exercise]: 'Details unavailable.' }))
    } finally {
      setLoadingDetail(null)
    }
  }

  // Fetch real logs for the displayed month — re-runs every time the Log tab is opened
  const fetchMonthData = () => {
    if (!user) return
    const mm = String(currentMonth + 1).padStart(2, '0')
    const start = `${currentYear}-${mm}-01`
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate()
    const end = `${currentYear}-${mm}-${String(lastDay).padStart(2, '0')}`
    // Note: workout_planned_time/workout_planned_categories are fetched separately
    // in openDayModal to avoid breaking this query if those columns don't exist yet.
    supabase
      .from('daily_logs')
      .select('log_date, today_workouts, sleep_hours, sleep_minutes, energy_level, water_liters, calories, protein_grams, sugar_grams, workout_level, energy_level_workout, cardio_minutes')
      .eq('user_id', user.id)
      .gte('log_date', start)
      .lte('log_date', end)
      .then(({ data, error }) => {
        if (error) { console.error('[LogTab] fetchMonthData error:', error.message ?? error); return }
        if (!data) return
        const map: Record<number, DayEntry> = {}
        for (const row of data) {
          const day = parseInt(row.log_date.split('-')[2])
          const workouts = row.today_workouts ?? []
          const sleep = (row.sleep_hours ?? 0) + (row.sleep_minutes ?? 0) / 60
          const hasData = workouts.length > 0 || sleep > 0 || (row.water_liters ?? 0) > 0 || (row.calories ?? 0) > 0 || (row.workout_level ?? 0) > 0 || (row.energy_level ?? 0) > 0 || (row.protein_grams ?? 0) > 0 || (row.sugar_grams ?? 0) > 0 || (row.cardio_minutes ?? 0) > 0
          if (hasData) {
            map[day] = {
              workouts,
              sleep: parseFloat((sleep).toFixed(1)),
              energy: row.energy_level ?? 0,
              water: parseFloat(row.water_liters ?? 0),
              calories: row.calories ?? 0,
              protein: row.protein_grams ?? 0,
              sugar: row.sugar_grams ?? 0,
              workoutLevel: row.workout_level ?? 0,
              energyWorkout: row.energy_level_workout ?? 0,
              plannedTime: null,
              plannedCategories: [],
            }
          }
        }
        setMonthData(prev => {
          // Merge: keep live-synced today entry on top of DB data
          const merged = { ...map }
          const todayDay = new Date().getDate()
          if (prev[todayDay] && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear()) {
            merged[todayDay] = prev[todayDay]
          }
          return merged
        })
      })
  }

  useEffect(() => {
    fetchMonthData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentMonth, currentYear, isActive])

  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Partial<DayEntry>>({})
  const [saving, setSaving] = useState(false)

  const openDayModal = (day: number) => {
    setSelectedDay(day)
    if (!monthData[day]) {
      setEditMode(true)
      setEditValues({ sleep: 0, energy: 0, water: 0, calories: 0, protein: 0, sugar: 0 })
    } else {
      setEditMode(false)
      setEditValues({})
    }
    // Lazily fetch planning columns — isolated so a missing column doesn't break the main fetch
    if (user) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      supabase
        .from('daily_logs')
        .select('workout_planned_time, workout_planned_categories')
        .eq('user_id', user.id)
        .eq('log_date', dateStr)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return
          setMonthData(prev => {
            if (!prev[day]) return prev
            return {
              ...prev,
              [day]: {
                ...prev[day],
                plannedTime: data.workout_planned_time ?? null,
                plannedCategories: data.workout_planned_categories ?? [],
              },
            }
          })
        })
    }
  }

  const startEdit = () => {
    if (selectedDay === null) return
    const d = monthData[selectedDay]
    setEditValues({
      sleep: d.sleep,
      energy: d.energy,
      water: d.water,
      calories: d.calories,
      protein: d.protein,
      sugar: d.sugar,
    })
    setEditMode(true)
  }

  const saveEdit = async () => {
    if (selectedDay === null || !user) return
    setSaving(true)
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    const sleepDecimal = parseFloat(String(editValues.sleep ?? 0))
    const sleepHours = Math.floor(sleepDecimal)
    const sleepMinutes = Math.round((sleepDecimal - sleepHours) * 60)
    const { error } = await supabase.from('daily_logs').upsert({
      user_id: user.id,
      log_date: dateStr,
      sleep_hours: sleepHours,
      sleep_minutes: sleepMinutes,
      energy_level: parseFloat(String(editValues.energy ?? 0)),
      water_liters: parseFloat(String(editValues.water ?? 0)),
      calories: parseFloat(String(editValues.calories ?? 0)),
      protein_grams: parseFloat(String(editValues.protein ?? 0)),
      sugar_grams: parseFloat(String(editValues.sugar ?? 0)),
    }, { onConflict: 'user_id,log_date' })
    setSaving(false)
    if (!error) {
      setMonthData(prev => ({
        ...prev,
        [selectedDay]: {
          ...(prev[selectedDay] ?? { workouts: [], energyWorkout: 0, workoutLevel: 0 }),
          sleep: sleepDecimal,
          energy: parseFloat(String(editValues.energy ?? 0)),
          water: parseFloat(String(editValues.water ?? 0)),
          calories: parseFloat(String(editValues.calories ?? 0)),
          protein: parseFloat(String(editValues.protein ?? 0)),
          sugar: parseFloat(String(editValues.sugar ?? 0)),
        },
      }))
      setEditMode(false)
    }
  }

  const [localMessages, setLocalMessages] = useState(chatMessages)
  const [localInput, setLocalInput] = useState(chatInput)
  const [aiThinking, setAiThinking] = useState(false)
  const chatHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const weeks = getWeeks()

  const avg = (vals: number[]) => vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  const clamp100 = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

  const summaryData = useMemo(() => {
    const today = new Date()
    const todayDay = today.getDate()
    const entries = Object.values(monthData)
    const todayEntry = monthData[todayDay]

    // Last 7 days entries (current month only)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i)
      return (d.getMonth() === currentMonth && d.getFullYear() === currentYear) ? monthData[d.getDate()] : undefined
    }).filter(Boolean) as DayEntry[]

    const pct = {
      workouts: {
        daily: clamp100(todayEntry?.workoutLevel ?? 0),
        weekly: avg(last7.map(e => e.workoutLevel)),
        monthly: avg(entries.map(e => e.workoutLevel)),
      },
      hydration: {
        daily: clamp100((todayEntry?.water ?? 0) / 3 * 100),
        weekly: avg(last7.map(e => clamp100(e.water / 3 * 100))),
        monthly: avg(entries.map(e => clamp100(e.water / 3 * 100))),
      },
      sleep: {
        daily: clamp100((todayEntry?.sleep ?? 0) / 8 * 100),
        weekly: avg(last7.map(e => clamp100(e.sleep / 8 * 100))),
        monthly: avg(entries.map(e => clamp100(e.sleep / 8 * 100))),
      },
      energy: {
        daily: clamp100((todayEntry?.energy ?? 0) * 10),
        weekly: avg(last7.map(e => e.energy * 10)),
        monthly: avg(entries.map(e => e.energy * 10)),
      },
    }

    const daysLogged = entries.length
    const daysHitWater = entries.filter(e => e.water >= 3).length
    const avgSleep = entries.length ? (entries.reduce((s, e) => s + e.sleep, 0) / entries.length).toFixed(1) : '—'
    const avgEnergy = entries.length ? (entries.reduce((s, e) => s + e.energy, 0) / entries.length).toFixed(1) : '—'
    const avgWater = entries.length ? (entries.reduce((s, e) => s + e.water, 0) / entries.length).toFixed(1) : '—'
    const totalWorkouts = entries.reduce((s, e) => s + e.workouts.length, 0)

    return {
      workouts: {
        daily: { percentage: pct.workouts.daily, insights: todayEntry ? [`Workout level: ${todayEntry.workoutLevel}% today`, `${todayEntry.workouts.length} exercise${todayEntry.workouts.length !== 1 ? 's' : ''} logged`, `Energy (workout): ${todayEntry.energyWorkout}%`] : ['No workout data logged today yet'] },
        weekly: { percentage: pct.workouts.weekly, insights: last7.length ? [`Avg workout level this week: ${pct.workouts.weekly}%`, `${last7.reduce((s, e) => s + e.workouts.length, 0)} total exercises logged`, `${last7.filter(e => e.workoutLevel > 0).length} active days this week`] : ['No workout data this week yet'] },
        monthly: { percentage: pct.workouts.monthly, insights: daysLogged ? [`${daysLogged} days logged this month`, `${totalWorkouts} total exercises`, `Avg workout level: ${pct.workouts.monthly}%`] : ['No workout data this month yet'] },
      },
      hydration: {
        daily: { percentage: pct.hydration.daily, insights: todayEntry ? [`${todayEntry.water.toFixed(1)}L consumed today`, `Target: 3L (${pct.hydration.daily}% reached)`, todayEntry.water >= 3 ? 'Daily hydration goal met!' : `${(3 - todayEntry.water).toFixed(1)}L left to reach goal`] : ['No hydration data today yet'] },
        weekly: { percentage: pct.hydration.weekly, insights: last7.length ? [`Avg ${(last7.reduce((s, e) => s + e.water, 0) / last7.length).toFixed(1)}L/day this week`, `${last7.filter(e => e.water >= 3).length} days hit 3L target`, `Weekly hydration score: ${pct.hydration.weekly}%`] : ['No hydration data this week yet'] },
        monthly: { percentage: pct.hydration.monthly, insights: daysLogged ? [`Avg ${avgWater}L/day this month`, `${daysHitWater} days hit the 3L target`, `Monthly hydration score: ${pct.hydration.monthly}%`] : ['No hydration data this month yet'] },
      },
      sleep: {
        daily: { percentage: pct.sleep.daily, insights: todayEntry?.sleep ? [`${todayEntry.sleep}h logged tonight`, `Target: 8h (${pct.sleep.daily}% reached)`, todayEntry.sleep >= 8 ? 'Sleep goal met!' : `${(8 - todayEntry.sleep).toFixed(1)}h short of target`] : ['No sleep data today yet'] },
        weekly: { percentage: pct.sleep.weekly, insights: last7.length ? [`Avg ${(last7.reduce((s, e) => s + e.sleep, 0) / last7.length).toFixed(1)}h/night this week`, `${last7.filter(e => e.sleep >= 7).length} nights with 7h+`, `Weekly sleep score: ${pct.sleep.weekly}%`] : ['No sleep data this week yet'] },
        monthly: { percentage: pct.sleep.monthly, insights: daysLogged ? [`Avg ${avgSleep}h/night this month`, `${entries.filter(e => e.sleep >= 7).length} nights with 7h+`, `Monthly sleep score: ${pct.sleep.monthly}%`] : ['No sleep data this month yet'] },
      },
      energy: {
        daily: { percentage: pct.energy.daily, insights: todayEntry ? [`Energy level: ${todayEntry.energy}/10 today`, `Score: ${pct.energy.daily}%`, todayEntry.energy >= 7 ? 'Great energy today!' : todayEntry.energy >= 4 ? 'Moderate energy today' : 'Low energy — rest up!'] : ['No energy data today yet'] },
        weekly: { percentage: pct.energy.weekly, insights: last7.length ? [`Avg energy: ${(last7.reduce((s, e) => s + e.energy, 0) / last7.length).toFixed(1)}/10 this week`, `${last7.filter(e => e.energy >= 7).length} high-energy days`, `Weekly energy score: ${pct.energy.weekly}%`] : ['No energy data this week yet'] },
        monthly: { percentage: pct.energy.monthly, insights: daysLogged ? [`Avg energy: ${avgEnergy}/10 this month`, `${entries.filter(e => e.energy >= 7).length} high-energy days`, `Monthly energy score: ${pct.energy.monthly}%`] : ['No energy data this month yet'] },
      },
    }
  }, [monthData, currentMonth, currentYear])

  const currentData = summaryData[selectedCategory][selectedPeriod]

  // Reset chat history when chat opens
  useEffect(() => {
    if (showChat) chatHistoryRef.current = []
  }, [showChat])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages, aiThinking])

  const handleSendMessage = async () => {
    const text = localInput.trim()
    if (!text || aiThinking) return
    setLocalMessages(prev => [...prev, { text, isUser: true }])
    setLocalInput('')
    setAiThinking(true)

    // --- Intent detection: try to parse a log action first ---
    if (user) {
      try {
        const intentRaw = await groqText(
          text,
          `Parse health logging intent. Return ONLY valid JSON, no other text, no markdown.
If logging workout exercises: {"action":"log_workout","exercises":[{"exercise":"name","sets":[{"reps":N,"weight":N}],"energyRating":N}]}
  - use sets array for weight training (omit energyRating), use energyRating 1-5 for cardio/bodyweight (omit sets)
If logging nutrition (calories, protein, sugar, water): {"action":"log_nutrition","calories":N,"protein":N,"sugar":N,"water":N}
  - N is the AMOUNT TO ADD (delta, not total). omit any field not mentioned. water in litres.
If logging sleep or energy level: {"action":"log_sleep","sleep_hours":N,"sleep_minutes":N,"energy_level":N}
  - omit any field not mentioned. energy_level is 1-10.
If not a logging request: {"action":"chat"}`
        )
        const intent = parseAIJson<{
          action?: string
          exercises?: Array<{ exercise: string; sets?: Array<{ reps: number; weight: number }>; energyRating?: number }>
          calories?: number; protein?: number; sugar?: number; water?: number
          sleep_hours?: number; sleep_minutes?: number; energy_level?: number
        }>(intentRaw)
        if (!intent) throw new Error('intent parse failed')

        if (intent.action === 'log_workout' && Array.isArray(intent.exercises) && intent.exercises.length > 0) {
          const { data: todayRow } = await supabase
            .from('daily_logs').select('today_workouts, workout_level')
            .eq('user_id', user.id).eq('log_date', getToday()).single()
          const existing = todayRow?.today_workouts ?? []
          const newWorkouts = [
            ...existing,
            ...intent.exercises.map((e: { exercise: string; sets?: Array<{ reps: number; weight: number }>; energyRating?: number }) => ({
              exercise: e.exercise,
              type: e.sets?.length ? 'weights' : 'energy',
              ...(e.sets?.length ? { sets: e.sets } : { energyRating: e.energyRating ?? 3 }),
              ...(plannedCategory ? { category: plannedCategory } : {}),
            })),
          ]
          const newLevel = Math.min(100, (todayRow?.workout_level ?? 0) + intent.exercises.length * WORKOUT_LEVEL_LOG_BOOST)
          await supabase.from('daily_logs').upsert(
            { user_id: user.id, log_date: getToday(), today_workouts: newWorkouts, workout_level: newLevel, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,log_date' }
          )
          // Sync workout context so WorkoutTab reflects it instantly
          syncFromChat(newWorkouts, newLevel)
          const names = intent.exercises.map((e: { exercise: string }) => e.exercise).join(', ')
          setLocalMessages(prev => [...prev, { text: `✓ Logged ${names}. Workout level: ${newLevel}%.`, isUser: false }])
          setAiThinking(false)
          return
        }

        if (intent.action === 'log_nutrition') {
          const hasAny = intent.calories != null || intent.protein != null || intent.sugar != null || intent.water != null
          if (hasAny) {
            // Update nutrition context (additive) — it handles Supabase save automatically
            if (intent.calories != null) adjustCalories(Number(intent.calories))
            if (intent.protein != null) adjustProtein(Number(intent.protein))
            if (intent.sugar != null) adjustSugar(Number(intent.sugar))
            if (intent.water != null) adjustWater(Number(intent.water))
            const parts: string[] = []
            if (intent.calories != null) parts.push(`${intent.calories} kcal`)
            if (intent.protein != null) parts.push(`${intent.protein}g protein`)
            if (intent.sugar != null) parts.push(`${intent.sugar}g sugar`)
            if (intent.water != null) parts.push(`${intent.water}L water`)
            setLocalMessages(prev => [...prev, { text: `✓ Logged ${parts.join(', ')}.`, isUser: false }])
            setAiThinking(false)
            return
          }
        }

        if (intent.action === 'log_sleep') {
          const hasAny = intent.sleep_hours != null || intent.sleep_minutes != null || intent.energy_level != null
          if (hasAny) {
            // Update sleep context — it handles Supabase save automatically
            if (intent.sleep_hours != null) setSleepHours(Number(intent.sleep_hours))
            if (intent.sleep_minutes != null) setSleepMinutes(Number(intent.sleep_minutes))
            if (intent.energy_level != null) setEnergy(Number(intent.energy_level))
            const sleepTotal = (Number(intent.sleep_hours ?? 0)) + (Number(intent.sleep_minutes ?? 0)) / 60
            const parts: string[] = []
            if (sleepTotal > 0) parts.push(`${sleepTotal.toFixed(1)}h sleep`)
            if (intent.energy_level != null) parts.push(`energy ${intent.energy_level}/10`)
            setLocalMessages(prev => [...prev, { text: `✓ Logged ${parts.join(', ')}.`, isUser: false }])
            setAiThinking(false)
            return
          }
        }
      } catch {
        // intent parse failed — fall through to normal chat
      }
    }
    // --- end intent detection ---

    // Normal chat: fetch today's snapshot for context
    let snap = { ...healthSnapshot }
    if (user) {
      const { data } = await supabase
        .from('daily_logs')
        .select('water_liters, calories, energy_level, sleep_hours, sleep_minutes, workout_level')
        .eq('user_id', user.id)
        .eq('log_date', getToday())
        .single()
      if (data) {
        snap = {
          workoutLevel: data.workout_level ?? snap.workoutLevel,
          energyLevel: data.energy_level ?? snap.energyLevel,
          waterLiters: data.water_liters != null ? Number(data.water_liters) : snap.waterLiters,
          calories: data.calories ?? snap.calories,
          sleepHours: data.sleep_hours != null ? data.sleep_hours + (data.sleep_minutes ?? 0) / 60 : snap.sleepHours,
        }
      }
    }

    const systemPrompt = `You are Summer's health companion. Reply in 1-2 short sentences max — no fluff, no lists, no greetings. Be direct and specific. Her data: workout ${snap.workoutLevel ?? '—'}%, energy ${snap.energyLevel ?? '—'}%, water ${snap.waterLiters?.toFixed(1) ?? '—'}L, calories ${snap.calories ?? '—'}, sleep ${snap.sleepHours?.toFixed(1) ?? '—'}h.`
    chatHistoryRef.current.push({ role: 'user', content: text })
    try {
      const reply = await groqChat(chatHistoryRef.current, systemPrompt)
      chatHistoryRef.current.push({ role: 'assistant', content: reply })
      setLocalMessages(prev => [...prev, { text: reply, isUser: false }])
    } catch {
      setLocalMessages(prev => [...prev, { text: "Sorry, I couldn't reach the AI right now. Try again!", isUser: false }])
    } finally {
      setAiThinking(false)
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2
        className="monument-text mb-4 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Activity Log
      </h2>

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        {(['log', 'summary'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className="monument-button flex-1 py-2"
            style={activeView === view ? BTN_ACTIVE : BTN_INACTIVE}
          >
            {view === 'log' ? 'DAILY LOG' : 'SUMMARY'}
          </button>
        ))}
      </div>

      {activeView === 'log' && (
        <>
          {/* Month Nav */}
          <div className="monument-card p-5 mb-4">
            <div className="flex justify-between items-center">
              <button onClick={goToPrevMonth} className="monument-button p-2" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                <ChevronLeft size={18} strokeWidth={2.5} color="#6B4423" />
              </button>
              <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </div>
              <button onClick={goToNextMonth} className="monument-button p-2" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                <ChevronRight size={18} strokeWidth={2.5} color="#6B4423" />
              </button>
            </div>
          </div>

          {/* Week Groups */}
          <div className="space-y-3">
            {weeks.map(week => {
              const isExpanded = expandedWeek === week.weekNumber
              const weekHasData = week.days.some(d => monthData[d])
              return (
                <div key={week.weekNumber}>
                  <div
                    onClick={() => setExpandedWeek(isExpanded ? null : week.weekNumber)}
                    className="monument-card p-4 cursor-pointer hover:opacity-80 transition-all mb-2"
                    style={{ background: weekHasData ? 'rgba(255, 159, 102, 0.15)' : 'rgba(255, 252, 248, 0.5)', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.15)' }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '14px', fontWeight: '700' }}>Week {week.weekNumber}</div>
                      <div className="flex items-center gap-2">
                        {weekHasData && (
                          <div className="monument-text px-2 py-1" style={{ background: 'rgba(255, 159, 102, 0.2)', borderRadius: '6px', border: '1px solid #8B5A3E', color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>
                            {week.days.filter(d => monthData[d]).length} DAYS LOGGED
                          </div>
                        )}
                        {isExpanded ? <ChevronUp size={18} strokeWidth={2.5} color="#6B4423" /> : <ChevronDown size={18} strokeWidth={2.5} color="#6B4423" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 ml-4 mb-3">
                      {week.days.map(day => {
                        const data = monthData[day]
                        const today = new Date()
                        const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
                        return (
                          <div
                            key={day}
                            onClick={() => openDayModal(day)}
                            className="monument-card p-3 cursor-pointer hover:opacity-80 transition-all"
                            style={{
                              background: isToday ? 'linear-gradient(135deg, rgba(255, 159, 102, 0.3) 0%, rgba(255, 184, 138, 0.3) 100%)' : data ? 'rgba(255, 159, 102, 0.15)' : 'rgba(255, 252, 248, 0.5)',
                              boxShadow: isToday ? '0 4px 0 rgba(139, 90, 62, 0.25), 0 0 16px rgba(255, 184, 138, 0.2)' : '0 2px 0 rgba(139, 90, 62, 0.15)',
                            }}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {data && <MiniRadar data={data} />}
                                <div>
                                  <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                                    {MONTH_NAMES[currentMonth].substring(0, 3)} {day}
                                  </div>
                                  <div className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>{getDayName(day)}</div>
                                </div>
                              </div>
                              {data ? (
                                <div className="flex gap-2 items-center flex-shrink-0">
                                  {data.workouts.length > 0 && (
                                    <div className="monument-text px-2 py-1" style={{ background: 'rgba(255, 159, 102, 0.2)', borderRadius: '6px', border: '1px solid #8B5A3E', color: '#8B5A3E', fontSize: '8px', fontWeight: '700' }}>
                                      {data.workouts.length} WORKOUT{data.workouts.length > 1 ? 'S' : ''}
                                    </div>
                                  )}
                                  {data.sleep > 0 && <div className="monument-text" style={{ color: '#FF9F66', fontSize: '9px', fontWeight: '700' }}>{data.sleep}h sleep</div>}
                                </div>
                              ) : (
                                <div className="monument-text flex-shrink-0" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>No activity</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {activeView === 'summary' && (
        <>
          {/* Category Grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {LOG_CATEGORIES.map(cat => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className="monument-button py-3"
                  style={selectedCategory === cat.id ? { ...BTN_ACTIVE, borderRadius: '12px' } : { ...BTN_INACTIVE, borderRadius: '12px' }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Icon size={18} strokeWidth={2.5} />
                    <span>{cat.label}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Period Selector */}
          <div className="flex gap-2 mb-6">
            {LOG_PERIODS.map(period => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className="monument-button flex-1 py-2"
                style={selectedPeriod === period ? BTN_ACTIVE : BTN_INACTIVE}
              >
                {period.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Score Card */}
          <div className="monument-card p-6 mb-6 text-center">
            <div className="monument-text mb-2" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>
              {selectedCategory.toUpperCase()} — {selectedPeriod.toUpperCase()}
            </div>
            <div className="monument-text mb-2" style={{ color: '#FF9F66', fontSize: '48px', fontWeight: '800', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}>
              {currentData.percentage}%
            </div>
            <div className="w-full h-4 relative overflow-hidden" style={{ background: 'rgba(255, 184, 138, 0.2)', borderRadius: '10px', border: '2px solid #8B5A3E' }}>
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{ width: `${currentData.percentage}%`, background: 'linear-gradient(90deg, #FF9F66 0%, #FFB88A 100%)', boxShadow: '0 0 8px rgba(255, 159, 102, 0.3)', borderRadius: '10px' }}
              />
            </div>
          </div>

          {/* AI Insights */}
          <div className="monument-card p-5">
            <div className="flex justify-between items-center cursor-pointer hover:opacity-80 transition-all mb-4" onClick={() => setShowInsights(!showInsights)}>
              <div className="monument-text text-center flex-1" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>AI INSIGHTS</div>
              {showInsights ? <ChevronUp size={18} strokeWidth={2.5} color="#6B4423" /> : <ChevronDown size={18} strokeWidth={2.5} color="#6B4423" />}
            </div>
            {showInsights && (
              <div className="space-y-3">
                {currentData.insights.map((insight, i) => (
                  <div key={i} className="monument-card p-3" style={{ background: 'rgba(255, 252, 248, 0.5)', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.15)' }}>
                    <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', lineHeight: '1.5' }}>• {insight}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Day Detail Modal */}
      {selectedDay !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(107, 68, 35, 0.7)', backdropFilter: 'blur(8px)' }} onClick={() => { setSelectedDay(null); setEditMode(false) }}>
          <div className="monument-card p-6 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>
                {MONTH_NAMES[currentMonth]} {selectedDay}, {currentYear}
              </div>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <button onClick={startEdit} className="monument-button px-3 py-1" style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '9px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}>EDIT</button>
                ) : (
                  <>
                    <button onClick={saveEdit} disabled={saving} className="monument-button px-3 py-1" style={{ background: saving ? 'rgba(255,184,138,0.4)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '9px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}>{saving ? '...' : 'SAVE'}</button>
                    <button onClick={() => { if (!monthData[selectedDay!]) { setSelectedDay(null) } else { setEditMode(false) } }} className="monument-button px-3 py-1" style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '9px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}>CANCEL</button>
                  </>
                )}
                <button onClick={() => { setSelectedDay(null); setEditMode(false) }} className="monument-button" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
              </div>
            </div>
            {(monthData[selectedDay!]?.workouts.length ?? 0) > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>WORKOUTS</div>
                  {(() => {
                    const t = monthData[selectedDay!]?.plannedTime
                    const cats = monthData[selectedDay!]?.plannedCategories ?? []
                    return (
                      <>
                        {t && <span className="monument-text px-2 py-0.5" style={{ background: 'rgba(255,159,102,0.12)', border: '1.5px solid rgba(255,159,102,0.4)', borderRadius: '6px', color: '#E8956A', fontSize: '8px', fontWeight: '700' }}>{t}</span>}
                        {cats.map(c => <span key={c} className="monument-text px-2 py-0.5" style={{ background: 'rgba(255,159,102,0.08)', border: '1.5px solid rgba(139,90,62,0.25)', borderRadius: '6px', color: '#8B5A3E', fontSize: '8px', fontWeight: '700' }}>{c}</span>)}
                      </>
                    )
                  })()}</div>
                {(monthData[selectedDay!]?.workouts ?? []).map((w, i) => (
                  <div key={i} className="monument-card p-3 mb-2" style={{ background: 'rgba(255, 252, 248, 0.5)', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.15)' }}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{w.exercise}</div>
                      <button
                        onClick={() => fetchExerciseDetail(w.exercise)}
                        className="monument-button px-2 py-0.5"
                        style={{ background: 'rgba(255,252,248,0.95)', border: '1.5px solid rgba(139,90,62,0.3)', borderRadius: '6px', color: '#A0725A', fontSize: '8px', fontWeight: '700' }}
                      >
                        {loadingDetail === w.exercise ? '...' : openDetail === w.exercise ? '▲ less' : '▼ info'}
                      </button>
                    </div>
                    {w.sets?.length ? w.sets.map((s, si) => (
                      <div key={si} className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Set {si + 1}: {s.reps} reps × {s.weight} kg</div>
                    )) : (
                      <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Energy: {w.energyRating}/5</div>
                    )}
                    {openDetail === w.exercise && exerciseDetails[w.exercise] && (
                      <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(139,90,62,0.15)' }}>
                        {exerciseDetails[w.exercise].split('\n').map((line, li) => (
                          <div key={li} className="monument-text" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', lineHeight: '1.6' }}>{line}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'sleep'    as const, label: 'SLEEP',    color: '#9B7FC8', fmt: (v: number) => `${v}h`,              unit: 'h',    step: '0.5', max: '24'  },
                { key: 'energy'   as const, label: 'ENERGY',   color: '#FFD166', fmt: (v: number) => `${v}/10`,            unit: '/10',  step: '1',   max: '10'  },
                { key: 'water'    as const, label: 'WATER',    color: '#7BAFD4', fmt: (v: number) => `${v}L`,              unit: 'L',    step: '0.1', max: '10'  },
                { key: 'calories' as const, label: 'CALORIES', color: '#E8956A', fmt: (v: number) => `${Math.round(v)} kcal`, unit: 'kcal', step: '50',  max: '9999'},
                { key: 'protein'  as const, label: 'PROTEIN',  color: '#5BB8A8', fmt: (v: number) => `${Math.round(v)}g`,  unit: 'g',    step: '1',   max: '999', over: false },
                { key: 'sugar'    as const, label: 'SUGAR',    color: '#C47AE8', fmt: (v: number) => `${Math.round(v)}g`,  unit: 'g',    step: '1',   max: '999', over: true  },
              ].map(({ key, label, color, fmt, unit, step, max, over }) => {
                const val = editMode ? (editValues[key] ?? 0) : (monthData[selectedDay!]?.[key] ?? 0)
                if (!editMode && !val) return null
                const isWarning = !editMode && over && (val as number) > 30
                return (
                  <div key={key} className="monument-card p-3" style={{ background: isWarning ? 'rgba(211,47,47,0.06)' : 'rgba(255, 252, 248, 0.5)', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.15)', border: isWarning ? '1.5px solid rgba(211,47,47,0.3)' : undefined }}>
                    <div className="monument-text mb-1" style={{ color: isWarning ? '#D32F2F' : '#A0725A', fontSize: '9px', fontWeight: '700' }}>{label}</div>
                    {editMode ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max={max}
                          step={step}
                          value={editValues[key] ?? 0}
                          onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                          className="monument-text"
                          style={{ width: '64px', background: 'rgba(255,252,248,0.95)', border: '1.5px solid #8B5A3E', borderRadius: '6px', color, fontSize: '13px', fontWeight: '700', padding: '2px 4px', outline: 'none' }}
                        />
                        <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{unit}</span>
                      </div>
                    ) : (
                      <div className="monument-text" style={{ color: isWarning ? '#D32F2F' : color, fontSize: '14px', fontWeight: '700' }}>{fmt(val as number)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat FAB */}
      <button
        onClick={() => setShowChat(true)}
        className="fixed bottom-24 right-6 p-4 soft-pulse monument-button"
        style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '50%', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255, 184, 138, 0.4), 0 6px 0 rgba(139, 90, 62, 0.3)', zIndex: 40 }}
      >
        <MessageCircle size={28} strokeWidth={2.5} color="#6B4423" />
      </button>

      {/* Chat Modal */}
      {showChat && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowChat(false)} />
          <div className="fixed z-50 monument-card flex flex-col" style={{ bottom: '116px', right: '16px', width: 'min(calc(100vw - 32px), 380px)', height: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b-2" style={{ borderColor: '#8B5A3E' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 cozy-glow" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '50%', border: '2px solid #8B5A3E' }}>
                  <MessageCircle size={20} strokeWidth={2.5} color="#6B4423" />
                </div>
                <div>
                  <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>AI Companion</div>
                  <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Always here to help!</div>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} className="monument-button" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'rgba(255, 252, 248, 0.3)' }}>
              {localMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className="monument-card px-4 py-3 max-w-[80%]" style={{ background: msg.isUser ? 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)' : 'rgba(255, 252, 248, 0.95)', border: `2px solid ${msg.isUser ? '#8B5A3E' : '#A0725A'}`, boxShadow: msg.isUser ? '0 4px 0 rgba(139, 90, 62, 0.25)' : '0 2px 0 rgba(160, 114, 90, 0.2)' }}>
                    <div className="monument-text" style={{ color: msg.isUser ? '#6B4423' : '#8B5A3E', fontSize: '11px', fontWeight: '700', lineHeight: '1.6' }}>{msg.text}</div>
                  </div>
                </div>
              ))}
              {aiThinking && (
                <div className="flex justify-start">
                  <div className="monument-card px-4 py-3" style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #A0725A', boxShadow: '0 2px 0 rgba(160, 114, 90, 0.2)' }}>
                    <div className="monument-text soft-pulse" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>thinking...</div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t-2" style={{ borderColor: '#8B5A3E' }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={localInput}
                  onChange={e => setLocalInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && !aiThinking && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 monument-text"
                  style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', outline: 'none' }}
                />
                <button onClick={handleSendMessage} disabled={aiThinking} className="monument-button p-3 cozy-glow" style={{ background: aiThinking ? 'rgba(255, 184, 138, 0.4)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '12px', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255, 184, 138, 0.15), 0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                  <Send size={20} strokeWidth={2.5} color="#6B4423" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

