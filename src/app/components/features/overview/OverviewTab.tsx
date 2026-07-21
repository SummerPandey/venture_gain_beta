import { useState, useEffect, useMemo } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { ChevronLeft, ChevronRight, X, Moon } from 'lucide-react'
import { LEVEL, CURRENT_MOMENTUM, NEXT_LEVEL_MOMENTUM, TIER_THRESHOLDS } from '@/constants'
import type { WorkoutEntry } from '@/types'
import { SUPPLEMENT_MOMENTUM_PER_VITAMIN } from '@/hooks/useNutrition'
import { useHealthData } from '@/contexts/HealthDataContext'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUserSettings, AVATAR_SPRITES } from '@/contexts/UserSettingsContext'

type ChimcharMood = 'fired_up' | 'happy' | 'tired' | 'resting'

const MOOD_CONFIG: Record<ChimcharMood, {
  sprite: string; cssClass: string; label: string; labelColor: string
  glowBox: string
}> = {
  fired_up: {
    sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/chimchar.gif',
    cssClass: 'chimchar-fired-up',
    label: 'ON FIRE',
    labelColor: '#E8793A',
    glowBox: '0 0 32px rgba(255, 120, 50, 0.45), 0 4px 0 rgba(139, 90, 62, 0.25)',
  },
  happy: {
    sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/chimchar.gif',
    cssClass: 'chimchar-happy',
    label: 'CHIMCHAR',
    labelColor: '#6B4423',
    glowBox: '0 0 20px rgba(255, 184, 138, 0.15), 0 4px 0 rgba(139, 90, 62, 0.25)',
  },
  tired: {
    sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/chimchar.gif',
    cssClass: 'chimchar-tired',
    label: 'TIRED...',
    labelColor: '#A0725A',
    glowBox: '0 0 12px rgba(160, 114, 90, 0.15), 0 4px 0 rgba(139, 90, 62, 0.15)',
  },
  resting: {
    sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/chimchar.gif',
    cssClass: 'chimchar-resting',
    label: 'RESTING',
    labelColor: '#B8997A',
    glowBox: '0 0 8px rgba(139, 90, 62, 0.08)',
  },
}



function getTierName(level: number): string {
  for (const tier of TIER_THRESHOLDS) {
    if (level >= tier.min) return tier.name
  }
  return 'Foundation'
}

const CATEGORIES = [
  {
    name: 'Speed',
    color: '#FF6B6B', gradient: 'linear-gradient(135deg,#FF6B6B,#FF8E8E)', border: '#CC4444', shadow: 'rgba(255,107,107,0.25)',
    exercises: ['100m Sprint','60m Sprint','40 Yard Dash','Flying 30m','Resisted Sprints','Overspeed Sprints','Acceleration Runs','Block Starts','Hill Sprints','Sled Sprints','Wicket Runs','Sprint Drills'],
  },
  {
    name: 'Speed Endurance',
    color: '#C47AE8', gradient: 'linear-gradient(135deg,#C47AE8,#D49AF0)', border: '#9A50C8', shadow: 'rgba(196,122,232,0.25)',
    exercises: ['200m Repeats','300m Repeats','400m Repeats','Shuttle Runs','Suicide Sprints','HIIT Intervals','150m Runs','Hollow Sprints','In & Outs','Intensive Intervals','Special Endurance','Flying 200s'],
  },
  {
    name: 'Tempo',
    color: '#7BAFD4', gradient: 'linear-gradient(135deg,#7BAFD4,#9ECAE8)', border: '#4A88B8', shadow: 'rgba(123,175,212,0.25)',
    exercises: ['Tempo Runs','Extensive Tempo','Intensive Tempo','Threshold Runs','Circuit Training','Aerobic Intervals','Recovery Runs','Fartlek','Progression Runs','Strides','Easy Runs','Cross Training'],
  },
  {
    name: 'Push',
    color: '#FF9F66', gradient: 'linear-gradient(135deg,#FF9F66,#FFB88A)', border: '#CC7040', shadow: 'rgba(255,159,102,0.25)',
    exercises: ['Bench Press','Incline Bench Press','Overhead Press','Dumbbell Press','Push-ups','Dips','Pike Push-ups','Cable Chest Fly','Lateral Raises','Front Raises','Tricep Extensions','Skull Crushers','Close Grip Bench','Arnold Press','Machine Press','Landmine Press'],
  },
  {
    name: 'Pull',
    color: '#5BB8A8', gradient: 'linear-gradient(135deg,#5BB8A8,#7ECEC0)', border: '#369080', shadow: 'rgba(91,184,168,0.25)',
    exercises: ['Pull-ups','Chin-ups','Lat Pulldown','Barbell Row','Dumbbell Row','Cable Row','Face Pulls','Rear Delt Fly','Bicep Curls','Hammer Curls','Shrugs','T-Bar Row','Meadows Row','Inverted Row','Single Arm Row','Rack Pull'],
  },
  {
    name: 'Upper',
    color: '#D4956A', gradient: 'linear-gradient(135deg,#D4956A,#E8B088)', border: '#A86840', shadow: 'rgba(212,149,106,0.25)',
    exercises: ['Bench Press','Pull-ups','Overhead Press','Barbell Row','Dips','Bicep Curls','Tricep Extensions','Lateral Raises','Face Pulls','Cable Crossover','Chest Fly','Upright Row','Arnold Press','Hammer Curls','Skull Crushers','Shrugs'],
  },
  {
    name: 'Lower',
    color: '#8BAF8C', gradient: 'linear-gradient(135deg,#8BAF8C,#A8C8A8)', border: '#5A8C5E', shadow: 'rgba(139,175,140,0.25)',
    exercises: ['Squats','Deadlift','Romanian Deadlift','Leg Press','Bulgarian Split Squats','Lunges','Hip Thrusts','Glute Bridges','Leg Curls','Leg Extensions','Calf Raises','Step-ups','Box Jumps','Hack Squats','Sumo Deadlift','Good Mornings'],
  },
  {
    name: 'Rest Day',
    color: '#9B7FC8', gradient: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', border: '#7A5FA8', shadow: 'rgba(155,127,200,0.25)',
    exercises: [] as unknown as readonly string[],
  },
] as const

const EXERCISE_GOALS: Record<string, number> = {
  'Bench Press': 100, 'Squats': 120, 'Deadlift': 140,
  'Pull-ups': 20, 'Overhead Press': 80, 'Barbell Row': 100,
  'Romanian Deadlift': 110, 'Incline Bench Press': 90,
  'Hip Thrusts': 100, 'Leg Press': 150,
}

const AXIS_TICK = { fill: '#A0725A', fontSize: 9, fontFamily: 'Poppins', fontWeight: 700 } as const
const GRID = { strokeDasharray: '3 3', stroke: 'rgba(160,114,90,0.2)' } as const

// Category base scores — reflects how demanding each training type is
const CAT_BASE: Record<string, number> = {
  'Speed': 90,
  'Speed Endurance': 85,
  'Tempo': 70,
  'Upper': 80,
  'Lower': 80,
  'Push': 75,
  'Pull': 75,
  'Rest Day': 45,
}

function computeWorkoutScore(workouts: WorkoutEntry[]): number {
  if (workouts.length === 0) return 0

  const uniqueCats = [...new Set(workouts.map(w => w.category).filter(Boolean))] as string[]
  const isOnlyRest = uniqueCats.length === 1 && uniqueCats[0] === 'Rest Day'
  if (isOnlyRest) return 45

  // Highest-intensity category sets the floor
  const nonRest = uniqueCats.filter(c => c !== 'Rest Day')
  const base = nonRest.length > 0
    ? Math.max(...nonRest.map(c => CAT_BASE[c] ?? 70))
    : 70

  // Volume bonus: each exercise after the first adds +1 (max +5)
  const active = workouts.filter(w => w.category !== 'Rest Day')
  const volumeBonus = Math.min(5, active.length - 1)

  // Energy bonus: avg exercise energy rating (1–5) → up to +10 pts
  const ratings = active.map(w => w.energyRating ?? 3)
  const avgRating = ratings.reduce((s, r) => s + r, 0) / ratings.length
  const energyBonus = ((avgRating - 1) / 4) * 10

  return Math.min(100, Math.round(base + volumeBonus + energyBonus))
}


type HistoricalDay = {
  workoutLevel: number; energyWorkout: number
  sleepHours: number; sleepMinutes: number; energyLevel: number
  waterLiters: number; calories: number
  workouts: WorkoutEntry[]
}

function offsetDate(base: string, delta: number): string {
  const d = new Date(base + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(dateStr: string): string {
  if (dateStr === getToday()) return 'Today'
  if (dateStr === offsetDate(getToday(), -1)) return 'Yesterday'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function OverviewTab() {
  const { user } = useAuth()
  const { settings } = useUserSettings()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [supplementMomentum, setSupplementMomentum] = useState(0)
  const [viewingDate, setViewingDate] = useState(() => getToday())
  const [histDay, setHistDay] = useState<HistoricalDay | null>(null)
  const [loadingDay, setLoadingDay] = useState(false)

  const { nutrition: nutritionCtx, workout: workoutCtx, sleep: sleepCtx } = useHealthData()
  const { state: nutrition } = nutritionCtx
  const { todayWorkouts, historicalLogs } = workoutCtx
  const { state: sleep, totalSleepHours } = sleepCtx

  const isToday = viewingDate === getToday()

  useEffect(() => {
    if (isToday || !user) { setHistDay(null); return }
    setLoadingDay(true)
    Promise.all([
      supabase
        .from('daily_logs')
        .select('workout_level, energy_level_workout, sleep_hours, sleep_minutes, energy_level, water_liters, calories, today_workouts')
        .eq('user_id', user.id)
        .eq('log_date', viewingDate)
        .single(),
      supabase
        .from('workout_entries')
        .select('exercise, category, type, energy_rating, sets')
        .eq('user_id', user.id)
        .eq('log_date', viewingDate),
    ]).then(([{ data }, { data: entries }]) => {
      if (!data) { setHistDay(null); setLoadingDay(false); return }
      // prefer workout_entries (has proper categories); fall back to today_workouts JSONB
      const workouts: WorkoutEntry[] = (entries && entries.length > 0)
        ? entries.map(e => ({ exercise: e.exercise, category: e.category ?? undefined, type: e.type as 'energy' | 'weights', energyRating: e.energy_rating ?? undefined, sets: e.sets ?? undefined, time: '' }))
        : (Array.isArray(data.today_workouts) ? data.today_workouts : [])
      setHistDay({
        workoutLevel: Number(data.workout_level) || 0,
        energyWorkout: Number(data.energy_level_workout) || 0,
        sleepHours: Number(data.sleep_hours) || 0,
        sleepMinutes: Number(data.sleep_minutes) || 0,
        energyLevel: Number(data.energy_level) || 0,
        waterLiters: Number(data.water_liters) || 0,
        calories: Number(data.calories) || 0,
        workouts,
      })
      setLoadingDay(false)
    })
  }, [viewingDate, user, isToday])

  const radarStats = useMemo(() => {
    if (!isToday && histDay) {
      const sleepTotal = histDay.sleepHours + histDay.sleepMinutes / 60
      return [
        { stat: 'FOOD',    value: Math.min(100, Math.round(histDay.calories / 2500 * 100)) },
        { stat: 'WATER',   value: Math.min(100, Math.round(histDay.waterLiters / 3 * 100)) },
        { stat: 'SLEEP',   value: Math.min(100, Math.round(sleepTotal / 9 * 100)) },
        { stat: 'WORKOUT', value: computeWorkoutScore(histDay.workouts) },
        { stat: 'ENERGY',  value: Math.min(100, Math.round(histDay.energyLevel * 10)) },
      ]
    }

    // FOOD, WATER, SLEEP: 0–100% of daily goal — reset each day, go up as you hit targets
    const foodVal  = Math.min(100, Math.round(nutrition.calories / 2500 * 100))
    const waterVal = Math.min(100, Math.round(nutrition.waterLiters / 3 * 100))
    const sleepVal = Math.min(100, Math.round(totalSleepHours / 9 * 100))  // 9 hrs = 100%

    // WORKOUT: scored per session — category sets the base, volume + energy rating add bonus
    const workoutVal = computeWorkoutScore(todayWorkouts)

    // ENERGY: strictly from the sleep tab 1–10 daily rating (no workout-energy fallback)
    const energyVal = Math.min(100, Math.round(sleep.energyLevel * 10))

    return [
      { stat: 'FOOD',    value: foodVal },
      { stat: 'WATER',   value: waterVal },
      { stat: 'SLEEP',   value: sleepVal },
      { stat: 'WORKOUT', value: workoutVal },
      { stat: 'ENERGY',  value: energyVal },
    ]
  }, [isToday, histDay, nutrition.calories, nutrition.waterLiters, todayWorkouts, sleep.energyLevel, totalSleepHours])

  useEffect(() => {
    if (!user) return
    supabase
      .from('daily_logs')
      .select('multivitamins')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const total = data?.reduce((s, r) => s + (r.multivitamins ?? 0), 0) ?? 0
        setSupplementMomentum(total * SUPPLEMENT_MOMENTUM_PER_VITAMIN)
      })
  }, [user])

  // Per-category: count of unique exercises logged in last 14 days
  const categoryStats = useMemo(() => {
    const stats: Record<string, { logged: Set<string>; lastDate: string | null }> = {}
    for (const cat of CATEGORIES) {
      stats[cat.name] = { logged: new Set(), lastDate: null }
    }
    for (const day of historicalLogs) {
      for (const w of day.workouts) {
        // Prefer stored category field; fall back to name matching
        const matchedCatName = w.category
          ?? CATEGORIES.find(c => (c.exercises as readonly string[]).includes(w.exercise))?.name
        if (matchedCatName && stats[matchedCatName]) {
          stats[matchedCatName].logged.add(w.exercise)
          if (!stats[matchedCatName].lastDate || day.date > stats[matchedCatName].lastDate!) {
            stats[matchedCatName].lastDate = day.date
          }
        }
      }
    }
    return stats
  }, [historicalLogs])

  // Per-exercise history for detail view
  const exerciseDetail = useMemo(() => {
    if (!selectedExercise) return null
    const sessions = historicalLogs
      .filter(d => d.workouts.some(w => w.exercise === selectedExercise))
      .map(d => {
        const ws = d.workouts.filter(w => w.exercise === selectedExercise)
        let maxWeight = 0, totalReps = 0, maxEnergy = 0
        for (const w of ws) {
          if (w.type === 'weights' && w.sets) {
            for (const s of w.sets) {
              if (s.weight > maxWeight) maxWeight = s.weight
              totalReps += s.reps
            }
          }
          if (w.energyRating && w.energyRating > maxEnergy) maxEnergy = w.energyRating
        }
        return { date: d.date, dayLabel: d.dayLabel, maxWeight, totalReps, maxEnergy, workouts: ws }
      })
    const bestWeight = sessions.length ? Math.max(...sessions.map(s => s.maxWeight)) : 0
    const bestEnergy = sessions.length ? Math.max(...sessions.map(s => s.maxEnergy)) : 0
    const goal = EXERCISE_GOALS[selectedExercise] ?? 0
    const isWeights = sessions.some(s => s.maxWeight > 0)
    const chartData = sessions.map(s => ({
      day: s.dayLabel,
      value: isWeights ? s.maxWeight : s.maxEnergy,
    }))
    return { sessions, bestWeight, bestEnergy, goal, isWeights, chartData }
  }, [selectedExercise, historicalLogs])

  const streakDays = settings.streakDays
  const streakYearsCompleted = streakDays > 0 ? Math.floor(streakDays / 365) : 0
  const daysToNextYear = streakDays > 0 ? 365 - (streakDays % 365) : null

  const mood = useMemo((): ChimcharMood => {
    let w: number, e: number, s: number, h: number, f: number
    if (!isToday && histDay) {
      const sleepTotal = histDay.sleepHours + histDay.sleepMinutes / 60
      w = computeWorkoutScore(histDay.workouts) / 100
      e = histDay.energyLevel / 10
      s = Math.min(1, sleepTotal / 9)
      h = Math.min(1, histDay.waterLiters / 3)
      f = Math.min(1, histDay.calories / 2500)
    } else {
      w = computeWorkoutScore(todayWorkouts) / 100
      e = sleep.energyLevel / 10
      s = Math.min(1, totalSleepHours / 9)
      h = Math.min(1, nutrition.waterLiters / 3)
      f = Math.min(1, nutrition.calories / 2500)
    }
    const score = (w + e + s + h + f) / 5
    if (score >= 0.40) return 'fired_up'
    if (score >= 0.22) return 'happy'
    if (score >= 0.12) return 'tired'
    return 'resting'
  }, [isToday, histDay, todayWorkouts, sleep.energyLevel, totalSleepHours, nutrition.waterLiters, nutrition.calories])
  const avatarSprite = mood === 'resting'
    ? 'https://img.pokemondb.net/sprites/black-white/anim/normal/magikarp.gif'
    : (AVATAR_SPRITES[settings.avatar] ?? AVATAR_SPRITES['chimchar'])
  const moodCfg = { ...MOOD_CONFIG[mood], sprite: avatarSprite }
  const totalMomentum = CURRENT_MOMENTUM + supplementMomentum
  const progressPercentage = Math.min(100, (totalMomentum / NEXT_LEVEL_MOMENTUM) * 100)
  const tierName = getTierName(LEVEL)

  const selectedCategoryData = CATEGORIES.find(c => c.name === selectedCategory)

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2
        className="monument-text mb-4 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Overview
      </h2>

      {/* Date nav */}
      <div className="monument-card flex items-center justify-between px-4 py-2 mb-6">
        <button
          onClick={() => setViewingDate(d => offsetDate(d, -1))}
          className="monument-button p-1.5"
          style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} color="#6B4423" />
        </button>
        <div className="monument-text text-center" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
          {loadingDay ? '...' : formatDateLabel(viewingDate)}
        </div>
        <button
          onClick={() => setViewingDate(d => { const next = offsetDate(d, 1); return next > getToday() ? d : next })}
          disabled={isToday}
          className="monument-button p-1.5"
          style={{ background: isToday ? 'rgba(255,252,248,0.5)' : 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 3px 0 rgba(139,90,62,0.25)', opacity: isToday ? 0.4 : 1 }}
        >
          <ChevronRight size={16} strokeWidth={2.5} color="#6B4423" />
        </button>
      </div>

      {/* Level + Streak Row */}
      <div className="flex gap-4 mb-8">
        <div className="monument-card p-5 flex-1">
          <div className="flex justify-between items-center mb-3">
            <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
              Level {LEVEL} — {tierName}
            </div>
            <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>
              {totalMomentum} / {NEXT_LEVEL_MOMENTUM}
            </div>
          </div>
          <div className="w-full h-2 relative overflow-hidden" style={{ background: 'rgba(255, 159, 102, 0.15)', borderRadius: '10px', border: '2px solid #8B5A3E' }}>
            <div
              className="h-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%`, background: 'linear-gradient(90deg, #FF9F66 0%, #FFB88A 100%)', boxShadow: '0 0 10px rgba(255, 184, 138, 0.4)', borderRadius: '10px' }}
            />
          </div>
        </div>

        <div className="monument-card p-4 text-center">
          <div className="monument-text mb-1" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '1px' }}>STREAK</div>
          <div className="monument-text" style={{ color: '#FF9F66', fontSize: '22px', fontWeight: '800', lineHeight: 1, textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}>
            {streakDays > 0 ? streakDays : '—'}
          </div>
          <div className="monument-text mb-3" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '1px' }}>DAYS</div>
          {daysToNextYear !== null && (
            <>
              <div style={{ height: '1px', background: 'rgba(139, 90, 62, 0.15)', marginBottom: '10px' }} />
              <div className="monument-text" style={{ color: '#6B4423', fontSize: '18px', fontWeight: '800', lineHeight: 1 }}>{daysToNextYear}</div>
              <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px' }}>DAYS TO</div>
              <div className="monument-text" style={{ color: '#A0725A', fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px' }}>YEAR {streakYearsCompleted + 1}</div>
            </>
          )}
        </div>
      </div>

      {/* Chimchar Companion */}
      <div className="flex justify-center mb-8">
        <div className="relative">
          <div
            className="w-40 h-40 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
              borderRadius: '20px',
              border: '3px solid #8B5A3E',
              boxShadow: moodCfg.glowBox,
              transition: 'box-shadow 0.8s ease',
            }}
          >
            <img
              src={moodCfg.sprite}
              alt={`Chimchar — ${mood}`}
              className={moodCfg.cssClass}
              style={{ width: '96px', height: '96px', imageRendering: 'pixelated' }}
            />
          </div>
          <div
            className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 monument-text px-4 py-2"
            style={{
              background: 'rgba(255, 252, 248, 0.9)',
              color: moodCfg.labelColor,
              fontSize: '10px',
              fontWeight: '700',
              border: '2px solid #8B5A3E',
              borderRadius: '12px',
              boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
              whiteSpace: 'nowrap',
              transition: 'color 0.5s ease',
            }}
          >
            {moodCfg.label}
          </div>
        </div>
      </div>

      {/* Radar Stats */}
      <div className="monument-card p-5 mb-6">
        <div className="monument-text text-center mb-4" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Stats</div>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarStats}>
            <PolarGrid stroke="rgba(160, 114, 90, 0.2)" strokeWidth={1} />
            <PolarAngleAxis
              dataKey="stat"
              tick={{ fill: '#A0725A', fontSize: 10, fontFamily: 'Poppins', fontWeight: '700' }}
            />
            <Radar dataKey="value" stroke="#FF9F66" fill="#FF9F66" fillOpacity={0.4} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Exercise Progress — Category Grid */}
      <div className="monument-card p-5">
        <div className="monument-text text-center mb-4" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Exercise Progress</div>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.map(cat => {
            const stats = categoryStats[cat.name]
            const isRestDay = cat.exercises.length === 0
            const count = isRestDay
              ? historicalLogs.filter(d => d.workouts.some(w => w.category === 'Rest Day' || w.exercise === 'Rest Day')).length
              : (stats?.logged.size ?? 0)
            return (
              <button
                key={cat.name}
                onClick={() => setSelectedCategory(cat.name)}
                className="monument-button p-4 flex flex-col gap-1.5 text-left"
                style={{
                  background: cat.gradient,
                  borderRadius: '14px',
                  border: `2px solid ${cat.border}`,
                  boxShadow: `0 4px 0 ${cat.shadow}`,
                }}
              >
                <span className="monument-text" style={{ color: '#fff', fontSize: '12px', fontWeight: '700', textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
                  {cat.name}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>
                  {isRestDay
                    ? (count > 0 ? `${count} rest day${count > 1 ? 's' : ''} taken` : 'No rest days logged')
                    : (count > 0 ? `${count} exercise${count > 1 ? 's' : ''} logged` : 'No data yet')}
                </span>
                {count > 0 && !isRestDay && (
                  <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.25)', borderRadius: 2, marginTop: 2 }}>
                    <div style={{ width: `${Math.min(100, (count / cat.exercises.length) * 100)}%`, height: '100%', background: 'rgba(255,255,255,0.85)', borderRadius: 2 }} />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category Modal — exercise list */}
      {selectedCategory && selectedCategoryData && !selectedExercise && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(107,68,35,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSelectedCategory(null)}
        >
          <div className="monument-card p-5 max-w-md w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: selectedCategoryData.color }} />
                <span className="monument-text" style={{ color: '#6B4423', fontSize: '14px', fontWeight: '700' }}>
                  {selectedCategory}
                </span>
              </div>
              <button
                onClick={() => setSelectedCategory(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} strokeWidth={2.5} color="#A0725A" />
              </button>
            </div>

            {/* Exercise list */}
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {selectedCategoryData.exercises.length === 0 && (() => {
                const restSessions = historicalLogs
                  .filter(d => d.workouts.some(w => w.category === 'Rest Day' || w.exercise === 'Rest Day'))
                  .sort((a, b) => b.date.localeCompare(a.date))
                return (
                  <>
                    <div className="flex flex-col items-center justify-center py-6 gap-2 flex-shrink-0">
                      <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', border: '2.5px solid #7A5FA8' }}>
                        <Moon size={26} strokeWidth={2.5} color="#fff" />
                      </div>
                      <div className="monument-text text-center" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>Rest & Recovery</div>
                      <div className="monument-text text-center px-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', lineHeight: 1.6 }}>
                        Rest days are when your body actually gets stronger.
                      </div>
                    </div>
                    {restSessions.length === 0 ? (
                      <div className="monument-text text-center py-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
                        No rest days logged yet. Track from the Workout tab.
                      </div>
                    ) : (
                      <>
                        <div className="monument-text px-1 mb-1 flex-shrink-0" style={{ color: '#7A5FA8', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>
                          REST DAY HISTORY ({restSessions.length})
                        </div>
                        {restSessions.map((day, i) => (
                          <div key={i} className="flex items-center justify-between px-4 py-3" style={{ background: 'rgba(155,127,200,0.08)', borderRadius: '12px', border: '1.5px solid rgba(155,127,200,0.3)' }}>
                            <span className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{formatDateLabel(day.date)}</span>
                            <span style={{ color: '#9B7FC8', fontSize: '10px', fontWeight: '700', fontFamily: 'Poppins' }}>Rest ✓</span>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )
              })()}
              {selectedCategoryData.exercises.map(exercise => {
                // Find sessions for this exercise
                const sessions = historicalLogs.filter(d =>
                  d.workouts.some(w => w.exercise === exercise)
                )
                const lastSession = sessions[sessions.length - 1]
                let bestPerf = ''
                if (lastSession) {
                  const ws = lastSession.workouts.filter(w => w.exercise === exercise)
                  const maxW = Math.max(...ws.flatMap(w => (w.sets ?? []).map(s => s.weight)).filter(Boolean))
                  const maxE = Math.max(...ws.map(w => w.energyRating ?? 0))
                  if (maxW > 0) bestPerf = `${maxW} kg`
                  else if (maxE > 0) bestPerf = `E:${maxE}/5`
                }
                const hasData = sessions.length > 0

                return (
                  <button
                    key={exercise}
                    onClick={() => setSelectedExercise(exercise)}
                    className="monument-button flex items-center gap-3 px-4 py-3"
                    style={{
                      background: hasData ? 'rgba(255,252,248,0.95)' : 'rgba(255,252,248,0.5)',
                      borderRadius: '12px',
                      border: hasData ? `1.5px solid ${selectedCategoryData.border}` : '1.5px solid rgba(139,90,62,0.15)',
                      textAlign: 'left',
                    }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: hasData ? selectedCategoryData.color : 'rgba(139,90,62,0.2)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="monument-text" style={{ color: hasData ? '#6B4423' : '#A0725A', fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exercise}</div>
                      {hasData && (
                        <div style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>
                          {sessions.length} session{sessions.length > 1 ? 's' : ''}{bestPerf ? ` · best ${bestPerf}` : ''}
                        </div>
                      )}
                    </div>
                    <span style={{ color: hasData ? selectedCategoryData.color : '#C0A090', fontSize: '14px', fontWeight: '700' }}>›</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Exercise Detail Modal */}
      {selectedExercise && exerciseDetail && (() => {
        const { sessions, bestWeight, bestEnergy, goal, isWeights, chartData } = exerciseDetail
        const catData = CATEGORIES.find(c => (c.exercises as readonly string[]).includes(selectedExercise))
        const accentColor = catData?.color ?? '#FF9F66'
        const accentBorder = catData?.border ?? '#CC7040'
        const hasSessions = sessions.length > 0
        const progressPct = goal > 0 ? Math.min(100, Math.round(((isWeights ? bestWeight : bestEnergy) / goal) * 100)) : 0

        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(107,68,35,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={() => setSelectedExercise(null)}
          >
            <div
              className="monument-card w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
              style={{ padding: '20px' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                <button
                  onClick={() => setSelectedExercise(null)}
                  className="monument-button p-1.5"
                  style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: `2px solid ${accentBorder}`, boxShadow: `0 2px 0 ${catData?.shadow ?? 'rgba(139,90,62,0.2)'}` }}
                >
                  <span style={{ color: accentBorder, fontSize: '14px', fontWeight: '700', lineHeight: 1 }}>‹</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="monument-text" style={{ color: '#6B4423', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedExercise}</div>
                  {catData && <div style={{ color: accentColor, fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>{catData.name}</div>}
                </div>
                <button onClick={() => setSelectedExercise(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <X size={16} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                {!hasSessions ? (
                  <div className="monument-text text-center py-12" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>
                    No sessions logged yet.{'\n'}Log this exercise to see your progress.
                  </div>
                ) : (
                  <>
                    {/* Best + goal */}
                    <div className="flex gap-3 mb-4">
                      <div className="flex-1 px-4 py-3" style={{ background: `rgba(${accentColor === '#FF9F66' ? '255,159,102' : accentColor === '#FF6B6B' ? '255,107,107' : accentColor === '#C47AE8' ? '196,122,232' : accentColor === '#7BAFD4' ? '123,175,212' : accentColor === '#5BB8A8' ? '91,184,168' : accentColor === '#D4956A' ? '212,149,106' : '139,175,140'},0.12)`, borderRadius: '12px', border: `1.5px solid ${accentColor}40` }}>
                        <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>BEST EVER</div>
                        <div className="monument-text mt-1" style={{ color: '#6B4423', fontSize: '20px', fontWeight: '800', lineHeight: 1 }}>
                          {isWeights ? (bestWeight > 0 ? `${bestWeight}` : '—') : (bestEnergy > 0 ? `${bestEnergy}/5` : '—')}
                        </div>
                        <div style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>
                          {isWeights ? 'kg' : 'energy'}
                        </div>
                      </div>
                      <div className="flex-1 px-4 py-3" style={{ background: 'rgba(255,252,248,0.8)', borderRadius: '12px', border: '1.5px solid rgba(139,90,62,0.15)' }}>
                        <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>SESSIONS</div>
                        <div className="monument-text mt-1" style={{ color: '#6B4423', fontSize: '20px', fontWeight: '800', lineHeight: 1 }}>{sessions.length}</div>
                        <div style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>logged</div>
                      </div>
                    </div>

                    {/* Goal progress bar */}
                    {goal > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between mb-1.5">
                          <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>GOAL PROGRESS</span>
                          <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{isWeights ? bestWeight : bestEnergy} / {goal} {isWeights ? 'kg' : ''} ({progressPct}%)</span>
                        </div>
                        <div style={{ height: 10, background: 'rgba(255,159,102,0.15)', borderRadius: 6, border: '1.5px solid rgba(255,159,102,0.3)' }}>
                          <div style={{ width: `${progressPct}%`, height: '100%', background: `linear-gradient(90deg,${accentColor},${accentColor}CC)`, borderRadius: 6, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    )}

                    {/* Performance chart */}
                    {chartData.length > 1 && (
                      <div className="mb-4">
                        <div className="monument-text mb-2" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>
                          {isWeights ? 'WEIGHT OVER TIME' : 'ENERGY OVER TIME'}
                        </div>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={chartData}>
                            <CartesianGrid {...GRID} />
                            <XAxis dataKey="day" tick={AXIS_TICK} axisLine={{ stroke: 'rgba(160,114,90,0.2)' }} />
                            <YAxis tick={AXIS_TICK} axisLine={{ stroke: 'rgba(160,114,90,0.2)' }} />
                            <Tooltip
                              contentStyle={{ background: 'rgba(255,252,248,0.95)', border: `1.5px solid ${accentBorder}`, borderRadius: '8px', fontFamily: 'Poppins', fontSize: '10px', fontWeight: 700, color: '#6B4423' }}
                              labelStyle={{ color: '#A0725A' }}
                            />
                            <Line type="monotone" dataKey="value" stroke={accentColor} strokeWidth={2.5} dot={{ fill: accentColor, r: 4 }} activeDot={{ r: 6 }} name={isWeights ? 'kg' : 'energy'} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Session history */}
                    <div className="monument-text mb-2" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>RECENT SESSIONS</div>
                    <div className="flex flex-col gap-2">
                      {[...sessions].reverse().slice(0, 10).map((s, i) => (
                        <div key={i} className="px-3 py-2.5" style={{ background: 'rgba(255,252,248,0.7)', borderRadius: '10px', border: '1.5px solid rgba(139,90,62,0.15)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="monument-text" style={{ color: '#6B4423', fontSize: '10px', fontWeight: '700' }}>{s.date}</span>
                            {s.maxWeight > 0 && <span style={{ color: accentColor, fontSize: '10px', fontWeight: '700', fontFamily: 'Poppins' }}>best {s.maxWeight} kg</span>}
                            {s.maxEnergy > 0 && !s.maxWeight && <span style={{ color: accentColor, fontSize: '10px', fontWeight: '700', fontFamily: 'Poppins' }}>E:{s.maxEnergy}/5</span>}
                          </div>
                          {s.workouts.map((w, wi) => (
                            <div key={wi}>
                              {w.type === 'weights' && w.sets && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {w.sets.map((set, si) => (
                                    <span key={si} style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}40`, borderRadius: '6px', padding: '1px 6px', color: '#8B5A3E', fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>
                                      {set.reps}r × {set.weight}kg
                                    </span>
                                  ))}
                                </div>
                              )}
                              {w.type === 'energy' && (
                                <div style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', fontFamily: 'Poppins' }}>Energy: {w.energyRating}/5</div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
