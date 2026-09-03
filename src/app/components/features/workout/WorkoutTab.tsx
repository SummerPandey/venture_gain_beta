import React, { useState, useMemo, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line } from 'recharts'
import { Dumbbell, TrendingUp, Target, Award, Activity, ChevronUp, Zap, Plus, Minus, X, Camera, Mic, FolderOpen, Check, MessageCircle, Send, Moon } from 'lucide-react'
import { PixelBar } from '@/app/components/shared'
import { useHealthData } from '@/contexts/HealthDataContext'
import { groqText, groqChat, parseAIJson } from '@/lib/groq'
import { geminiVision } from '@/lib/gemini'
import { healthSnapshot } from '@/store/healthSnapshot'
import type { DayLog } from '@/hooks/useWorkout'
import { CARDIO_MAX_MINUTES } from '@/constants'
import { TRAINING_CATEGORIES } from '@/constants/trainingCategories'
import type { ExerciseProgress, WorkoutSet, WorkoutEntry, WeightUnit } from '@/types'
import { toggleKgLbs, unitLabel, toKgValue } from '@/lib/units'

interface WorkoutScan {
  exercise: string
  type: 'weights' | 'energy'
  sets: WorkoutSet[]
  energyRating: number
  unit: WeightUnit
}

interface CoachMessage {
  text: string
  isUser: boolean
  workouts?: WorkoutScan[] | null
}
const DEFAULT_WORKOUT_SCAN: WorkoutScan = {
  exercise: '',
  type: 'weights',
  sets: [{ reps: 0, weight: 0 }],
  energyRating: 3,
  unit: 'kg',
}

const VOICE_WORKOUT_PROMPT = (transcript: string) => `The user gave this voice transcript while logging a workout: "${transcript}". Extract EVERY exercise mentioned — don't drop any reps or weights they said. Return ONLY a valid JSON array (no markdown, no explanation):
[{"exercise":"<name, properly capitalised>","type":"<'weights' if sets/reps/weight were mentioned, 'energy' if cardio or general effort>","sets":[{"reps":<number>,"weight":<number, 0 if bodyweight or not mentioned>}, ...],"energyRating":<1-5 only when type is 'energy', else null>,"unit":"<'kg' or 'lbs' — whichever they said, default 'kg'>","description":"<2-5 word summary>"}]
Rules:
- One item per distinct exercise, even if mentioned in the same breath ("bench then squats" → 2 items)
- "X sets of Y" → expand into X separate {reps: Y} entries
- Keep the weight for every set — if one weight was given for all sets, repeat it; if per-set weights differ, use those
Examples:
- "calf raises three sets of twelve" → [{"exercise":"Calf Raises","type":"weights","sets":[{"reps":12,"weight":0},{"reps":12,"weight":0},{"reps":12,"weight":0}],"unit":"kg","description":"Calf Raises 3x12"}]
- "bench press four sets of eight at 80 kg" → [{"exercise":"Bench Press","type":"weights","sets":[{"reps":8,"weight":80},{"reps":8,"weight":80},{"reps":8,"weight":80},{"reps":8,"weight":80}],"unit":"kg","description":"Bench Press 4x8 @80kg"}]
- "squats three sets of five at 225 pounds" → [{"exercise":"Squats","type":"weights","sets":[{"reps":5,"weight":225},{"reps":5,"weight":225},{"reps":5,"weight":225}],"unit":"lbs","description":"Squats 3x5 @225lbs"}]
- "then I did pull-ups three sets of ten bodyweight" → [{"exercise":"Pull-ups","type":"weights","sets":[{"reps":10,"weight":0},{"reps":10,"weight":0},{"reps":10,"weight":0}],"unit":"kg","description":"Pull-ups 3x10"}]
- "went for a run felt great" → [{"exercise":"Running","type":"energy","sets":[],"energyRating":4,"unit":"kg","description":"Running"}]`

const EXERCISE_GOALS: Pick<ExerciseProgress, 'exercise' | 'goal' | 'icon' | 'unit'>[] = [
  { exercise: 'Bench Press', goal: 102, icon: Dumbbell, unit: 'kg' },
  { exercise: 'Squats',      goal: 125, icon: TrendingUp, unit: 'kg' },
  { exercise: 'Deadlift',    goal: 143, icon: Target, unit: 'kg' },
  { exercise: 'Pull-ups',    goal: 20,  icon: Award, unit: 'reps' },
  { exercise: 'Running',     goal: 5,   icon: Activity, unit: 'km' },
]

function dayVolume(workouts: DayLog['workouts']): number {
  return workouts.reduce((sum, w) => {
    if (w.type === 'weights' && w.sets) {
      return sum + w.sets.reduce((s, set) => s + set.reps * toKgValue(set.weight, w.unit), 0)
    }
    return sum + (w.energyRating ?? 0) * 15
  }, 0)
}

const AXIS_TICK = { fill: '#A0725A', fontSize: 10, fontFamily: 'Poppins', fontWeight: 700 } as const
const AXIS_LINE = { stroke: 'rgba(160, 114, 90, 0.2)' } as const
const CARD_GRID = { strokeDasharray: '3 3', stroke: 'rgba(160, 114, 90, 0.2)' } as const
const BTN_BASE = { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' } as const

export function WorkoutTab({ onEnterWorkoutMode }: { onEnterWorkoutMode?: () => void } = {}) {
  const {
    cardioMinutes, weeklyCardioMinutes, cardioTarget,
    uploadedImage, selectedExercise, setSelectedExercise,
    trackingMode, setTrackingMode,
    energyRating, setEnergyRating,
    sets, todayWorkouts,
    unit, setUnit,
    showExerciseSelection, setShowExerciseSelection,
    historicalLogs,
    celebration,
    isDirty, save: saveWorkout,
    simulateScreenshot, dismissScreenshot,
    addSet, updateSet,
    logWorkout, logRestDay, logWorkoutDirect, adjustCardio, adjustWorkoutLevel,
    removeWorkout, updateWorkoutEntryAndSave,
    scheduledTime, setScheduledTime,
    scheduledCategories, toggleScheduledCategory,
  } = useHealthData().workout

  // Derived workout/energy levels from actual logged data
  // Workout bar: 20% per exercise logged, capped at 100%
  const derivedWorkoutLevel = useMemo(() => {
    return Math.min(100, todayWorkouts.length * 20)
  }, [todayWorkouts])

  // Energy bar: average of energyRating across all workouts that have one (regardless of type)
  const derivedEnergyLevel = useMemo(() => {
    const rated = todayWorkouts.filter(w => w.energyRating != null && w.energyRating > 0)
    if (rated.length === 0) return 0
    const avg = rated.reduce((s, w) => s + (w.energyRating ?? 0), 0) / rated.length
    return Math.min(100, Math.round((avg / 5) * 100))
  }, [todayWorkouts])

  // All unique exercises ever logged by the user (from last 14 days of history)
  const historicalExercises = useMemo(() => {
    const seen = new Set<string>()
    for (const day of historicalLogs) {
      for (const w of day.workouts) {
        if (w.exercise) seen.add(w.exercise)
      }
    }
    return Array.from(seen)
  }, [historicalLogs])

  // Edit state for today's logged workouts
  const [editingWorkoutIdx, setEditingWorkoutIdx] = useState<number | null>(null)
  const [editingWorkoutData, setEditingWorkoutData] = useState<WorkoutScan | null>(null)

  const openWorkoutEdit = (idx: number) => {
    const w = todayWorkouts[idx]
    setEditingWorkoutData({
      exercise: w.exercise,
      type: w.type === 'energy' ? 'energy' : 'weights',
      sets: w.sets && w.sets.length > 0 ? w.sets : [{ reps: 0, weight: 0 }],
      energyRating: w.energyRating ?? 3,
      unit: w.unit ?? 'kg',
    })
    setEditingWorkoutIdx(idx)
  }

  const [scanEditingIndex, setScanEditingIndex] = useState<number | null>(null)
  const [scanValues, setScanValues] = useState<WorkoutScan[]>([DEFAULT_WORKOUT_SCAN])
  const [scanDescription, setScanDescription] = useState<string | null>(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [micRecording, setMicRecording] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [textInput, setTextInput] = useState('')
  const textInputRef = useRef<HTMLInputElement>(null)

  const [coachMode, setCoachMode] = useState(false)
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([
    { text: 'Log a workout — type anything like "6x30m / 3 mins" or "bench 4x8 80kg".', isUser: false },
  ])
  const [coachInput, setCoachInput] = useState('')
  const [coachThinking, setCoachThinking] = useState(false)
  const coachHistoryRef = useRef<{ role: string; content: string }[]>([])
  const coachEndRef = useRef<HTMLDivElement>(null)
  const [showPlan, setShowPlan] = useState(false)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [selectedWorkoutCategory, setSelectedWorkoutCategory] = useState<string | null>(null)
  const [activeLogCategory, setActiveLogCategory] = useState<string | undefined>(undefined)
  const [customExerciseMode, setCustomExerciseMode] = useState(false)
  const [customExerciseName, setCustomExerciseName] = useState('')
  const [aiPerf, setAiPerf] = useState<{ verdict: string; score: number; bonus: number } | null>(null)
  const [aiPerfLoading, setAiPerfLoading] = useState(false)
  const aiPerfTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleLogWithAIScore = async (category?: string) => {
    if (!selectedExercise) return
    // Capture before logWorkout clears state
    const exerciseName = selectedExercise
    const capturedSets = trackingMode === 'weights' ? sets.map(s => ({ ...s })) : null
    const capturedUnit = trackingMode === 'weights' ? unit : 'kg'
    const capturedEnergy = trackingMode === 'energy' ? energyRating : null

    logWorkout(category)   // fast, instant — clears selectedExercise etc.

    setAiPerfLoading(true)
    if (aiPerfTimerRef.current) clearTimeout(aiPerfTimerRef.current)

    try {
      // Build history string for this exercise (last 3 sessions)
      const exerciseHistory = historicalLogs
        .flatMap(d => d.workouts
          .filter(w => w.exercise === exerciseName)
          .map(w => ({ date: d.date, sets: w.sets, energy: w.energyRating, unit: w.unit }))
        )
        .slice(-3)

      const histStr = exerciseHistory.length > 0
        ? exerciseHistory.map(h =>
            h.sets?.length
              ? `${h.date}: ${h.sets.map(s => `${s.reps}×${s.weight}${unitLabel(h.unit).toLowerCase()}`).join(', ')}`
              : `${h.date}: E${h.energy}/5`
          ).join(' | ')
        : 'first time logging'

      const todayStr = capturedSets?.length
        ? capturedSets.map(s => `${s.reps}×${s.weight}${unitLabel(capturedUnit).toLowerCase()}`).join(', ')
        : `${capturedEnergy}/5 effort`

      // PR detection (no AI needed) — compare in kg so lbs/kg entries are comparable
      let isPR = false
      if (capturedSets?.length && exerciseHistory.length > 0) {
        const todayMax = Math.max(...capturedSets.map(s => toKgValue(s.weight, capturedUnit)))
        const histMax = Math.max(...exerciseHistory.flatMap(h => (h.sets ?? []).map(s => toKgValue(s.weight, h.unit))), 0)
        isPR = todayMax > histMax && histMax > 0
      }

      const raw = await groqText(
        `Exercise: ${exerciseName}
Today: ${todayStr}
History: ${histStr}

Return ONLY valid JSON, no other text:
{"score":1-5,"verdict":"2-4 word label","bonus":0-10}

Rules:
- score 5 = PR or max effort; 4 = above average; 3 = solid; 2 = normal; 1 = low effort
- verdict examples: "NEW PR 🔥", "Max Effort 💪", "Solid Session", "Above Average", "Good Work", "Keep Pushing"
- bonus = extra workout level points: 0 for score 1-2, 3 for score 3, 6 for score 4, 10 for score 5`,
        'You are a terse sports performance analyst. Return ONLY the JSON object asked for.'
      )

      const parsed = parseAIJson<{ bonus?: number; verdict?: string; score?: number }>(raw) ?? {}
      const bonus = Math.min(10, Math.max(0, Number(parsed.bonus) || 0))
      const verdict = isPR ? 'NEW PR 🔥' : (parsed.verdict ?? 'Good Work')
      const score = isPR ? 5 : Math.min(5, Math.max(1, Number(parsed.score) || 3))

      setAiPerf({ verdict, score, bonus })
      if (bonus > 0) adjustWorkoutLevel(bonus)

      aiPerfTimerRef.current = setTimeout(() => setAiPerf(null), 4000)
    } catch {
      // Still show PR if we detected one without AI
      const exerciseHistory = historicalLogs.flatMap(d => d.workouts.filter(w => w.exercise === exerciseName))
      if (capturedSets?.length && exerciseHistory.length > 0) {
        const todayMax = Math.max(...capturedSets.map(s => toKgValue(s.weight, capturedUnit)))
        const histMax = Math.max(...exerciseHistory.flatMap(w => (w.sets ?? []).map(s => toKgValue(s.weight, w.unit))), 0)
        if (todayMax > histMax && histMax > 0) {
          setAiPerf({ verdict: 'NEW PR 🔥', score: 5, bonus: 10 })
          adjustWorkoutLevel(10)
          aiPerfTimerRef.current = setTimeout(() => setAiPerf(null), 4000)
        }
      }
    } finally {
      setAiPerfLoading(false)
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')

  const handleCameraPress = () => {
    setShowMediaMenu(false)
    fileInputRef.current?.click()
  }

  const handleFilesPress = () => {
    setShowMediaMenu(false)
    filesInputRef.current?.click()
  }

  // Camera photos can be 5–10 MB raw; Vercel's body limit is 4.5 MB.
  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 1536
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
      img.src = url
    })

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setScanValues([DEFAULT_WORKOUT_SCAN])
    setScanEditingIndex(null)
    setScanDescription(null)
    setScanLoading(true)
    simulateScreenshot()
    try {
      const { base64, mimeType } = await compressImage(file)
      const raw = await geminiVision(base64, mimeType, `You are a sprint & strength coach. Analyze this workout screenshot and extract ALL exercises. Return ONLY a valid JSON array — no markdown, no explanation.

[
  {
    "exercise": "<exercise name>",
    "type": "<'weights' for structured sets, 'energy' for unstructured>",
    "sets": [{"reps": <number>, "weight": <number>}, ...],
    "energyRating": <1-5, only when type is 'energy', else null>,
    "description": "<exact notation e.g. 'A: 3x60m'>",
    "unit": "<'m' for sprints, 'kg' for weight, '' for bodyweight>"
  }
]

Rules:
- Return ONE item per labelled exercise (A:, B:, C:, or separate exercises)
- SPRINT "NxDISTm": type:"weights", N sets {reps:1,weight:DIST}, exercise:"<DIST>m Sprint", unit:"m"
- WEIGHT "3x12 at 60kg": type:"weights", sets:[{reps:12,weight:60}x3], unit:"kg"
- Bodyweight: weight:0, unit:""
- Unstructured cardio: type:"energy", energyRating 3-5, unit:""
- description: copy exact label+notation (e.g. "A: 3x60m", "B: 8x80m / walk back")
- If nothing clear: [{"exercise":"Workout","type":"energy","sets":[],"energyRating":3,"description":"","unit":""}]`)
      const parsedRaw = parseAIJson(raw)
      if (parsedRaw == null) throw new Error('Could not parse AI response')
      const items = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw]
      setScanValues(items.map((p: Record<string, unknown>) => ({
        exercise: (p.exercise as string) ?? 'Workout',
        type: p.type === 'energy' ? 'energy' : 'weights',
        sets: Array.isArray(p.sets) && (p.sets as unknown[]).length > 0
          ? (p.sets as { reps?: number; weight?: number }[]).map(s => ({ reps: s.reps ?? 0, weight: s.weight ?? 0 }))
          : [{ reps: 0, weight: 0 }],
        energyRating: typeof p.energyRating === 'number' ? p.energyRating : 3,
        unit: (typeof p.unit === 'string' ? p.unit : 'kg') as WeightUnit,
      })))
      setScanDescription(items.map((p: Record<string, unknown>) => p.description).filter(Boolean).join(' · ') || null)
    } catch {
      setScanDescription('AI scan failed — edit details manually')
      setScanValues([DEFAULT_WORKOUT_SCAN])
    } finally {
      setScanLoading(false)
    }
  }

  const handleMicPress = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Microphone not supported on this browser. Try Chrome.')
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognition() as any
    recognition.lang = 'en-US'
    // continuous + interim results so the mic keeps listening through pauses —
    // lets the user dictate multiple exercises with full sets/reps/weight,
    // instead of cutting off after the first short utterance.
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition
    transcriptRef.current = ''

    recognition.onresult = (event: any) => {
      let combined = ''
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript
      }
      transcriptRef.current = combined.trim()
    }

    recognition.onerror = () => { setMicRecording(false); setMicReady(false) }

    recognition.onend = async () => {
      setMicRecording(false)
      setMicReady(false)
      const transcript = transcriptRef.current.trim()
      if (!transcript) return
      setShowMediaMenu(false)
      setScanLoading(true)
      setScanDescription(`"${transcript}"`)
      simulateScreenshot()
      try {
        const raw = await groqText(VOICE_WORKOUT_PROMPT(transcript))
        const parsedRaw = parseAIJson(raw)
        if (parsedRaw == null) throw new Error('Could not parse AI response')
        const items = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw]
        setScanValues(items.map((p: Record<string, unknown>) => ({
          exercise: (p.exercise as string) ?? 'Workout',
          type: p.type === 'energy' ? 'energy' : 'weights',
          sets: Array.isArray(p.sets) && (p.sets as unknown[]).length > 0
            ? (p.sets as { reps?: number; weight?: number }[]).map(s => ({ reps: s.reps ?? 0, weight: s.weight ?? 0 }))
            : [{ reps: 0, weight: 0 }],
          energyRating: typeof p.energyRating === 'number' ? p.energyRating : 3,
          unit: (typeof p.unit === 'string' ? p.unit : 'kg') as WeightUnit,
        })))
        setScanDescription(items.map((p: Record<string, unknown>) => p.description).filter(Boolean).join(' · ') || `"${transcript}"`)
      } catch {
        setScanDescription('Could not parse — edit manually')
      } finally {
        setScanLoading(false)
      }
    }
    setMicReady(true)
  }

  const startMicRecording = () => {
    if (!recognitionRef.current) return
    setMicRecording(true)
    setMicReady(false)
    recognitionRef.current.start()
  }

  const stopMicRecording = () => {
    recognitionRef.current?.stop()
    setMicRecording(false)
  }

  const cancelMic = () => {
    recognitionRef.current?.abort()
    setMicReady(false)
    setMicRecording(false)
    setShowMediaMenu(false)
  }

  const handleTextSubmit = async () => {
    const input = textInput.trim()
    if (!input) return
    setTextMode(false)
    setTextInput('')
    setShowMediaMenu(false)
    setScanLoading(true)
    setScanDescription(`"${input}"`)
    simulateScreenshot()
    try {
      const raw = await groqText(`The user typed: "${input}". Extract ALL exercises as a JSON array — no markdown, no explanation.
[{"exercise":"<name>","type":"<weights|energy>","sets":[{"reps":<n>,"weight":<n>}],"energyRating":<1-5 or null>,"description":"<exact notation>","unit":"<m|kg|>"}]
Rules:
- One item per labelled exercise (A:, B:, C: or separate lines)
- "NxDISTm" → exercise:"<DIST>m Sprint", N sets {reps:1,weight:DIST}, unit:"m"
- "A: 3x60m" → description:"A: 3x60m", exercise:"60m Sprint", 3 sets {reps:1,weight:60}, unit:"m"
- "bench press 4x8 80kg" → exercise:"Bench Press", 4 sets {reps:8,weight:80}, unit:"kg"
- Bodyweight: weight:0, unit:""
- Unstructured cardio: type:"energy", energyRating 3-5`)
      const parsedRaw = parseAIJson(raw)
      if (parsedRaw == null) throw new Error('Could not parse AI response')
      const items = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw]
      setScanValues(items.map((p: Record<string, unknown>) => ({
        exercise: (p.exercise as string) ?? 'Workout',
        type: p.type === 'energy' ? 'energy' : 'weights',
        sets: Array.isArray(p.sets) && (p.sets as unknown[]).length > 0
          ? (p.sets as { reps?: number; weight?: number }[]).map(s => ({ reps: s.reps ?? 0, weight: s.weight ?? 0 }))
          : [{ reps: 0, weight: 0 }],
        energyRating: typeof p.energyRating === 'number' ? p.energyRating : 3,
        unit: (typeof p.unit === 'string' ? p.unit : 'kg') as WeightUnit,
      })))
      setScanDescription(items.map((p: Record<string, unknown>) => p.description).filter(Boolean).join(' · ') || null)
    } catch {
      setScanDescription('Could not parse — edit manually')
    } finally {
      setScanLoading(false)
    }
  }

  const handleCoachSend = async () => {
    const text = coachInput.trim()
    if (!text || coachThinking) return
    setCoachMessages(prev => [...prev, { text, isUser: true }])
    setCoachInput('')
    setCoachThinking(true)
    coachHistoryRef.current.push({ role: 'user', content: text })
    setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    try {
      const snap = healthSnapshot
      const systemPrompt = `You are Summer's AI companion and workout coach. Reply in 1-2 short sentences — be direct and specific. Her data: workout ${snap.workoutLevel ?? '—'}%, energy ${snap.energyLevel ?? '—'}%, water ${snap.waterLiters?.toFixed(1) ?? '—'}L, calories ${snap.calories ?? '—'}, sleep ${snap.sleepHours?.toFixed(1) ?? '—'}h.

When she describes workouts to log, respond with ONLY valid JSON (no markdown):
{"reply":"<message>","workouts":[{"exercise":"<name>","type":"<weights|energy>","sets":[{"reps":<n>,"weight":<n>}],"energyRating":<1-5 or null>,"unit":"<m|kg|>","description":"<label>"}]}

Rules — one item per labelled exercise (A:, B:, or separate):
- "A: 3x60m" → exercise:"60m Sprint", 3 sets {reps:1,weight:60}, unit:"m", description:"A: 3x60m"
- "B: 8x80m / walk back" → exercise:"80m Sprint", 8 sets {reps:1,weight:80}, unit:"m", description:"B: 8x80m / walk back"
- "6x30m / 3 mins" → exercise:"30m Sprint", 6 sets {reps:1,weight:30}, unit:"m"
- "bench press 4x8 80kg" → exercise:"Bench Press", 4 sets {reps:8,weight:80}, unit:"kg"
- "3x12 pull-ups" → exercise:"Pull-ups", 3 sets {reps:12,weight:0}, unit:""
- Vague cardio → type:"energy", energyRating:3-5

For all other messages just reply as plain text.`
      const raw = await groqChat(coachHistoryRef.current, systemPrompt, { temperature: 0.2 })
      coachHistoryRef.current.push({ role: 'assistant', content: raw })
      const parsed = parseAIJson<{ reply?: string; workouts?: WorkoutScan[]; workout?: WorkoutScan }>(raw)
      const msg: CoachMessage = parsed
        ? { text: parsed.reply ?? raw, isUser: false, workouts: parsed.workouts ?? (parsed.workout ? [parsed.workout] : null) }
        : { text: raw, isUser: false, workouts: null }
      setCoachMessages(prev => [...prev, msg])
    } catch {
      setCoachMessages(prev => [...prev, { text: "Couldn't reach AI — try again.", isUser: false }])
    } finally {
      setCoachThinking(false)
      setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  const toEntry = (sv: WorkoutScan): WorkoutEntry => ({
    exercise: sv.exercise || 'Workout',
    type: sv.type,
    time: new Date().toLocaleTimeString(),
    // energy mode: use weight field as per-set energy rating; fall back to energyRating
    ...(sv.type === 'energy'
      ? { energyRating: sv.sets[0]?.weight || sv.energyRating }
      : { sets: sv.sets, unit: sv.unit }),
  })

  const handleLogOne = async (idx: number) => {
    await logWorkoutDirect(toEntry(scanValues[idx]))
    const remaining = scanValues.filter((_, i) => i !== idx)
    if (remaining.length === 0) {
      dismissScreenshot()
      setScanValues([DEFAULT_WORKOUT_SCAN])
      setScanDescription(null)
    } else {
      setScanValues(remaining)
    }
    setScanEditingIndex(null)
  }

  const handleLogAll = async () => {
    for (const sv of scanValues) await logWorkoutDirect(toEntry(sv))
    dismissScreenshot()
    setScanValues([DEFAULT_WORKOUT_SCAN])
    setScanDescription(null)
    setScanEditingIndex(null)
  }

  // Last 7 days for charts
  const last7 = useMemo(() => historicalLogs.slice(-7), [historicalLogs])

  const weeklyVolumeData = useMemo(() =>
    last7.map(d => ({ day: d.dayLabel, volume: Math.round(dayVolume(d.workouts)) })),
  [last7])

  const exerciseHistoryData = useMemo(() => {
    const result: Record<string, { day: string; value: number }[]> = {}
    for (const g of EXERCISE_GOALS) {
      result[g.exercise] = historicalLogs
        .filter(d => d.workouts.some(w => w.exercise === g.exercise))
        .slice(-6)
        .map(d => {
          const sessions = d.workouts.filter(w => w.exercise === g.exercise)
          let val = 0
          for (const w of sessions) {
            if (w.type === 'weights' && w.sets) val = Math.max(val, ...w.sets.map(s => toKgValue(s.weight, w.unit)))
            if (w.type === 'energy' && w.energyRating) val = Math.max(val, w.energyRating)
          }
          return { day: d.dayLabel, value: val }
        })
    }
    return result
  }, [historicalLogs])

  const hasVolumeData = weeklyVolumeData.some(d => d.volume > 0)

  return (
    <div className="p-6 max-w-md mx-auto">
      {/* Header + Enter Workout Mode */}
      <div className="flex items-center justify-between mb-6">
        <div style={{ width: '44px' }} />
        <h2
          className="monument-text"
          style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)', textAlign: 'center', flex: 1 }}
        >
          Workout & Energy
        </h2>
        {onEnterWorkoutMode && (
          <button
            onClick={onEnterWorkoutMode}
            className="monument-button flex items-center justify-center"
            style={{
              width: '44px',
              height: '44px',
              background: 'linear-gradient(135deg,#FF9F66,#FFB88A)',
              borderRadius: '50%',
              border: '2.5px solid #8B5A3E',
              boxShadow: '0 4px 0 rgba(139,90,62,0.25)',
            }}
          >
            <Zap size={20} strokeWidth={2.5} color="#6B4423" />
          </button>
        )}
      </div>

      {celebration && (
        <div
          key={celebration}
          className="celebration-banner monument-text text-center px-4 py-3 mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 159, 102, 0.18) 0%, rgba(255, 184, 138, 0.12) 100%)',
            border: '2px solid rgba(255, 159, 102, 0.35)',
            borderRadius: '12px',
            color: '#6B4423',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '1px',
            boxShadow: '0 0 20px rgba(255, 159, 102, 0.2)',
          }}
        >
          ✦ {celebration} ✦
        </div>
      )}

      {uploadedImage && (
        <div className="monument-card p-4 mb-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                {scanLoading ? 'Analysing...' : 'Does this look right?'}
              </span>
              {scanDescription && !scanLoading && (
                <div className="monument-text mt-0.5" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{scanDescription}</div>
              )}
            </div>
            <button onClick={dismissScreenshot} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
              <X size={14} strokeWidth={2.5} color="#A0725A" />
            </button>
          </div>

          {/* ── Multi-exercise list view (always shown when uploadedImage) ── */}
          <div>
            <div className="space-y-2 mb-3">
              {scanValues.map((sv, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(255,252,248,0.7)', border: '1.5px solid rgba(139,90,62,0.2)', borderRadius: '10px' }}>
                  <div className="flex-1 min-w-0">
                    <div className="monument-text truncate" style={{ color: '#FF9F66', fontSize: '12px', fontWeight: '700' }}>{sv.exercise || 'Workout'}</div>
                    <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>
                      {sv.type === 'weights'
                        ? `${sv.sets.length} sets · ${sv.sets[0]?.reps} reps${sv.sets[0]?.weight ? ` × ${sv.sets[0].weight}${sv.unit ? ' ' + sv.unit : ''}` : ''}`
                        : `Energy: ${sv.energyRating}/5`}
                    </div>
                  </div>
                  <button
                    onClick={() => setScanEditingIndex(idx)}
                    className="monument-button px-2 py-1"
                    style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '7px', border: '1.5px solid #8B5A3E', color: '#8B5A3E', fontSize: '9px', fontWeight: '700', flexShrink: 0 }}
                  >
                    EDIT
                  </button>
                  <button
                    onClick={() => handleLogOne(idx)}
                    className="monument-button px-2 py-1"
                    style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '7px', border: '1.5px solid #8B5A3E', color: '#6B4423', fontSize: '9px', fontWeight: '700', flexShrink: 0 }}
                  >
                    LOG
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleLogAll}
              className="monument-button w-full py-2"
              style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}
            >
              {scanValues.length > 1 ? `✓ LOG ALL (${scanValues.length})` : '✓ LOG WORKOUT'}
            </button>
          </div>
        </div>
      )}

      {/* Level Bars — compact, derived from actual workout data */}
      <div className="monument-card px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Dumbbell size={13} strokeWidth={2.5} color="#FF9F66" />
            <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>WORKOUT</span>
          </div>
          <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{derivedWorkoutLevel}%</span>
        </div>
        <div className="w-full mb-3" style={{ height: 8, background: 'rgba(255,159,102,0.15)', borderRadius: 6, border: '1.5px solid rgba(255,159,102,0.25)' }}>
          <div style={{ width: `${derivedWorkoutLevel}%`, height: '100%', background: 'linear-gradient(90deg,#FF9F66,#FFB88A)', borderRadius: 6, transition: 'width 0.4s ease' }} />
        </div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Zap size={13} strokeWidth={2.5} color="#FFB88A" />
            <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>ENERGY</span>
          </div>
          <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{derivedEnergyLevel}%</span>
        </div>
        <div className="w-full" style={{ height: 8, background: 'rgba(255,184,138,0.15)', borderRadius: 6, border: '1.5px solid rgba(255,184,138,0.25)' }}>
          <div style={{ width: `${derivedEnergyLevel}%`, height: '100%', background: 'linear-gradient(90deg,#FFB88A,#FFD4A8)', borderRadius: 6, transition: 'width 0.4s ease' }} />
        </div>
      </div>

      {/* Today's Workouts Card */}
      <div className="monument-card p-4 mb-4">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Dumbbell size={18} color="#FF9F66" strokeWidth={2.5} />
            <span className="monument-text" style={{ color: '#6B4423', fontSize: '15px', fontWeight: '700' }}>Today</span>
            {(scheduledTime || scheduledCategories.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {scheduledTime && <span className="monument-text px-2 py-0.5" style={{ background: 'rgba(255,159,102,0.12)', border: '1px solid rgba(255,159,102,0.35)', borderRadius: '6px', color: '#E8956A', fontSize: '10px', fontWeight: '700' }}>{scheduledTime}</span>}
                {scheduledCategories.map(c => <span key={c} className="monument-text px-2 py-0.5" style={{ background: 'rgba(139,90,62,0.08)', border: '1px solid rgba(139,90,62,0.2)', borderRadius: '6px', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{c}</span>)}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowPlan(v => !v)}
            className="monument-button px-2.5 py-1"
            style={{ background: 'rgba(255,252,248,0.95)', border: '1.5px solid rgba(139,90,62,0.25)', borderRadius: '8px', color: '#A0725A', fontSize: '10px', fontWeight: '700' }}
          >
            {showPlan ? '▲ plan' : '▼ plan'}
          </button>
        </div>

        {/* Collapsible plan pickers */}
        {showPlan && (
          <div className="mb-3 pb-3" style={{ borderBottom: '1px solid rgba(139,90,62,0.12)' }}>
            <div className="flex gap-2 mb-2">
              {(['Morning', 'Afternoon', 'Evening', 'Night'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setScheduledTime(scheduledTime === t ? null : t)}
                  className="monument-button flex-1 py-1.5"
                  style={{
                    background: scheduledTime === t ? 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)' : 'rgba(255,252,248,0.95)',
                    borderRadius: '8px',
                    border: `1.5px solid ${scheduledTime === t ? '#8B5A3E' : 'rgba(139,90,62,0.25)'}`,
                    color: scheduledTime === t ? '#6B4423' : '#A0725A',
                    fontSize: '10px', fontWeight: '700',
                  }}
                >{t}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([...TRAINING_CATEGORIES.map(c => ({ name: c.name, color: c.color })), { name: 'Rest Day', color: '#9B7FC8' }]).map(({ name, color }) => {
                const active = scheduledCategories.includes(name)
                return (
                  <button
                    key={name}
                    onClick={() => toggleScheduledCategory(name)}
                    className="monument-button px-2.5 py-1"
                    style={{
                      background: active ? color : 'rgba(255,252,248,0.95)',
                      borderRadius: '7px',
                      border: `1.5px solid ${active ? color : 'rgba(139,90,62,0.2)'}`,
                      color: active ? '#fff' : '#A0725A',
                      fontSize: '10px', fontWeight: '700',
                      textShadow: active ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                    }}
                  >{name}</button>
                )
              })}
            </div>
          </div>
        )}

        {/* Logged exercises */}
        {todayWorkouts.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {todayWorkouts.map((w, i) => {
              const cat = TRAINING_CATEGORIES.find(c =>
                w.category === c.name || (c.exercises as readonly string[]).includes(w.exercise)
              )
              const accentColor = cat?.color ?? '#FF9F66'
              const accentBorder = cat?.border ?? '#CC7040'
              const accentShadow = cat?.shadow ?? 'rgba(255,159,102,0.2)'
              const isWeights = w.type === 'weights' && w.sets && w.sets.length > 0
              // Distance entries (km) aren't a weight — they don't contribute to volume
              const totalVol = isWeights && w.unit !== 'km'
                ? w.sets!.reduce((s, set) => s + set.reps * toKgValue(set.weight, w.unit), 0)
                : 0
              return (
                <div key={i} style={{
                  background: 'rgba(255,252,248,0.92)',
                  borderRadius: '16px',
                  border: `1.5px solid ${accentBorder}40`,
                  boxShadow: `0 4px 12px ${accentShadow}, 0 1px 0 rgba(255,255,255,0.8) inset`,
                  overflow: 'hidden',
                }}>
                  {/* Colored top bar */}
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }} />

                  <div className="px-4 pt-3 pb-3">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="monument-text" style={{ color: '#4A2C0F', fontSize: '13px', fontWeight: '800', letterSpacing: '0.3px', lineHeight: 1.2 }}>
                          {w.exercise.toUpperCase()}
                        </div>
                        {cat && (
                          <div className="mt-0.5">
                            <span className="monument-text px-1.5 py-0.5" style={{ background: `${accentColor}18`, borderRadius: '4px', color: accentColor, fontSize: '8px', fontWeight: '700', letterSpacing: '0.5px' }}>
                              {cat.name.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => openWorkoutEdit(i)}
                          className="monument-button px-2.5 py-1.5"
                          style={{ background: `${accentColor}18`, borderRadius: '8px', border: `1.5px solid ${accentBorder}50`, color: accentColor, fontSize: '9px', fontWeight: '800', letterSpacing: '0.4px' }}
                        >EDIT</button>
                        <button onClick={() => removeWorkout(i)} className="monument-button p-1.5" style={{ background: 'rgba(211,47,47,0.08)', borderRadius: '8px', border: '1.5px solid rgba(211,47,47,0.2)' }}>
                          <X size={12} strokeWidth={2.5} color="#D32F2F" />
                        </button>
                      </div>
                    </div>

                    {/* Sets as pills */}
                    {isWeights && (
                      <div className="flex flex-wrap gap-1.5">
                        {w.sets!.map((s, si) => (
                          <span key={si} className="monument-text" style={{
                            background: `${accentColor}14`,
                            border: `1px solid ${accentColor}40`,
                            borderRadius: '8px',
                            padding: '3px 8px',
                            color: '#6B4423',
                            fontSize: '10px',
                            fontWeight: '700',
                          }}>
                            {s.reps}<span style={{ color: '#A0725A', fontWeight: '600' }}>r</span> × {s.weight}<span style={{ color: '#A0725A', fontWeight: '600' }}>{unitLabel(w.unit).toLowerCase()}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Energy rating as dots */}
                    {w.energyRating != null && w.energyRating > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '0.5px' }}>ENERGY</span>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(n => (
                            <div key={n} style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: n <= (w.energyRating ?? 0) ? accentColor : `${accentColor}25`,
                              boxShadow: n <= (w.energyRating ?? 0) ? `0 0 4px ${accentColor}80` : 'none',
                            }} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Volume summary */}
                    {totalVol > 0 && (
                      <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${accentColor}18` }}>
                        <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '0.5px' }}>
                          VOLUME · <span style={{ color: accentColor }}>{totalVol.toLocaleString()} kg</span>
                          {'  '}·{'  '}{w.sets!.length} SET{w.sets!.length !== 1 ? 'S' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {scheduledTime && scheduledCategories.length > 0 ? (
          /* ── Inline add-exercise panel (time + type selected) ── */
          <div className="mt-1">
            <div className="flex items-center gap-2 mb-2">
              <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.15)' }} />
              <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>ADD EXERCISE</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.15)' }} />
            </div>

            {/* Custom exercise input */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Custom exercise name..."
                value={customExerciseName}
                onChange={e => setCustomExerciseName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && customExerciseName.trim()) {
                    setSelectedExercise(customExerciseName.trim())
                    setActiveLogCategory(undefined)
                    setCustomExerciseName('')
                  }
                }}
                className="flex-1 px-3 monument-text"
                style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '10px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.15)' }}
              />
              <button
                onClick={() => {
                  if (!customExerciseName.trim()) return
                  setSelectedExercise(customExerciseName.trim())
                  setActiveLogCategory(undefined)
                  setCustomExerciseName('')
                }}
                className="monument-button px-3"
                style={{ height: 40, background: customExerciseName.trim() ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(200,190,180,0.4)', borderRadius: '10px', border: `2px solid ${customExerciseName.trim() ? '#8B5A3E' : 'rgba(139,90,62,0.2)'}`, color: customExerciseName.trim() ? '#6B4423' : '#A0725A', fontSize: '11px', fontWeight: '700', boxShadow: customExerciseName.trim() ? '0 2px 0 rgba(139,90,62,0.2)' : 'none' }}
              >ADD</button>
            </div>

            {/* Quick-add from selected categories */}
            {(() => {
              const allExercises = scheduledCategories.flatMap(catName => {
                const cat = TRAINING_CATEGORIES.find(c => c.name === catName)
                return cat ? [...cat.exercises] : []
              }).filter((e, i, arr) => arr.indexOf(e) === i)

              const prev = allExercises.filter(e => historicalExercises.includes(e))
              const rest = allExercises.filter(e => !historicalExercises.includes(e))

              // The planned category this exercise was listed under — user-picked, not guessed
              const plannedCategoryFor = (exercise: string) =>
                scheduledCategories.find(catName => {
                  const cat = TRAINING_CATEGORIES.find(c => c.name === catName)
                  return cat ? (cat.exercises as readonly string[]).includes(exercise) : false
                })

              if (allExercises.length === 0) return null

              return (
                <div className="flex flex-col gap-1.5" style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {prev.length > 0 && (
                    <div className="monument-text mb-0.5" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>PREVIOUSLY LOGGED</div>
                  )}
                  {prev.map(exercise => {
                    const cat = TRAINING_CATEGORIES.find(c => (c.exercises as readonly string[]).includes(exercise))
                    return (
                      <button key={exercise} onClick={() => { setSelectedExercise(exercise); setActiveLogCategory(plannedCategoryFor(exercise)) }}
                        className="monument-button w-full flex items-center gap-2 px-3 py-2 flex-shrink-0"
                        style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '9px', border: `1.5px solid ${cat?.border ?? 'rgba(255,159,102,0.4)'}`, textAlign: 'left' }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cat?.color ?? '#FF9F66' }} />
                        <span className="monument-text flex-1" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                        <span style={{ color: '#A0725A', fontSize: '13px', fontWeight: '700' }}>›</span>
                      </button>
                    )
                  })}
                  {rest.length > 0 && prev.length > 0 && (
                    <div className="monument-text mt-1 mb-0.5" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>
                      ALL {scheduledCategories.join(' / ').toUpperCase()}
                    </div>
                  )}
                  {rest.map(exercise => (
                    <button key={exercise} onClick={() => { setSelectedExercise(exercise); setActiveLogCategory(plannedCategoryFor(exercise)) }}
                      className="monument-button w-full flex items-center gap-2 px-3 py-2 flex-shrink-0"
                      style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '1.5px solid rgba(139,90,62,0.18)', textAlign: 'left' }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'rgba(139,90,62,0.3)' }} />
                      <span className="monument-text flex-1" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                      <span style={{ color: '#A0725A', fontSize: '13px', fontWeight: '700' }}>›</span>
                    </button>
                  ))}
                </div>
              )
            })()}

            <button
              onClick={() => { setShowExerciseSelection(true); setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
              className="monument-button w-full mt-2 py-2"
              style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '1.5px solid rgba(139,90,62,0.25)', color: '#A0725A', fontSize: '10px', fontWeight: '700' }}
            >BROWSE ALL EXERCISES</button>
          </div>
        ) : (
          <button
            onClick={() => { setShowExerciseSelection(true); setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
            className="monument-button w-full py-2"
            style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '12px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}
          >
            + ADD EXERCISE
          </button>
        )}
      </div>

      {/* Cardio */}
      <div className="monument-card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={15} strokeWidth={2.5} color="#FFD4A8" />
          <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Cardio</span>
          <span className="monument-text ml-auto" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>this week · {weeklyCardioMinutes}/{CARDIO_MAX_MINUTES} min</span>
        </div>
        <div className="flex gap-2 items-center mb-1">
          <button onClick={() => adjustCardio(-10)} className="monument-button p-2" style={BTN_BASE}>
            <Minus size={16} strokeWidth={2.5} color="#6B4423" />
          </button>
          <input
            type="number" min={0} max={CARDIO_MAX_MINUTES} step={10}
            value={cardioMinutes}
            onChange={e => adjustCardio((Math.min(CARDIO_MAX_MINUTES, Math.max(0, parseInt(e.target.value) || 0))) - cardioMinutes)}
            className="flex-1 px-3 py-2 monument-text"
            style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '10px', color: '#6B4423', fontSize: '14px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)', textAlign: 'center' }}
          />
          <button onClick={() => adjustCardio(10)} className="monument-button p-2" style={BTN_BASE}>
            <Plus size={16} strokeWidth={2.5} color="#6B4423" />
          </button>
        </div>
        <div className="monument-text mb-2" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', textAlign: 'center' }}>today's minutes</div>
        <PixelBar label="WEEK" value={weeklyCardioMinutes} max={CARDIO_MAX_MINUTES} target={cardioTarget} color="#FFD4A8" unit="min" />
      </div>

      {/* Charts */}
      <div className="monument-card p-4 mb-4">
        <div className="monument-text mb-3" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>Weekly Volume</div>
        {hasVolumeData ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={weeklyVolumeData}>
              <CartesianGrid {...CARD_GRID} />
              <XAxis dataKey="day" tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} />
              <Bar dataKey="volume" fill="#FF9F66" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="monument-text text-center py-6" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>Log workouts to see your volume</div>
        )}
      </div>

      {/* Exercise Logging Modal */}
      {selectedExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(107, 68, 35, 0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedExercise(null)}>
          <div className="monument-card p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>{selectedExercise}</div>
              <button onClick={() => setSelectedExercise(null)} className="monument-button" style={{ ...BTN_BASE, color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
            </div>

            <div className="flex gap-2 mb-4">
              {(['energy', 'weights'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setTrackingMode(mode)}
                  className="monument-button flex-1 py-2"
                  style={{ background: trackingMode === mode ? 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)' : 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: trackingMode === mode ? '#6B4423' : '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
                >
                  {mode === 'energy' ? 'ENERGY ONLY' : 'WEIGHTS'}
                </button>
              ))}
            </div>

            {trackingMode === 'energy' ? (
              <div className="mb-4">
                <div className="monument-text mb-3 text-center" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>How did you feel? (1-5)</div>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map(r => (
                    <button
                      key={r}
                      onClick={() => setEnergyRating(r)}
                      className="monument-button w-12 h-12"
                      style={{ background: energyRating === r ? 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)' : 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: energyRating === r ? '#6B4423' : '#8B5A3E', fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex items-center justify-end gap-2 mb-2">
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>UNIT</span>
                  <button
                    onClick={() => setUnit(toggleKgLbs(unit))}
                    className="monument-button px-3 py-1"
                    style={{ background: 'rgba(255, 252, 248, 0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}
                  >
                    {unitLabel(unit)}
                  </button>
                </div>
                {sets.map((set, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>SET {i + 1}</label>
                    </div>
                    <div>
                      <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>REPS</label>
                      <input
                        type="number" inputMode="numeric" min={0}
                        value={set.reps === 0 ? '' : set.reps}
                        placeholder="0"
                        onChange={e => updateSet(i, 'reps', Math.max(0, parseInt(e.target.value) || 0))}
                        onFocus={e => e.target.select()}
                        className="w-full px-2 py-1 monument-text"
                        style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', textAlign: 'center' }}
                      />
                    </div>
                    <div>
                      <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>{unitLabel(unit)}</label>
                      <input
                        type="number" inputMode="decimal" min={0}
                        value={set.weight === 0 ? '' : set.weight}
                        placeholder="0"
                        onChange={e => updateSet(i, 'weight', Math.max(0, parseFloat(e.target.value) || 0))}
                        onFocus={e => e.target.select()}
                        className="w-full px-2 py-1 monument-text"
                        style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', textAlign: 'center' }}
                      />
                    </div>
                  </div>
                ))}
                <button onClick={addSet} className="monument-button w-full py-2 mb-3" style={{ background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                  + ADD SET
                </button>
              </div>
            )}

            <button
              onClick={() => handleLogWithAIScore(activeLogCategory)}
              className="monument-button w-full mb-2 py-3"
              style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '12px', border: '3px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', color: '#6B4423', fontSize: '11px', fontWeight: '700' }}
            >
              LOG WORKOUT
            </button>

            {/* AI Performance Insight */}
            {(aiPerfLoading || aiPerf) && (
              <div
                className="mb-4 px-4 py-3 flex items-center gap-3"
                style={{
                  background: aiPerf?.score === 5
                    ? 'linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,159,102,0.15))'
                    : aiPerf?.score === 4
                    ? 'linear-gradient(135deg, rgba(255,159,102,0.15), rgba(255,184,138,0.15))'
                    : 'rgba(255,252,248,0.8)',
                  borderRadius: '12px',
                  border: `2px solid ${aiPerf?.score === 5 ? '#FF6B6B' : aiPerf?.score === 4 ? '#FF9F66' : 'rgba(139,90,62,0.2)'}`,
                  boxShadow: aiPerf?.score === 5 ? '0 0 16px rgba(255,107,107,0.25)' : 'none',
                }}
              >
                {aiPerfLoading ? (
                  <>
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full soft-pulse" style={{ background: '#FF9F66', animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                    <span className="monument-text" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>Analysing your performance...</span>
                  </>
                ) : aiPerf ? (
                  <>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < aiPerf.score ? (aiPerf.score === 5 ? '#FF6B6B' : '#FF9F66') : 'rgba(139,90,62,0.2)' }} />
                      ))}
                    </div>
                    <span className="monument-text flex-1" style={{ color: aiPerf.score === 5 ? '#CC3333' : '#6B4423', fontSize: '11px', fontWeight: '700' }}>
                      {aiPerf.verdict}
                    </span>
                    {aiPerf.bonus > 0 && (
                      <span className="monument-text px-2 py-0.5" style={{ background: 'rgba(255,159,102,0.2)', border: '1px solid #FF9F66', borderRadius: '6px', color: '#FF9F66', fontSize: '9px', fontWeight: '700' }}>
                        +{aiPerf.bonus} LVL
                      </span>
                    )}
                  </>
                ) : null}
              </div>
            )}

            {exerciseHistoryData[selectedExercise]?.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={exerciseHistoryData[selectedExercise]}>
                  <CartesianGrid {...CARD_GRID} />
                  <XAxis dataKey="day" tick={AXIS_TICK} axisLine={AXIS_LINE} />
                  <YAxis tick={AXIS_TICK} axisLine={AXIS_LINE} />
                  <Line type="monotone" dataKey="value" stroke="#FF9F66" strokeWidth={3} dot={{ fill: '#FF9F66', r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="monument-text text-center py-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>No history yet — log this exercise to see progress</div>
            )}
          </div>
        </div>
      )}

      {/* ── Edit Workout Modal ── */}
      {editingWorkoutIdx !== null && editingWorkoutData && (() => {
        const ed = editingWorkoutData
        const dismiss = () => { setEditingWorkoutIdx(null); setEditingWorkoutData(null) }
        const updateSets = (newSets: WorkoutSet[]) => setEditingWorkoutData(prev => prev ? { ...prev, sets: newSets } : prev)
        const cycleEditUnit = () => setEditingWorkoutData(prev => prev ? { ...prev, unit: toggleKgLbs(prev.unit) } : prev)

        const handleSave = async () => {
          const entry: WorkoutEntry = {
            exercise: ed.exercise,
            type: 'weights',
            time: todayWorkouts[editingWorkoutIdx]?.time ?? new Date().toLocaleTimeString(),
            sets: ed.sets,
            unit: ed.unit,
            energyRating: ed.energyRating ?? 3,
          }
          const idx = editingWorkoutIdx
          dismiss()
          await updateWorkoutEntryAndSave(idx, entry)
        }

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
            style={{ background: 'rgba(107,68,35,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={dismiss}>
            <div className="monument-card w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
              style={{ padding: '24px 20px 20px' }}
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="monument-text" style={{ color: '#6B4423', fontSize: '15px', fontWeight: '700', letterSpacing: '0.5px' }}>
                  EDIT {ed.exercise.toUpperCase()}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={cycleEditUnit}
                    className="monument-button px-3"
                    style={{ height: 40, background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>
                    {unitLabel(ed.unit)}
                  </button>
                  <button onClick={dismiss}
                    className="monument-button"
                    style={{ width: 40, height: 40, borderRadius: '12px', background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}>
                    ×
                  </button>
                </div>
              </div>

              {/* Scrollable area — sets + energy, always both */}
              <div className="overflow-y-auto flex-1">
                {/* Sets / Reps */}
                {ed.sets.map((s, si) => (
                  <div key={si} className="flex items-center gap-3 mb-4">
                    <div className="monument-text flex-shrink-0" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700', width: 44 }}>SET {si + 1}</div>
                    <div className="flex-1">
                      <div className="monument-text mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>REPS</div>
                      <input
                        type="number" inputMode="numeric" min={0} placeholder="0"
                        value={s.reps === 0 ? '' : s.reps}
                        onChange={e => updateSets(ed.sets.map((x, xi) => xi === si ? { ...x, reps: Math.max(0, parseInt(e.target.value) || 0) } : x))}
                        onFocus={e => e.target.select()}
                        className="w-full monument-text"
                        style={{ height: 56, background: '#fff', border: '2px solid #C49A6C', borderRadius: '12px', color: '#6B4423', fontSize: '18px', fontWeight: '700', textAlign: 'center', boxShadow: '0 3px 0 rgba(139,90,62,0.15)' }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="monument-text mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>WEIGHT ({unitLabel(ed.unit)})</div>
                      <input
                        type="number" inputMode="decimal" min={0} placeholder="0"
                        value={s.weight === 0 ? '' : s.weight}
                        onChange={e => updateSets(ed.sets.map((x, xi) => xi === si ? { ...x, weight: Math.max(0, parseFloat(e.target.value) || 0) } : x))}
                        onFocus={e => e.target.select()}
                        className="w-full monument-text"
                        style={{ height: 56, background: '#fff', border: '2px solid #C49A6C', borderRadius: '12px', color: '#6B4423', fontSize: '18px', fontWeight: '700', textAlign: 'center', boxShadow: '0 3px 0 rgba(139,90,62,0.15)' }}
                      />
                    </div>
                    <button onClick={() => ed.sets.length > 1 && updateSets(ed.sets.filter((_, xi) => xi !== si))}
                      style={{ background: 'none', border: 'none', cursor: ed.sets.length > 1 ? 'pointer' : 'default', padding: '4px', flexShrink: 0 }}>
                      <X size={16} strokeWidth={2.5} color={ed.sets.length > 1 ? '#A0725A' : 'transparent'} />
                    </button>
                  </div>
                ))}

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.15)' }} />
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>ENERGY LEVEL (1-5)</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.15)' }} />
                </div>

                {/* Energy buttons */}
                <div className="flex gap-3 justify-center mb-2">
                  {[1, 2, 3, 4, 5].map(v => {
                    const active = (ed.energyRating ?? 3) === v
                    return (
                      <button key={v}
                        onClick={() => setEditingWorkoutData(prev => prev ? { ...prev, energyRating: v } : prev)}
                        className="monument-button"
                        style={{ flex: 1, height: 56, borderRadius: '14px', background: active ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : '#fff', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '20px', fontWeight: '700', boxShadow: active ? '0 4px 0 rgba(139,90,62,0.25)' : '0 3px 0 rgba(139,90,62,0.15)' }}>
                        {v}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex-shrink-0 mt-3">
                <button
                  onClick={() => updateSets([...ed.sets, { reps: ed.sets[ed.sets.length - 1]?.reps ?? 0, weight: ed.sets[ed.sets.length - 1]?.weight ?? 0 }])}
                  className="monument-button w-full mb-3"
                  style={{ height: 52, background: '#fff', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)', letterSpacing: '0.5px' }}
                >+ ADD SET</button>
                <button onClick={handleSave} className="monument-button w-full"
                  style={{ height: 56, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '13px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', letterSpacing: '0.5px' }}
                >SAVE CHANGES</button>
              </div>

            </div>
          </div>
        )
      })()}

      {/* Exercise Selection Modal — two-step: category → exercise */}
      {/* Exercise Selection Modal */}
      {showExerciseSelection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(107, 68, 35, 0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => { setShowExerciseSelection(false); setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
        >
          <div className="monument-card p-6 max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex justify-between items-center mb-5 flex-shrink-0">
              <div className="flex items-center gap-2">
                {(selectedWorkoutCategory || customExerciseMode) && (
                  <button
                    onClick={() => { setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
                    className="monument-button p-1.5"
                    style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 2px 0 rgba(139,90,62,0.2)' }}
                  >
                    <span style={{ color: '#8B5A3E', fontSize: '14px', fontWeight: '700', lineHeight: 1 }}>‹</span>
                  </button>
                )}
                <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}>
                  {customExerciseMode ? 'CUSTOM EXERCISE' : selectedWorkoutCategory ? selectedWorkoutCategory.toUpperCase() : 'SELECT EXERCISE'}
                </div>
              </div>
              <button
                onClick={() => { setShowExerciseSelection(false); setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
                className="monument-button"
                style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '16px', fontWeight: '700', width: '36px', height: '36px', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}
              >×</button>
            </div>

            {/* ── Custom Exercise flow ── */}
            {customExerciseMode && (
              <div className="flex flex-col flex-1">
                <div className="monument-text mb-2" style={{ color: '#6B4423', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px' }}>EXERCISE NAME</div>
                <input
                  type="text"
                  placeholder="Enter exercise name..."
                  value={customExerciseName}
                  onChange={e => setCustomExerciseName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customExerciseName.trim()) {
                      setSelectedExercise(customExerciseName.trim())
                      setShowExerciseSelection(false)
                      setCustomExerciseMode(false)
                      setCustomExerciseName('')
                    }
                  }}
                  className="w-full px-4 monument-text mb-6"
                  style={{ height: 52, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '14px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}
                  autoFocus
                />
                <div className="flex gap-3 mt-auto">
                  <button
                    onClick={() => { setCustomExerciseMode(false); setCustomExerciseName('') }}
                    className="monument-button flex-1"
                    style={{ height: 48, background: 'rgba(255,252,248,0.95)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}
                  >BACK</button>
                  <button
                    onClick={() => {
                      if (!customExerciseName.trim()) return
                      setSelectedExercise(customExerciseName.trim())
                      setShowExerciseSelection(false)
                      setCustomExerciseMode(false)
                      setCustomExerciseName('')
                    }}
                    className="monument-button flex-1"
                    style={{ height: 48, background: customExerciseName.trim() ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(200,190,180,0.4)', borderRadius: '12px', border: `2px solid ${customExerciseName.trim() ? '#8B5A3E' : 'rgba(139,90,62,0.2)'}`, color: customExerciseName.trim() ? '#6B4423' : '#A0725A', fontSize: '12px', fontWeight: '700', boxShadow: customExerciseName.trim() ? '0 3px 0 rgba(139,90,62,0.25)' : 'none' }}
                  >CONTINUE</button>
                </div>
              </div>
            )}

            {/* ── Step 1: Select Exercise home screen ── */}
            {!customExerciseMode && !selectedWorkoutCategory && (
              <div className="flex flex-col gap-3 overflow-y-auto flex-1">
                {/* Create custom button */}
                <button
                  onClick={() => setCustomExerciseMode(true)}
                  className="monument-button w-full flex-shrink-0"
                  style={{ height: 54, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                >
                  + CREATE CUSTOM EXERCISE
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.2)' }} />
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1px' }}>OR SELECT FROM LIST</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.2)' }} />
                </div>

                {/* Category grid */}
                {[...TRAINING_CATEGORIES, { name: 'Rest Day', color: '#9B7FC8', gradient: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', border: '#7A5FA8', shadow: 'rgba(155,127,200,0.3)', exercises: [] as readonly string[] }].map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedWorkoutCategory(cat.name)}
                    className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0"
                    style={{ background: cat.gradient, borderRadius: '12px', border: `2px solid ${cat.border}`, boxShadow: `0 4px 0 ${cat.shadow}` }}
                  >
                    <span className="monument-text" style={{ color: '#fff', fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', textShadow: '0 1px 4px rgba(0,0,0,0.25)', flex: 1, textAlign: 'left' }}>{cat.name}</span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: '700' }}>
                      {cat.exercises.length > 0 ? `${cat.exercises.length} exercises ›` : '›'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Step 2: Exercise list filtered by history ── */}
            {!customExerciseMode && selectedWorkoutCategory && (() => {
              const isRestDay = selectedWorkoutCategory === 'Rest Day'
              const cat = TRAINING_CATEGORIES.find(c => c.name === selectedWorkoutCategory)
              const pick = (exercise: string) => {
                setSelectedExercise(exercise)
                setActiveLogCategory(selectedWorkoutCategory)
                setShowExerciseSelection(false)
                setSelectedWorkoutCategory(null)
              }
              const catExercises = cat ? (cat.exercises as readonly string[]) : []
              const borderColor = cat?.border ?? '#7A5FA8'
              const shadowColor = cat?.shadow ?? 'rgba(155,127,200,0.3)'
              const dotColor = cat?.color ?? '#9B7FC8'

              // TODAY's logged exercises for this category (by stored category OR name match)
              const todayForCat = isRestDay
                ? todayWorkouts
                    .filter(w => w.category === 'Rest Day')
                    .map(w => w.exercise)
                    .filter((e, i, arr) => arr.indexOf(e) === i)
                : todayWorkouts
                    .filter(w => w.category === selectedWorkoutCategory || catExercises.includes(w.exercise))
                    .map(w => w.exercise)
                    .filter((e, i, arr) => arr.indexOf(e) === i)

              // All historical exercises (not today) — show full personal history
              const todaySet = new Set(todayWorkouts.map(w => w.exercise))
              const histForCat = isRestDay
                ? historicalLogs
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .flatMap(d => d.workouts.map(w => w.exercise))
                    .filter(e => !todaySet.has(e))
                    .filter((e, i, arr) => arr.indexOf(e) === i)
                : historicalLogs
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .flatMap(d => d.workouts
                      .filter(w => w.category === selectedWorkoutCategory || catExercises.includes(w.exercise))
                      .map(w => w.exercise))
                    .filter(e => !todaySet.has(e))
                    .filter((e, i, arr) => arr.indexOf(e) === i)

              // Standard category exercises not yet in history (pure suggestions)
              const doneNames = new Set([...todayForCat, ...histForCat])
              const remaining = cat
                ? cat.exercises.filter(e => !doneNames.has(e))
                : []

              return (
                <div className="flex flex-col gap-2 overflow-y-auto flex-1">
                  {/* Logged today */}
                  {todayForCat.length > 0 && (
                    <>
                      <div className="monument-text px-1 pb-0.5 flex-shrink-0" style={{ color: dotColor, fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>✓ LOGGED TODAY</div>
                      {todayForCat.map(exercise => (
                        <button key={exercise} onClick={() => pick(exercise)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0"
                          style={{ background: `${dotColor}18`, borderRadius: '10px', border: `2px solid ${borderColor}`, boxShadow: `0 3px 0 ${shadowColor}` }}>
                          <span style={{ color: dotColor, fontSize: '13px', fontWeight: '900' }}>✓</span>
                          <span className="monument-text flex-1 text-left" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                          <span style={{ color: dotColor, fontSize: '14px', fontWeight: '700' }}>+</span>
                        </button>
                      ))}
                    </>
                  )}
                  {/* Previously done (not today) */}
                  {histForCat.length > 0 && (
                    <>
                      <div className="monument-text px-1 pb-0.5 flex-shrink-0" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', marginTop: todayForCat.length > 0 ? 4 : 0 }}>YOUR PREVIOUS WORKOUTS</div>
                      {histForCat.map(exercise => (
                        <button key={exercise} onClick={() => pick(exercise)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0"
                          style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: `1.5px solid ${borderColor}`, boxShadow: `0 2px 0 ${shadowColor}` }}>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                          <span className="monument-text flex-1 text-left" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                          <span style={{ color: dotColor, fontSize: '14px', fontWeight: '700' }}>›</span>
                        </button>
                      ))}
                    </>
                  )}
                  {/* Remaining exercises not yet done */}
                  {remaining.length > 0 && (
                    <>
                      {(todayForCat.length > 0 || histForCat.length > 0) && (
                        <div className="monument-text px-1 pb-0.5 flex-shrink-0" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', marginTop: 4 }}>SUGGESTIONS</div>
                      )}
                      {remaining.map(exercise => (
                        <button key={exercise} onClick={() => pick(exercise)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0"
                          style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '1.5px solid rgba(139,90,62,0.2)', boxShadow: '0 2px 0 rgba(139,90,62,0.1)' }}>
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'rgba(139,90,62,0.3)' }} />
                          <span className="monument-text flex-1 text-left" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                          <span style={{ color: '#A0725A', fontSize: '14px', fontWeight: '700' }}>›</span>
                        </button>
                      ))}
                    </>
                  )}
                  {/* Rest Day: quick "mark rest day" button + exercise history */}
                  {isRestDay && (
                    <>
                      <button
                        onClick={() => { logRestDay(); setShowExerciseSelection(false); setSelectedWorkoutCategory(null) }}
                        className="monument-button w-full flex items-center justify-center gap-2 py-3 flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', borderRadius: '12px', border: '2px solid #7A5FA8', color: '#fff', fontSize: '11px', fontWeight: '700', boxShadow: '0 4px 0 rgba(155,127,200,0.3)' }}
                      >
                        <Moon size={14} strokeWidth={2.5} color="#fff" /> LOG REST DAY ONLY
                      </button>
                      {histForCat.length === 0 && todayForCat.length === 0 && (
                        <div className="monument-text text-center py-4 flex-shrink-0" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
                          Log some workouts first and they'll appear here for quick re-logging on rest days.
                        </div>
                      )}
                    </>
                  )}
                  {!isRestDay && todayForCat.length === 0 && histForCat.length === 0 && remaining.length === 0 && (
                    <div className="monument-text text-center py-8" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>No exercises found for this category</div>
                  )}
                </div>
              )
            })()}

          </div>
        </div>
      )}

      {/* ── Scan Edit Modal — bottom sheet, always on screen ── */}
      {scanEditingIndex !== null && scanValues[scanEditingIndex] && (() => {
        const sv = scanValues[scanEditingIndex]
        const idx = scanEditingIndex
        const update = (patch: Partial<WorkoutScan>) =>
          setScanValues(prev => prev.map((v, i) => i === idx ? { ...v, ...patch } : v))
        const updateSet = (si: number, patch: Partial<WorkoutSet>) =>
          update({ sets: sv.sets.map((s, i) => i === si ? { ...s, ...patch } : s) })
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end" style={{ background: 'rgba(107,68,35,0.6)', backdropFilter: 'blur(6px)' }} onClick={() => setScanEditingIndex(null)}>
            <div
              className="monument-card w-full flex flex-col"
              style={{ borderRadius: '20px 20px 0 0', maxHeight: '82vh', padding: '20px 16px 28px' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="mx-auto mb-3 flex-shrink-0" style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(139,90,62,0.25)' }} />

              {/* Exercise name row */}
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <input
                  type="text"
                  value={sv.exercise}
                  onChange={e => update({ exercise: e.target.value })}
                  className="flex-1 px-3 monument-text"
                  style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '10px', color: '#6B4423', fontSize: '13px', fontWeight: '700', height: 40, boxShadow: '0 2px 0 rgba(139,90,62,0.15)' }}
                />
                <button onClick={() => setScanEditingIndex(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <X size={18} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>

              {/* Type toggle */}
              <div className="flex gap-2 mb-3 flex-shrink-0">
                {(['weights', 'energy'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => update({ type: t })}
                    className="monument-button flex-1"
                    style={{ height: 34, background: sv.type === t ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '2px solid #8B5A3E', color: sv.type === t ? '#6B4423' : '#8B5A3E', fontSize: '10px', fontWeight: '700' }}
                  >
                    {t === 'weights' ? 'WEIGHTS / REPS' : 'ENERGY LEVEL'}
                  </button>
                ))}
              </div>

              {/* Unit toggle */}
              {sv.type === 'weights' && (
                <div className="flex items-center justify-end gap-2 mb-3 flex-shrink-0">
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>UNIT</span>
                  <button
                    onClick={() => update({ unit: toggleKgLbs(sv.unit) })}
                    className="monument-button px-3 py-1"
                    style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}
                  >
                    {unitLabel(sv.unit)}
                  </button>
                </div>
              )}

              {/* Content — scrolls only if many sets */}
              <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                {sv.type === 'weights' ? (
                  <div>
                    {sv.sets.map((set, i) => (
                      <div key={i} className="mb-3">
                        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          <div>
                            <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>SET {i + 1}</label>
                            <div className="flex items-center justify-start h-10">
                              {sv.sets.length > 1 && (
                                <button
                                  onClick={() => update({ sets: sv.sets.filter((_, si) => si !== i) })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                >
                                  <X size={14} strokeWidth={2.5} color="#A0725A" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>REPS</label>
                            <input
                              type="number" inputMode="numeric" min={0}
                              placeholder="0"
                              value={set.reps === 0 ? '' : set.reps}
                              onChange={e => updateSet(i, { reps: Math.max(0, parseInt(e.target.value) || 0) })}
                              onFocus={e => e.target.select()}
                              className="w-full monument-text"
                              style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                            />
                          </div>
                          <div>
                            <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>{unitLabel(sv.unit)}</label>
                            <input
                              type="number" inputMode="decimal" min={0}
                              placeholder="0"
                              value={set.weight === 0 ? '' : set.weight}
                              onChange={e => updateSet(i, { weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                              onFocus={e => e.target.select()}
                              className="w-full monument-text"
                              style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    <button
                      onClick={() => update({ sets: [...sv.sets, { reps: 0, weight: 0 }] })}
                      className="monument-button w-full mb-2"
                      style={{ height: 38, background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                    >
                      + ADD SET
                    </button>
                  </div>
                ) : (
                  <div>
                    {sv.sets.map((set, i) => (
                      <div key={i} className="mb-3">
                        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          <div>
                            <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>SET {i + 1}</label>
                            <div className="flex items-center h-10">
                              {sv.sets.length > 1 && (
                                <button
                                  onClick={() => update({ sets: sv.sets.filter((_, si) => si !== i) })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                                >
                                  <X size={14} strokeWidth={2.5} color="#A0725A" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>REPS</label>
                            <input
                              type="number" inputMode="numeric" min={0}
                              placeholder="0"
                              value={set.reps === 0 ? '' : set.reps}
                              onChange={e => updateSet(i, { reps: Math.max(0, parseInt(e.target.value) || 0) })}
                              onFocus={e => e.target.select()}
                              className="w-full monument-text"
                              style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                            />
                          </div>
                          <div>
                            <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>ENERGY</label>
                            <input
                              type="number" inputMode="numeric" min={1} max={5}
                              placeholder="1–5"
                              value={set.weight === 0 ? '' : set.weight}
                              onChange={e => updateSet(i, { weight: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                              onFocus={e => e.target.select()}
                              className="w-full monument-text"
                              style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => update({ sets: [...sv.sets, { reps: 0, weight: 0 }] })}
                      className="monument-button w-full mb-2"
                      style={{ height: 38, background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}
                    >
                      + ADD SET
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons — always pinned at bottom */}
              <div className="flex gap-2 mt-3 flex-shrink-0">
                <button
                  onClick={() => setScanEditingIndex(null)}
                  className="monument-button"
                  style={{ flex: 1, height: 46, background: 'rgba(255,252,248,0.95)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}
                >
                  DONE
                </button>
                <button
                  onClick={() => handleLogOne(idx)}
                  className="monument-button"
                  style={{ flex: 2, height: 46, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}
                >
                  ✓ LOG THIS
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Floating save button */}
      {isDirty && (
        <button
          onClick={saveWorkout}
          className="fixed z-50 monument-button flex items-center gap-1.5 px-3 py-2"
          style={{
            bottom: '96px',
            left: '24px',
            background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
            borderRadius: '20px',
            border: '2.5px solid #8B5A3E',
            boxShadow: '0 4px 0 rgba(139, 90, 62, 0.3), 0 0 16px rgba(255, 184, 138, 0.35)',
            color: '#6B4423',
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.5px',
          }}
        >
          <Check size={13} strokeWidth={3} color="#6B4423" />
          <span className="monument-text">SAVE</span>
        </button>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={filesInputRef} type="file" accept="image/*,application/pdf,text/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Drop-up media menu */}
      {showMediaMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { if (!micReady && !micRecording && !textMode && !coachMode) setShowMediaMenu(false) }} />
          <div className="fixed z-50 flex flex-col gap-2 items-end" style={{ bottom: '176px', right: '16px' }}>

            {coachMode ? (
              /* AI Companion panel */
              <div className="monument-card flex flex-col" style={{ width: 'min(calc(100vw - 32px), 360px)', height: '420px' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b-2" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 cozy-glow" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '50%', border: '2px solid #8B5A3E' }}>
                      <MessageCircle size={18} strokeWidth={2.5} color="#6B4423" />
                    </div>
                    <div>
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>AI Companion</div>
                      <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Always here to help!</div>
                    </div>
                  </div>
                  <button onClick={() => setCoachMode(false)} className="monument-button" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'rgba(255, 252, 248, 0.3)' }}>
                  {coachMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%]">
                        <div className="monument-card px-4 py-3" style={{ background: msg.isUser ? 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)' : 'rgba(255, 252, 248, 0.95)', border: `2px solid ${msg.isUser ? '#8B5A3E' : '#A0725A'}`, boxShadow: msg.isUser ? '0 4px 0 rgba(139, 90, 62, 0.25)' : '0 2px 0 rgba(160, 114, 90, 0.2)' }}>
                          <div className="monument-text" style={{ color: msg.isUser ? '#6B4423' : '#8B5A3E', fontSize: '11px', fontWeight: '700', lineHeight: '1.6' }}>{msg.text}</div>
                        </div>
                        {msg.workouts && msg.workouts.length > 0 && (
                          <div className="mt-1.5 space-y-1.5">
                            {msg.workouts.map((w, wi) => (
                              <div key={wi} className="px-3 py-2" style={{ background: 'rgba(255,159,102,0.08)', border: '1.5px solid rgba(255,159,102,0.3)', borderRadius: '10px' }}>
                                <div className="monument-text mb-0.5" style={{ color: '#FF9F66', fontSize: '10px', fontWeight: '700' }}>{w.exercise}</div>
                                <div className="monument-text mb-2" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>
                                  {w.type === 'weights'
                                    ? `${w.sets.length} sets · ${w.sets[0]?.reps} reps${w.sets[0]?.weight ? ` × ${w.sets[0].weight}${w.unit ? ' ' + w.unit : ''}` : ''}`
                                    : `Energy: ${w.energyRating}/5`}
                                </div>
                                <button
                                  onClick={() => {
                                    const entry: WorkoutEntry = {
                                      exercise: w.exercise,
                                      type: w.type,
                                      time: new Date().toLocaleTimeString(),
                                      ...(w.type === 'energy' ? { energyRating: w.energyRating } : { sets: w.sets, unit: w.unit }),
                                    }
                                    logWorkoutDirect(entry)
                                    setCoachMessages(prev => [...prev, { text: `✓ Logged ${w.exercise}`, isUser: false }])
                                    setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
                                  }}
                                  className="monument-button w-full py-1.5"
                                  style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.25)' }}
                                >
                                  ✓ LOG THIS
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {coachThinking && (
                    <div className="flex justify-start">
                      <div className="monument-card px-4 py-3" style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #A0725A', boxShadow: '0 2px 0 rgba(160, 114, 90, 0.2)' }}>
                        <div className="monument-text soft-pulse" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>thinking...</div>
                      </div>
                    </div>
                  )}
                  <div ref={coachEndRef} />
                </div>
                <div className="p-4 border-t-2" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={coachInput}
                      onChange={e => setCoachInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !coachThinking && handleCoachSend()}
                      placeholder="Type a message..."
                      autoFocus
                      className="flex-1 px-4 py-3 monument-text"
                      style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', outline: 'none' }}
                    />
                    <button onClick={handleCoachSend} disabled={coachThinking} className="monument-button p-3 cozy-glow" style={{ background: coachThinking ? 'rgba(255, 184, 138, 0.4)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '12px', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255, 184, 138, 0.15), 0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                      <Send size={20} strokeWidth={2.5} color="#6B4423" />
                    </button>
                  </div>
                </div>
              </div>
            ) : textMode ? (
              /* Text input mode */
              <div
                className="flex items-center gap-2 px-3 py-2.5 monument-button"
                style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)', minWidth: '260px' }}
              >
                <input
                  ref={textInputRef}
                  type="text"
                  placeholder="e.g. 6x30m / 3 mins rest"
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                  autoFocus
                  className="flex-1 monument-text"
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#6B4423', fontSize: '11px', fontWeight: '700' }}
                />
                <button
                  onClick={handleTextSubmit}
                  className="monument-button px-3 py-1.5"
                  style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.2)', flexShrink: 0 }}
                >
                  LOG
                </button>
                <button onClick={() => { setTextMode(false); setTextInput('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                  <X size={14} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
            ) : (micReady || micRecording) ? (
              /* Mic mode */
              <div
                className="flex items-center gap-3 px-4 py-3 monument-button"
                style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)' }}
              >
                {micRecording && (
                  <div className="soft-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E05A4E', flexShrink: 0 }} />
                )}
                <span className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>
                  {micRecording ? 'Recording...' : 'Tap to start'}
                </span>
                {micReady && !micRecording && (
                  <button onClick={startMicRecording} className="monument-button px-4 py-1.5" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.2)' }}>START</button>
                )}
                {micRecording && (
                  <button onClick={stopMicRecording} className="monument-button px-4 py-1.5" style={{ background: '#E05A4E', borderRadius: '10px', border: '2px solid #C04040', color: '#fff', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(180,40,40,0.3)' }}>STOP</button>
                )}
                <button onClick={cancelMic} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                  <X size={14} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
            ) : (
              /* Normal menu */
              <>
                {([
                  { label: 'AI Companion', icon: null as null, onClick: () => setCoachMode(true) },
                  { label: 'Camera', icon: Camera as React.ElementType | null, onClick: handleCameraPress },
                  { label: 'Microphone', icon: Mic as React.ElementType | null, onClick: handleMicPress },
                  { label: 'Files', icon: FolderOpen as React.ElementType | null, onClick: handleFilesPress },
                ]).map(({ label, icon: Icon, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="monument-button flex items-center gap-3 px-4 py-3"
                    style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)' }}
                  >
                    <span className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{label}</span>
                    <div className="p-1.5 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', width: '28px', height: '28px' }}>
                      {Icon ? <Icon size={16} strokeWidth={2.5} color="#6B4423" /> : <MessageCircle size={14} strokeWidth={2.5} color="#6B4423" />}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Floating Arrow FAB */}
      <button
        onClick={() => setShowMediaMenu(v => !v)}
        className="fixed bottom-24 right-6 p-4 soft-pulse monument-button"
        style={{
          background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
          borderRadius: '50%',
          border: '3px solid #8B5A3E',
          boxShadow: '0 0 20px rgba(255, 184, 138, 0.4), 0 6px 0 rgba(139, 90, 62, 0.3)',
          zIndex: 40,
          transform: showMediaMenu ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <ChevronUp size={28} strokeWidth={2.5} color="#6B4423" />
      </button>
    </div>
  )
}
