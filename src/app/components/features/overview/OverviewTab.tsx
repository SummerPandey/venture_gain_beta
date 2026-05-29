import { useState, useEffect, useMemo } from 'react'
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Activity, TrendingUp, Dumbbell, X } from 'lucide-react'
import { LEVEL, CURRENT_MOMENTUM, NEXT_LEVEL_MOMENTUM, TIER_THRESHOLDS, STREAK_YEARS, STREAK_ANNIVERSARY } from '@/constants'
import { SUPPLEMENT_MOMENTUM_PER_VITAMIN } from '@/hooks/useNutrition'
import { useNutrition } from '@/hooks/useNutrition'
import { useWorkout } from '@/hooks/useWorkout'
import { useSleep } from '@/hooks/useSleep'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

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

function computeMood(): ChimcharMood {
  const snap = healthSnapshot
  const w = snap.workoutLevel / 100
  const e = snap.energyLevel / 100
  const s = Math.min(1, snap.sleepHours / 8)
  const h = Math.min(1, snap.waterLiters / 3)
  const score = (w + e + s + h) / 4
  if (score >= 0.40) return 'fired_up'
  if (score >= 0.22) return 'happy'
  if (score >= 0.12) return 'tired'
  return 'resting'
}

function daysUntilNextAnniversary(): number {
  const today = new Date()
  const year = today.getFullYear()
  let next = new Date(year, STREAK_ANNIVERSARY.month, STREAK_ANNIVERSARY.day)
  if (next <= today) next = new Date(year + 1, STREAK_ANNIVERSARY.month, STREAK_ANNIVERSARY.day)
  return Math.ceil((next.getTime() - today.getTime()) / 86_400_000)
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


export function OverviewTab() {
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [supplementMomentum, setSupplementMomentum] = useState(0)

  const { state: nutrition } = useNutrition()
  const { workoutLevel, todayWorkouts, energyLevel: workoutEnergy, historicalLogs } = useWorkout()
  const { state: sleep, totalSleepHours } = useSleep()

  const radarStats = useMemo(() => {
    const calories = nutrition.calories
    const water = nutrition.waterLiters
    const workout = todayWorkouts.length > 0 ? workoutLevel : 0
    const energyVal = sleep.energyLevel > 0 ? sleep.energyLevel * 10 : workoutEnergy
    return [
      { stat: 'FOOD',    value: Math.min(100, Math.round(calories / 2500 * 100)) },
      { stat: 'WATER',   value: Math.min(100, Math.round(water / 3 * 100)) },
      { stat: 'SLEEP',   value: Math.min(100, Math.round(totalSleepHours / 9 * 100)) },
      { stat: 'WORKOUT', value: Math.min(100, Math.round(workout)) },
      { stat: 'ENERGY',  value: Math.min(100, Math.round(energyVal)) },
    ]
  }, [nutrition.calories, nutrition.waterLiters, workoutLevel, todayWorkouts.length, sleep.energyLevel, workoutEnergy, totalSleepHours])

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

  const daysLeft = daysUntilNextAnniversary()
  const mood = computeMood()
  const moodCfg = MOOD_CONFIG[mood]
  const totalMomentum = CURRENT_MOMENTUM + supplementMomentum
  const progressPercentage = Math.min(100, (totalMomentum / NEXT_LEVEL_MOMENTUM) * 100)
  const tierName = getTierName(LEVEL)

  const selectedCategoryData = CATEGORIES.find(c => c.name === selectedCategory)

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2
        className="monument-text mb-6 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Overview
      </h2>

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
          <div className="monument-text" style={{ color: '#FF9F66', fontSize: '24px', fontWeight: '800', lineHeight: 1, textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}>{STREAK_YEARS}</div>
          <div className="monument-text mb-3" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '1px' }}>YEARS</div>
          <div style={{ height: '1px', background: 'rgba(139, 90, 62, 0.15)', marginBottom: '10px' }} />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '18px', fontWeight: '800', lineHeight: 1 }}>{daysLeft}</div>
          <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px' }}>DAYS TO</div>
          <div className="monument-text" style={{ color: '#A0725A', fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px' }}>YEAR {STREAK_YEARS + 1}</div>
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
            const count = stats?.logged.size ?? 0
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
                  {count > 0 ? `${count} exercise${count > 1 ? 's' : ''} logged` : 'No data yet'}
                </span>
                {count > 0 && (
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
              {selectedCategoryData.exercises.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div style={{ fontSize: '36px' }}>🛌</div>
                  <div className="monument-text text-center" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>Rest & Recovery</div>
                  <div className="monument-text text-center px-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', lineHeight: 1.6 }}>
                    Rest days are when your body actually gets stronger. Track rest days from the Workout tab to keep your streak going.
                  </div>
                </div>
              )}
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
