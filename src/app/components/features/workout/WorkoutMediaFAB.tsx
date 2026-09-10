import React, { useState, useRef } from 'react'
import { Camera, Mic, FolderOpen, MessageCircle, Send, ChevronUp, X } from 'lucide-react'
import { groqText, groqChat, parseAIJson } from '@/lib/groq'
import { geminiVision } from '@/lib/gemini'
import { healthSnapshot } from '@/store/healthSnapshot'
import type { WorkoutEntry, WorkoutSet, WeightUnit } from '@/types'
import { toggleSetsUnit, unitLabel } from '@/lib/units'

interface WorkoutScan {
  exercise: string
  type: 'weights' | 'energy'
  sets: WorkoutSet[]
  energyRating: number
  unit: WeightUnit
  description?: string
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

interface Props {
  logWorkoutDirect: (entry: WorkoutEntry) => Promise<void>
}

export function WorkoutMediaFAB({ logWorkoutDirect }: Props) {
  const [showScanCard, setShowScanCard] = useState(false)
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
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')

  const parseItems = (raw: string): WorkoutScan[] => {
    const parsedRaw = parseAIJson(raw)
    if (parsedRaw == null) throw new Error('Could not parse AI response')
    const items = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw]
    return items.map((p: Record<string, unknown>) => ({
      exercise: (p.exercise as string) ?? 'Workout',
      type: p.type === 'energy' ? 'energy' : 'weights',
      sets: Array.isArray(p.sets) && (p.sets as unknown[]).length > 0
        ? (p.sets as { reps?: number; weight?: number }[]).map(s => ({ reps: s.reps ?? 0, weight: s.weight ?? 0 }))
        : [{ reps: 0, weight: 0 }],
      energyRating: typeof p.energyRating === 'number' ? p.energyRating : 3,
      unit: (typeof p.unit === 'string' ? p.unit : 'kg') as WeightUnit,
      description: typeof p.description === 'string' ? p.description : undefined,
    }))
  }

  const toEntry = (sv: WorkoutScan): WorkoutEntry => ({
    exercise: sv.exercise || 'Workout',
    type: sv.type,
    time: new Date().toLocaleTimeString(),
    ...(sv.type === 'energy'
      ? { energyRating: sv.sets[0]?.weight || sv.energyRating }
      : { sets: sv.sets, unit: sv.unit }),
  })

  const handleLogOne = async (idx: number) => {
    await logWorkoutDirect(toEntry(scanValues[idx]))
    const remaining = scanValues.filter((_, i) => i !== idx)
    if (remaining.length === 0) {
      setShowScanCard(false)
      setScanValues([DEFAULT_WORKOUT_SCAN])
      setScanDescription(null)
    } else {
      setScanValues(remaining)
    }
    setScanEditingIndex(null)
  }

  const handleLogAll = async () => {
    for (const sv of scanValues) await logWorkoutDirect(toEntry(sv))
    setShowScanCard(false)
    setScanValues([DEFAULT_WORKOUT_SCAN])
    setScanDescription(null)
    setScanEditingIndex(null)
  }

  // Resize + compress image to ≤1024px JPEG before sending to the API.
  // Camera photos can be 5–10 MB raw; Vercel's body limit is 4.5 MB.
  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        const MAX = 1024
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
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
    setShowScanCard(true)
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
      const items = parseItems(raw)
      setScanValues(items)
      setScanDescription(items.map((p: WorkoutScan) => p.exercise).filter(Boolean).join(' · ') || null)
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      setShowScanCard(true)
      try {
        const raw = await groqText(VOICE_WORKOUT_PROMPT(transcript))
        const items = parseItems(raw)
        setScanValues(items)
        setScanDescription(items.map((p: WorkoutScan) => p.description).filter(Boolean).join(' · ') || `"${transcript}"`)
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
    setShowScanCard(true)
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
      const items = parseItems(raw)
      setScanValues(items)
      setScanDescription(items.map((p: WorkoutScan) => p.description).filter(Boolean).join(' · ') || null)
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
      let msg: CoachMessage
      const parsed = parseAIJson<{ reply?: string; workouts?: WorkoutScan[]; workout?: WorkoutScan }>(raw)
      if (parsed) {
        const wArr = parsed.workouts ?? (parsed.workout ? [parsed.workout] : null)
        msg = { text: parsed.reply ?? raw, isUser: false, workouts: wArr }
      } else {
        msg = { text: raw, isUser: false, workouts: null }
      }
      setCoachMessages(prev => [...prev, msg])
    } catch {
      setCoachMessages(prev => [...prev, { text: "Couldn't reach AI — try again.", isUser: false }])
    } finally {
      setCoachThinking(false)
      setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }

  return (
    <>
      {/* Scan card — fixed overlay */}
      {showScanCard && (
        <div className="fixed z-[45]" style={{ top: '72px', left: '50%', transform: 'translateX(-50%)', width: 'min(calc(100vw - 48px), 420px)' }}>
          <div className="monument-card p-4">
            <div className="flex justify-between items-center mb-3">
              <div>
                <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                  {scanLoading ? 'Analysing...' : 'Does this look right?'}
                </span>
                {scanDescription && !scanLoading && (
                  <div className="monument-text mt-0.5" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{scanDescription}</div>
                )}
              </div>
              <button
                onClick={() => { setShowScanCard(false); setScanValues([DEFAULT_WORKOUT_SCAN]); setScanDescription(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
              >
                <X size={14} strokeWidth={2.5} color="#A0725A" />
              </button>
            </div>
            <div className="space-y-2 mb-3">
              {scanValues.map((sv, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2"
                  style={{ background: 'rgba(255,252,248,0.7)', border: '1.5px solid rgba(139,90,62,0.2)', borderRadius: '10px' }}>
                  <div className="flex-1 min-w-0">
                    <div className="monument-text truncate" style={{ color: '#FF9F66', fontSize: '12px', fontWeight: '700' }}>{sv.exercise || 'Workout'}</div>
                    <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>
                      {sv.type === 'weights'
                        ? `${sv.sets.length} sets · ${sv.sets[0]?.reps} reps${sv.sets[0]?.weight ? ` × ${sv.sets[0].weight}${sv.unit ? ' ' + sv.unit : ''}` : ''}`
                        : `Energy: ${sv.energyRating}/5`}
                    </div>
                  </div>
                  <button onClick={() => setScanEditingIndex(idx)} className="monument-button px-2 py-1"
                    style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '7px', border: '1.5px solid #8B5A3E', color: '#8B5A3E', fontSize: '9px', fontWeight: '700', flexShrink: 0 }}>
                    EDIT
                  </button>
                  <button onClick={() => handleLogOne(idx)} className="monument-button px-2 py-1"
                    style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '7px', border: '1.5px solid #8B5A3E', color: '#6B4423', fontSize: '9px', fontWeight: '700', flexShrink: 0 }}>
                    LOG
                  </button>
                </div>
              ))}
            </div>
            <button onClick={handleLogAll} className="monument-button w-full py-2"
              style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}>
              {scanValues.length > 1 ? `✓ LOG ALL (${scanValues.length})` : '✓ LOG WORKOUT'}
            </button>
          </div>
        </div>
      )}

      {/* Scan edit bottom sheet */}
      {scanEditingIndex !== null && scanValues[scanEditingIndex] && (() => {
        const sv = scanValues[scanEditingIndex]
        const idx = scanEditingIndex
        const update = (patch: Partial<WorkoutScan>) =>
          setScanValues(prev => prev.map((v, i) => i === idx ? { ...v, ...patch } : v))
        const updateSetField = (si: number, patch: Partial<WorkoutSet>) =>
          update({ sets: sv.sets.map((s, i) => i === si ? { ...s, ...patch } : s) })
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ background: 'rgba(107,68,35,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setScanEditingIndex(null)}>
            <div className="monument-card w-full flex flex-col"
              style={{ borderRadius: '20px 20px 0 0', maxHeight: '82vh', padding: '20px 16px 28px' }}
              onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-3 flex-shrink-0" style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(139,90,62,0.25)' }} />
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <input type="text" value={sv.exercise} onChange={e => update({ exercise: e.target.value })}
                  className="flex-1 px-3 monument-text"
                  style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '10px', color: '#6B4423', fontSize: '13px', fontWeight: '700', height: 40, boxShadow: '0 2px 0 rgba(139,90,62,0.15)' }} />
                <button onClick={() => setScanEditingIndex(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <X size={18} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
              <div className="flex gap-2 mb-3 flex-shrink-0">
                {(['weights', 'energy'] as const).map(t => (
                  <button key={t} onClick={() => update({ type: t })} className="monument-button flex-1"
                    style={{ height: 34, background: sv.type === t ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '2px solid #8B5A3E', color: sv.type === t ? '#6B4423' : '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
                    {t === 'weights' ? 'WEIGHTS / REPS' : 'ENERGY LEVEL'}
                  </button>
                ))}
              </div>
              {sv.type === 'weights' && (
                <div className="flex items-center justify-end gap-2 mb-3 flex-shrink-0">
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>UNIT</span>
                  <button
                    onClick={() => update(toggleSetsUnit(sv.sets, sv.unit))}
                    className="monument-button px-3 py-1"
                    style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}
                  >
                    {unitLabel(sv.unit)}
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                {sv.sets.map((set, i) => (
                  <div key={i} className="mb-3">
                    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                      <div>
                        <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>SET {i + 1}</label>
                        <div className="flex items-center justify-start h-10">
                          {sv.sets.length > 1 && (
                            <button onClick={() => update({ sets: sv.sets.filter((_, si) => si !== i) })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                              <X size={14} strokeWidth={2.5} color="#A0725A" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>REPS</label>
                        <input type="number" inputMode="numeric" min={0} placeholder="0"
                          value={set.reps === 0 ? '' : set.reps}
                          onChange={e => updateSetField(i, { reps: Math.max(0, parseInt(e.target.value) || 0) })}
                          onFocus={e => e.target.select()} className="w-full monument-text"
                          style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }} />
                      </div>
                      <div>
                        <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>
                          {unitLabel(sv.unit)}
                        </label>
                        <input type="number" inputMode="decimal" min={0} placeholder="0"
                          value={set.weight === 0 ? '' : set.weight}
                          onChange={e => updateSetField(i, { weight: Math.max(0, parseFloat(e.target.value) || 0) })}
                          onFocus={e => e.target.select()} className="w-full monument-text"
                          style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => update({ sets: [...sv.sets, { reps: 0, weight: 0 }] })}
                  className="monument-button w-full mb-2"
                  style={{ height: 38, background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}>
                  + ADD SET
                </button>
              </div>
              <div className="flex gap-2 mt-3 flex-shrink-0">
                <button onClick={() => setScanEditingIndex(null)} className="monument-button"
                  style={{ flex: 1, height: 46, background: 'rgba(255,252,248,0.95)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}>
                  DONE
                </button>
                <button onClick={() => handleLogOne(idx)} className="monument-button"
                  style={{ flex: 2, height: 46, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' }}>
                  ✓ LOG THIS
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Drop-up media menu */}
      {showMediaMenu && (
        <>
          <div className="fixed inset-0 z-40"
            onClick={() => { if (!micReady && !micRecording && !textMode && !coachMode) setShowMediaMenu(false) }} />
          <div className="fixed z-50 flex flex-col gap-2 items-end" style={{ bottom: '176px', right: '16px' }}>
            {coachMode ? (
              <div className="monument-card flex flex-col" style={{ width: 'min(calc(100vw - 32px), 360px)', height: '420px' }}
                onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b-2" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 cozy-glow" style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '50%', border: '2px solid #8B5A3E' }}>
                      <MessageCircle size={18} strokeWidth={2.5} color="#6B4423" />
                    </div>
                    <div>
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>AI Companion</div>
                      <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Always here to help!</div>
                    </div>
                  </div>
                  <button onClick={() => setCoachMode(false)} className="monument-button"
                    style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'rgba(255,252,248,0.3)' }}>
                  {coachMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%]">
                        <div className="monument-card px-4 py-3"
                          style={{ background: msg.isUser ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', border: `2px solid ${msg.isUser ? '#8B5A3E' : '#A0725A'}`, boxShadow: msg.isUser ? '0 4px 0 rgba(139,90,62,0.25)' : '0 2px 0 rgba(160,114,90,0.2)' }}>
                          <div className="monument-text" style={{ color: msg.isUser ? '#6B4423' : '#8B5A3E', fontSize: '11px', fontWeight: '700', lineHeight: '1.6' }}>{msg.text}</div>
                        </div>
                        {msg.workouts && msg.workouts.length > 0 && (
                          <div className="mt-1.5 space-y-1.5">
                            {msg.workouts.map((w, wi) => (
                              <div key={wi} className="px-3 py-2"
                                style={{ background: 'rgba(255,159,102,0.08)', border: '1.5px solid rgba(255,159,102,0.3)', borderRadius: '10px' }}>
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
                                  style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.25)' }}>
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
                      <div className="monument-card px-4 py-3" style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #A0725A', boxShadow: '0 2px 0 rgba(160,114,90,0.2)' }}>
                        <div className="monument-text soft-pulse" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>thinking...</div>
                      </div>
                    </div>
                  )}
                  <div ref={coachEndRef} />
                </div>
                <div className="p-4 border-t-2" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex gap-2">
                    <input type="text" value={coachInput} onChange={e => setCoachInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !coachThinking && handleCoachSend()}
                      placeholder="Type a message..." autoFocus className="flex-1 px-4 py-3 monument-text"
                      style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', outline: 'none' }} />
                    <button onClick={handleCoachSend} disabled={coachThinking} className="monument-button p-3 cozy-glow"
                      style={{ background: coachThinking ? 'rgba(255,184,138,0.4)' : 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '12px', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255,184,138,0.15),0 4px 0 rgba(139,90,62,0.25)' }}>
                      <Send size={20} strokeWidth={2.5} color="#6B4423" />
                    </button>
                  </div>
                </div>
              </div>
            ) : textMode ? (
              <div className="flex items-center gap-2 px-3 py-2.5 monument-button"
                style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)', minWidth: '260px' }}>
                <input ref={textInputRef} type="text" placeholder="e.g. 6x30m / 3 mins rest"
                  value={textInput} onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()} autoFocus
                  className="flex-1 monument-text"
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#6B4423', fontSize: '11px', fontWeight: '700' }} />
                <button onClick={handleTextSubmit} className="monument-button px-3 py-1.5"
                  style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.2)', flexShrink: 0 }}>
                  LOG
                </button>
                <button onClick={() => { setTextMode(false); setTextInput('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                  <X size={14} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
            ) : (micReady || micRecording) ? (
              <div className="flex items-center gap-3 px-4 py-3 monument-button"
                style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)' }}>
                {micRecording && <div className="soft-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E05A4E', flexShrink: 0 }} />}
                <span className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>
                  {micRecording ? 'Recording...' : 'Tap to start'}
                </span>
                {micReady && !micRecording && (
                  <button onClick={startMicRecording} className="monument-button px-4 py-1.5"
                    style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.2)' }}>
                    START
                  </button>
                )}
                {micRecording && (
                  <button onClick={stopMicRecording} className="monument-button px-4 py-1.5"
                    style={{ background: '#E05A4E', borderRadius: '10px', border: '2px solid #C04040', color: '#fff', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(180,40,40,0.3)' }}>
                    STOP
                  </button>
                )}
                <button onClick={cancelMic} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
                  <X size={14} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
            ) : (
              <>
                {([
                  { label: 'AI Companion', icon: null as null, onClick: () => setCoachMode(true) },
                  { label: 'Camera', icon: Camera as React.ElementType | null, onClick: () => { setShowMediaMenu(false); fileInputRef.current?.click() } },
                  { label: 'Microphone', icon: Mic as React.ElementType | null, onClick: handleMicPress },
                  { label: 'Files', icon: FolderOpen as React.ElementType | null, onClick: () => { setShowMediaMenu(false); filesInputRef.current?.click() } },
                ] as const).map(({ label, icon: Icon, onClick }) => (
                  <button key={label} onClick={onClick}
                    className="monument-button flex items-center gap-3 px-4 py-3"
                    style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)' }}>
                    <span className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{label}</span>
                    <div className="p-1.5 flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '8px', border: '2px solid #8B5A3E', width: '28px', height: '28px' }}>
                      {Icon ? <Icon size={16} strokeWidth={2.5} color="#6B4423" /> : <MessageCircle size={14} strokeWidth={2.5} color="#6B4423" />}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={filesInputRef} type="file" accept="image/*,application/pdf,text/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Floating FAB */}
      <button
        onClick={() => setShowMediaMenu(v => !v)}
        className="fixed bottom-24 right-6 p-4 soft-pulse monument-button"
        style={{
          background: 'linear-gradient(135deg,#FF9F66,#FFB88A)',
          borderRadius: '50%',
          border: '3px solid #8B5A3E',
          boxShadow: '0 0 20px rgba(255,184,138,0.4),0 6px 0 rgba(139,90,62,0.3)',
          zIndex: 40,
          transform: showMediaMenu ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <ChevronUp size={28} strokeWidth={2.5} color="#6B4423" />
      </button>
    </>
  )
}
