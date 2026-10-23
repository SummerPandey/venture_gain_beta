import React, { useState, useRef, useEffect } from 'react'
import { Camera, Mic, FolderOpen, MessageCircle, Send, ChevronUp, X } from 'lucide-react'
import { groqText, groqChat, parseAIJson } from '@/lib/groq'
import { geminiVision } from '@/lib/gemini'
import { healthSnapshot } from '@/store/healthSnapshot'
import type { WorkoutEntry, WorkoutSet } from '@/types'
import { toggleSetsUnit, unitLabel } from '@/lib/units'
import { useArithmeticField } from '@/hooks/useArithmeticField'
import {
  type WorkoutScan, DEFAULT_WORKOUT_SCAN, MAX_COACH_INPUT,
  parseScanItems, normalizeScanItem, scanToEntry, isLoggableScan, describeScan,
  trimHistory, micErrorMessage, compressImage, isDistanceUnit,
} from './workoutScan'

interface CoachMessage {
  text: string
  isUser: boolean
  workouts?: WorkoutScan[] | null
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

const ICON_BTN: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
const CHIP_BTN: React.CSSProperties = { borderRadius: '8px', border: '1.5px solid #8B5A3E', fontSize: '10px', fontWeight: '700', flexShrink: 0, minHeight: 36, padding: '0 12px' }
const disabledStyle = (disabled: boolean): React.CSSProperties => (disabled ? { opacity: 0.45, pointerEvents: 'none' } : {})

interface Props {
  logWorkoutDirect: (entry: WorkoutEntry) => Promise<boolean | void>
  logWorkoutBatch?: (entries: WorkoutEntry[]) => Promise<boolean | void>
}

export function WorkoutMediaFAB({ logWorkoutDirect, logWorkoutBatch }: Props) {
  const [showScanCard, setShowScanCard] = useState(false)
  const [scanEditingIndex, setScanEditingIndex] = useState<number | null>(null)
  const [scanValues, setScanValues] = useState<WorkoutScan[]>([DEFAULT_WORKOUT_SCAN])
  const [scanDescription, setScanDescription] = useState<string | null>(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [savingScan, setSavingScan] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const { fieldProps: arithField } = useArithmeticField()
  const [micRecording, setMicRecording] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
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
  const coachSendingRef = useRef(false)
  // Coach cards already logged ("msgIdx-workoutIdx"), so LOG THIS can't double-log
  const [loggedCoachCards, setLoggedCoachCards] = useState<Set<string>>(new Set())
  const loggingCoachRef = useRef<Set<string>>(new Set())
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')
  const micCancelledRef = useRef(false)
  const micStartingRef = useRef(false)
  // Each scan (photo / voice / text) gets an id; only the latest one may write results.
  const scanReqRef = useRef(0)
  const savingRef = useRef(false)
  const textSubmittingRef = useRef(false)
  const mountedRef = useRef(true)
  const scanValuesRef = useRef(scanValues)
  scanValuesRef.current = scanValues

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Leaving Workout Mode mid-recording must turn the microphone off.
      micCancelledRef.current = true
      try { recognitionRef.current?.abort() } catch { /* already stopped */ }
    }
  }, [])

  useEffect(() => {
    if (!micError) return
    const t = setTimeout(() => setMicError(null), 4000)
    return () => clearTimeout(t)
  }, [micError])

  /** Starts a new scan and returns its id; anything still in flight becomes stale. */
  const beginScan = (description: string | null) => {
    const id = ++scanReqRef.current
    setScanValues([DEFAULT_WORKOUT_SCAN])
    setScanEditingIndex(null)
    setScanDescription(description)
    setScanLoading(true)
    setShowScanCard(true)
    return id
  }
  const isCurrentScan = (id: number) => mountedRef.current && id === scanReqRef.current

  const closeScanCard = () => {
    scanReqRef.current++ // discard any result still on its way
    setShowScanCard(false)
    setScanLoading(false)
    setScanValues([DEFAULT_WORKOUT_SCAN])
    setScanDescription(null)
    setScanEditingIndex(null)
  }

  const handleLogOne = async (idx: number) => {
    const sv = scanValuesRef.current[idx]
    if (!sv || savingRef.current || scanLoading || !isLoggableScan(sv)) return
    savingRef.current = true
    setSavingScan(true)
    const reqId = scanReqRef.current
    try {
      const ok = await logWorkoutDirect(scanToEntry(sv))
      if (ok === false || !mountedRef.current || reqId !== scanReqRef.current) return
      // Remove by identity from the latest list, so edits made to other rows during the save survive.
      const remaining = scanValuesRef.current.filter(v => v !== sv)
      if (remaining.length === 0) closeScanCard()
      else { setScanValues(remaining); setScanEditingIndex(null) }
    } finally {
      savingRef.current = false
      if (mountedRef.current) setSavingScan(false)
    }
  }

  const handleLogAll = async () => {
    if (savingRef.current || scanLoading) return
    const toLog = scanValuesRef.current.filter(isLoggableScan)
    if (toLog.length === 0) return
    savingRef.current = true
    setSavingScan(true)
    const reqId = scanReqRef.current
    try {
      const entries = toLog.map(sv => scanToEntry(sv))
      const ok = logWorkoutBatch
        ? await logWorkoutBatch(entries)
        : await (async () => { for (const e of entries) if ((await logWorkoutDirect(e)) === false) return false; return true })()
      if (ok === false || !mountedRef.current || reqId !== scanReqRef.current) return
      closeScanCard()
    } finally {
      savingRef.current = false
      if (mountedRef.current) setSavingScan(false)
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const id = beginScan(null)
    try {
      const { base64, mimeType } = await compressImage(file, 1024, 0.82)
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
      const items = parseScanItems(parseAIJson(raw))
      if (!isCurrentScan(id)) return
      setScanValues(items)
      setScanDescription(items.map(p => p.exercise).filter(Boolean).join(' · ') || null)
    } catch (err) {
      if (!isCurrentScan(id)) return
      const msg = err instanceof Error && err.message.startsWith('Only images') ? err.message : 'AI scan failed — edit details manually'
      setScanDescription(msg)
      setScanValues([DEFAULT_WORKOUT_SCAN])
    } finally {
      if (isCurrentScan(id)) setScanLoading(false)
    }
  }

  const runTextScan = async (input: string, prompt: string, fallbackDescription: string | null) => {
    const id = beginScan(`"${input.slice(0, 80)}${input.length > 80 ? '…' : ''}"`)
    try {
      const raw = await groqText(prompt)
      const items = parseScanItems(parseAIJson(raw))
      if (!isCurrentScan(id)) return
      setScanValues(items)
      setScanDescription(items.map(p => p.description).filter(Boolean).join(' · ') || fallbackDescription)
    } catch {
      if (!isCurrentScan(id)) return
      setScanValues([DEFAULT_WORKOUT_SCAN])
      setScanDescription('Could not parse — edit manually')
    } finally {
      if (isCurrentScan(id)) setScanLoading(false)
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
    micCancelledRef.current = false
    micStartingRef.current = false
    setMicError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let combined = ''
      for (let i = 0; i < event.results.length; i++) {
        combined += event.results[i][0].transcript
      }
      transcriptRef.current = combined.trim()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (!mountedRef.current) return
      setMicRecording(false)
      setMicReady(false)
      if (event?.error !== 'aborted') setMicError(micErrorMessage(event?.error))
      // 'no-speech' etc. — don't send a half-heard transcript
      if (event?.error !== 'no-speech') micCancelledRef.current = true
    }

    recognition.onend = () => {
      micStartingRef.current = false
      if (!mountedRef.current) return
      setMicRecording(false)
      setMicReady(false)
      const transcript = transcriptRef.current.trim()
      transcriptRef.current = ''
      if (micCancelledRef.current || !transcript) return
      setShowMediaMenu(false)
      runTextScan(transcript, VOICE_WORKOUT_PROMPT(transcript), `"${transcript.slice(0, 80)}"`)
    }
    setMicReady(true)
  }

  const startMicRecording = () => {
    if (!recognitionRef.current || micStartingRef.current) return
    micStartingRef.current = true
    try {
      recognitionRef.current.start()
      setMicRecording(true)
      setMicReady(false)
    } catch {
      micStartingRef.current = false
      setMicError('Microphone is busy — try again.')
    }
  }

  const stopMicRecording = () => {
    recognitionRef.current?.stop()
    setMicRecording(false)
  }

  const cancelMic = () => {
    // abort() still fires onend — the flag stops it from submitting what was heard.
    micCancelledRef.current = true
    transcriptRef.current = ''
    try { recognitionRef.current?.abort() } catch { /* not started */ }
    setMicReady(false)
    setMicRecording(false)
    setShowMediaMenu(false)
  }

  const handleTextSubmit = async () => {
    const input = textInput.trim()
    if (!input || textSubmittingRef.current) return
    textSubmittingRef.current = true
    setTextMode(false)
    setTextInput('')
    setShowMediaMenu(false)
    try {
      await runTextScan(input, `The user typed: "${input}". Extract ALL exercises as a JSON array — no markdown, no explanation.
[{"exercise":"<name>","type":"<weights|energy>","sets":[{"reps":<n>,"weight":<n>}],"energyRating":<1-5 or null>,"description":"<exact notation>","unit":"<m|kg|>"}]
Rules:
- One item per labelled exercise (A:, B:, C: or separate lines)
- "NxDISTm" → exercise:"<DIST>m Sprint", N sets {reps:1,weight:DIST}, unit:"m"
- "A: 3x60m" → description:"A: 3x60m", exercise:"60m Sprint", 3 sets {reps:1,weight:60}, unit:"m"
- "bench press 4x8 80kg" → exercise:"Bench Press", 4 sets {reps:8,weight:80}, unit:"kg"
- Bodyweight: weight:0, unit:""
- Unstructured cardio: type:"energy", energyRating 3-5`, null)
    } finally {
      textSubmittingRef.current = false
    }
  }

  const scrollCoach = () => setTimeout(() => coachEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

  const handleCoachSend = async () => {
    const text = coachInput.trim().slice(0, MAX_COACH_INPUT)
    if (!text || coachSendingRef.current) return
    coachSendingRef.current = true
    setCoachMessages(prev => [...prev, { text, isUser: true }])
    setCoachInput('')
    setCoachThinking(true)
    const userTurn = { role: 'user', content: text }
    coachHistoryRef.current = trimHistory([...coachHistoryRef.current, userTurn])
    scrollCoach()
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
      if (!raw.trim()) throw new Error('Empty AI reply')
      coachHistoryRef.current = trimHistory([...coachHistoryRef.current, { role: 'assistant', content: raw }])
      const parsed = parseAIJson<{ reply?: unknown; workouts?: unknown; workout?: unknown }>(raw)
      let msg: CoachMessage
      if (parsed && typeof parsed === 'object') {
        const wArr = Array.isArray(parsed.workouts) ? parsed.workouts : parsed.workout ? [parsed.workout] : []
        const workouts = wArr.map(normalizeScanItem).filter((w): w is WorkoutScan => w !== null)
        msg = { text: typeof parsed.reply === 'string' ? parsed.reply : (workouts.length ? 'Here’s what I got:' : raw), isUser: false, workouts: workouts.length ? workouts : null }
      } else {
        msg = { text: raw, isUser: false, workouts: null }
      }
      if (mountedRef.current) setCoachMessages(prev => [...prev, msg])
    } catch {
      // Drop the failed turn so it isn't resent with every later message
      coachHistoryRef.current = coachHistoryRef.current.filter(m => m !== userTurn)
      if (mountedRef.current) setCoachMessages(prev => [...prev, { text: "Couldn't reach AI — try again.", isUser: false }])
    } finally {
      coachSendingRef.current = false
      if (mountedRef.current) setCoachThinking(false)
      scrollCoach()
    }
  }

  const logCoachCard = async (key: string, w: WorkoutScan) => {
    if (loggingCoachRef.current.has(key) || loggedCoachCards.has(key)) return
    loggingCoachRef.current.add(key)
    try {
      const ok = await logWorkoutDirect(scanToEntry(w))
      if (!mountedRef.current) return
      if (ok === false) {
        setCoachMessages(prev => [...prev, { text: `Couldn't save ${w.exercise} — try again.`, isUser: false }])
      } else {
        setLoggedCoachCards(prev => new Set(prev).add(key))
        setCoachMessages(prev => [...prev, { text: `✓ Logged ${w.exercise}`, isUser: false }])
      }
      scrollCoach()
    } finally {
      loggingCoachRef.current.delete(key)
    }
  }

  const anyLoggable = scanValues.some(isLoggableScan)
  const busy = scanLoading || savingScan

  return (
    <>
      {/* Scan card — fixed overlay */}
      {showScanCard && (
        <div className="fixed z-[45]" style={{ top: '72px', left: '50%', transform: 'translateX(-50%)', width: 'min(calc(100vw - 48px), 420px)' }}>
          <div className="monument-card p-4 flex flex-col" style={{ maxHeight: 'calc(100dvh - 96px)' }}>
            <div className="flex justify-between items-start gap-2 mb-3 flex-shrink-0">
              <div className="min-w-0 flex-1" role="status" aria-live="polite">
                <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                  {scanLoading ? 'Analysing...' : 'Does this look right?'}
                </span>
                {scanDescription && !scanLoading && (
                  <div className="monument-text mt-0.5" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', overflowWrap: 'anywhere' }}>{scanDescription}</div>
                )}
              </div>
              <button
                onClick={closeScanCard}
                aria-label="Dismiss scan results"
                style={{ ...ICON_BTN, margin: '-10px -10px 0 0' }}
              >
                <X aria-hidden="true" size={14} strokeWidth={2.5} color="#A0725A" />
              </button>
            </div>
            <div className="space-y-2 mb-3 overflow-y-auto flex-1" style={{ minHeight: 0 }}>
              {scanValues.map((sv, idx) => {
                const canLog = !busy && isLoggableScan(sv)
                return (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2"
                    style={{ background: 'rgba(255,252,248,0.7)', border: '1.5px solid rgba(139,90,62,0.2)', borderRadius: '10px' }}>
                    <div className="flex-1 min-w-0">
                      <div className="monument-text truncate" style={{ color: '#B8581F', fontSize: '12px', fontWeight: '700' }}>{sv.exercise || 'Workout'}</div>
                      <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{describeScan(sv)}</div>
                    </div>
                    <button onClick={() => setScanEditingIndex(idx)} disabled={scanLoading} className="monument-button"
                      style={{ ...CHIP_BTN, background: 'rgba(255,252,248,0.95)', color: '#8B5A3E', ...disabledStyle(scanLoading) }}>
                      EDIT
                    </button>
                    <button onClick={() => handleLogOne(idx)} disabled={!canLog} className="monument-button"
                      style={{ ...CHIP_BTN, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', color: '#6B4423', ...disabledStyle(!canLog) }}>
                      LOG
                    </button>
                  </div>
                )
              })}
            </div>
            {!scanLoading && !anyLoggable && (
              <div className="monument-text text-center mb-2 flex-shrink-0" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>Tap EDIT to add details before logging</div>
            )}
            <button onClick={handleLogAll} disabled={busy || !anyLoggable} className="monument-button w-full py-2.5 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)', ...disabledStyle(busy || !anyLoggable) }}>
              {savingScan ? 'SAVING…' : scanValues.length > 1 ? `✓ LOG ALL (${scanValues.filter(isLoggableScan).length})` : '✓ LOG WORKOUT'}
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
        const canLog = !busy && isLoggableScan(sv)
        return (
          <div className="fixed inset-0 z-50 flex flex-col justify-end"
            style={{ background: 'rgba(107,68,35,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setScanEditingIndex(null)}>
            <div className="monument-card w-full flex flex-col" role="dialog" aria-modal="true" aria-label={`Edit ${sv.exercise || 'workout'}`}
              style={{ borderRadius: '20px 20px 0 0', maxHeight: '82dvh', padding: '20px 16px calc(28px + env(safe-area-inset-bottom))' }}
              onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-3 flex-shrink-0" style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(139,90,62,0.25)' }} />
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <input type="text" value={sv.exercise} maxLength={60} aria-label="Exercise name" onChange={e => update({ exercise: e.target.value })}
                  className="flex-1 min-w-0 px-3 monument-text"
                  style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '10px', color: '#6B4423', fontSize: '16px', fontWeight: '700', height: 40, boxShadow: '0 2px 0 rgba(139,90,62,0.15)' }} />
                <button onClick={() => setScanEditingIndex(null)} aria-label="Close editor" style={ICON_BTN}>
                  <X aria-hidden="true" size={18} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
              <div className="flex gap-2 mb-3 flex-shrink-0" role="group" aria-label="Tracking type">
                {(['weights', 'energy'] as const).map(t => (
                  <button key={t} onClick={() => update({ type: t })} aria-pressed={sv.type === t} className="monument-button flex-1"
                    style={{ height: 40, background: sv.type === t ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '2px solid #8B5A3E', color: sv.type === t ? '#6B4423' : '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
                    {t === 'weights' ? 'WEIGHTS / REPS' : 'ENERGY LEVEL'}
                  </button>
                ))}
              </div>
              {sv.type === 'weights' && !isDistanceUnit(sv.unit) && (
                <div className="flex items-center justify-end gap-2 mb-3 flex-shrink-0">
                  <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>UNIT</span>
                  <button
                    onClick={() => update(toggleSetsUnit(sv.sets, sv.unit))}
                    aria-label={`Weight unit: ${unitLabel(sv.unit)}. Tap to switch`}
                    className="monument-button px-3"
                    style={{ minHeight: 36, background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}
                  >
                    {unitLabel(sv.unit)}
                  </button>
                </div>
              )}
              <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
                {sv.type === 'energy' ? (
                  <div className="mb-2">
                    <div className="monument-text mb-2 text-center" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>How did you feel? (1-5)</div>
                    <div className="flex justify-center gap-2" role="group" aria-label="Energy rating">
                      {[1, 2, 3, 4, 5].map(r => (
                        <button key={r} onClick={() => update({ energyRating: r })} aria-pressed={sv.energyRating === r} className="monument-button w-12 h-12"
                          style={{ background: sv.energyRating === r ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '14px', fontWeight: '700' }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {sv.sets.map((set, i) => (
                      <div key={i} className="mb-3">
                        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                          <div>
                            <div className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>SET {i + 1}</div>
                            <div className="flex items-center justify-start h-10">
                              {sv.sets.length > 1 && (
                                <button onClick={() => update({ sets: sv.sets.filter((_, si) => si !== i) })}
                                  aria-label={`Remove set ${i + 1}`}
                                  style={{ ...ICON_BTN, marginLeft: -10 }}>
                                  <X aria-hidden="true" size={14} strokeWidth={2.5} color="#A0725A" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <label htmlFor={`fab-reps-${i}`} className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>REPS</label>
                            <input id={`fab-reps-${i}`} type="text" inputMode="numeric" placeholder="0"
                              {...arithField(`fab-reps-${i}`, set.reps, n => updateSetField(i, { reps: Math.min(999, n) }), { integer: true })}
                              className="w-full monument-text"
                              style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '16px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }} />
                          </div>
                          <div>
                            <label htmlFor={`fab-weight-${i}`} className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
                              {unitLabel(sv.unit) || 'WEIGHT'}
                            </label>
                            <input id={`fab-weight-${i}`} type="text" inputMode="decimal" placeholder="0"
                              {...arithField(`fab-weight-${i}`, set.weight, n => updateSetField(i, { weight: Math.min(1000, n) }))}
                              className="w-full monument-text"
                              style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '16px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => update({ sets: [...sv.sets, { reps: 0, weight: 0 }] })}
                      className="monument-button w-full mb-2"
                      style={{ height: 40, background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}>
                      + ADD SET
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2 mt-3 flex-shrink-0">
                <button onClick={() => setScanEditingIndex(null)} className="monument-button"
                  style={{ flex: 1, height: 46, background: 'rgba(255,252,248,0.95)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}>
                  DONE
                </button>
                <button onClick={() => handleLogOne(idx)} disabled={!canLog} className="monument-button"
                  style={{ flex: 2, height: 46, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)', ...disabledStyle(!canLog) }}>
                  {savingScan ? 'SAVING…' : '✓ LOG THIS'}
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
          <div className="fixed z-50 flex flex-col gap-2 items-end" style={{ bottom: 'calc(176px + env(safe-area-inset-bottom))', right: '16px' }}>
            {coachMode ? (
              <div className="monument-card flex flex-col" role="dialog" aria-label="AI Companion"
                style={{ width: 'min(calc(100vw - 32px), 360px)', height: 'min(420px, calc(100vh - 240px))', maxHeight: 'calc(100dvh - 240px)' }}
                onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b-2 flex-shrink-0" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 cozy-glow" style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '50%', border: '2px solid #8B5A3E' }}>
                      <MessageCircle aria-hidden="true" size={18} strokeWidth={2.5} color="#6B4423" />
                    </div>
                    <div>
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>AI Companion</div>
                      <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>Always here to help!</div>
                    </div>
                  </div>
                  <button onClick={() => setCoachMode(false)} aria-label="Close AI companion" className="monument-button"
                    style={{ background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '40px', height: '40px' }}>×</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'rgba(255,252,248,0.3)', minHeight: 0 }} aria-live="polite" aria-relevant="additions">
                  {coachMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%] min-w-0">
                        <div className="monument-card px-4 py-3"
                          style={{ background: msg.isUser ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', border: `2px solid ${msg.isUser ? '#8B5A3E' : '#A0725A'}`, boxShadow: msg.isUser ? '0 4px 0 rgba(139,90,62,0.25)' : '0 2px 0 rgba(160,114,90,0.2)' }}>
                          <div className="monument-text" style={{ color: msg.isUser ? '#6B4423' : '#8B5A3E', fontSize: '11px', fontWeight: '700', lineHeight: '1.6', overflowWrap: 'anywhere' }}>{msg.text}</div>
                        </div>
                        {msg.workouts && msg.workouts.length > 0 && (
                          <div className="mt-1.5 space-y-1.5">
                            {msg.workouts.map((w, wi) => {
                              const key = `${i}-${wi}`
                              const logged = loggedCoachCards.has(key)
                              return (
                                <div key={wi} className="px-3 py-2"
                                  style={{ background: 'rgba(255,159,102,0.08)', border: '1.5px solid rgba(255,159,102,0.3)', borderRadius: '10px' }}>
                                  <div className="monument-text mb-0.5 truncate" style={{ color: '#B8581F', fontSize: '11px', fontWeight: '700' }}>{w.exercise}</div>
                                  <div className="monument-text mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{describeScan(w)}</div>
                                  <button
                                    onClick={() => logCoachCard(key, w)}
                                    disabled={logged || !isLoggableScan(w)}
                                    className="monument-button w-full"
                                    style={{ minHeight: 36, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.25)', ...disabledStyle(logged || !isLoggableScan(w)) }}>
                                    {logged ? '✓ LOGGED' : '✓ LOG THIS'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {coachThinking && (
                    <div className="flex justify-start">
                      <div className="monument-card px-4 py-3" role="status" style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #A0725A', boxShadow: '0 2px 0 rgba(160,114,90,0.2)' }}>
                        <div className="monument-text soft-pulse" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>thinking...</div>
                      </div>
                    </div>
                  )}
                  <div ref={coachEndRef} />
                </div>
                <div className="p-4 border-t-2 flex-shrink-0" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex gap-2">
                    <input type="text" value={coachInput} onChange={e => setCoachInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCoachSend()}
                      maxLength={MAX_COACH_INPUT} aria-label="Message the AI companion"
                      placeholder="Type a message..." autoFocus className="flex-1 min-w-0 px-4 py-3 monument-text"
                      style={{ background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '16px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', outline: 'none' }} />
                    <button onClick={handleCoachSend} disabled={coachThinking} aria-label="Send message" className="monument-button p-3 cozy-glow"
                      style={{ background: coachThinking ? 'rgba(255,184,138,0.4)' : 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '12px', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255,184,138,0.15),0 4px 0 rgba(139,90,62,0.25)' }}>
                      <Send aria-hidden="true" size={20} strokeWidth={2.5} color="#6B4423" />
                    </button>
                  </div>
                </div>
              </div>
            ) : textMode ? (
              <div className="flex items-center gap-2 pl-3 pr-1 py-1.5 monument-button"
                style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)', minWidth: '260px' }}>
                <input ref={textInputRef} type="text" placeholder="e.g. 6x30m / 3 mins rest"
                  value={textInput} onChange={e => setTextInput(e.target.value)} maxLength={MAX_COACH_INPUT}
                  aria-label="Describe your workout"
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()} autoFocus
                  className="flex-1 min-w-0 monument-text"
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#6B4423', fontSize: '16px', fontWeight: '700' }} />
                <button onClick={handleTextSubmit} className="monument-button px-3"
                  style={{ minHeight: 36, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.2)', flexShrink: 0 }}>
                  LOG
                </button>
                <button onClick={() => { setTextMode(false); setTextInput('') }}
                  aria-label="Cancel text entry"
                  style={ICON_BTN}>
                  <X aria-hidden="true" size={14} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
            ) : (micReady || micRecording) ? (
              <div className="flex items-center gap-3 pl-4 pr-1 py-1.5 monument-button"
                style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139,90,62,0.25)', backdropFilter: 'blur(8px)' }}>
                {micRecording && <div className="soft-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#E05A4E', flexShrink: 0 }} />}
                <span className="monument-text" role="status" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>
                  {micRecording ? 'Recording...' : 'Tap to start'}
                </span>
                {micReady && !micRecording && (
                  <button onClick={startMicRecording} className="monument-button px-4"
                    style={{ minHeight: 36, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139,90,62,0.2)' }}>
                    START
                  </button>
                )}
                {micRecording && (
                  <button onClick={stopMicRecording} className="monument-button px-4"
                    style={{ minHeight: 36, background: '#E05A4E', borderRadius: '10px', border: '2px solid #C04040', color: '#fff', fontSize: '10px', fontWeight: '700', boxShadow: '0 2px 0 rgba(180,40,40,0.3)' }}>
                    STOP
                  </button>
                )}
                <button onClick={cancelMic} aria-label="Cancel recording" style={ICON_BTN}>
                  <X aria-hidden="true" size={14} strokeWidth={2.5} color="#A0725A" />
                </button>
              </div>
            ) : (
              <>
                {micError && (
                  <div className="monument-text px-3 py-2" role="alert"
                    style={{ background: 'rgba(255,252,248,0.97)', borderRadius: '12px', border: '2px solid #C04040', color: '#8B3A2E', fontSize: '11px', fontWeight: '700', maxWidth: 260 }}>
                    {micError}
                  </div>
                )}
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
                    <div className="p-1.5 flex items-center justify-center" aria-hidden="true"
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

      {/* Hidden file inputs — the scan pipeline only understands images */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={filesInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Floating FAB */}
      <button
        onClick={() => setShowMediaMenu(v => !v)}
        aria-label={showMediaMenu ? 'Close log menu' : 'Open log menu'}
        aria-expanded={showMediaMenu}
        className="fixed right-6 p-3 soft-pulse monument-button"
        style={{
          bottom: 'calc(6rem + env(safe-area-inset-bottom))',
          background: 'linear-gradient(135deg,#FF9F66,#FFB88A)',
          borderRadius: '50%',
          border: '3px solid #8B5A3E',
          boxShadow: '0 0 20px rgba(255,184,138,0.4),0 6px 0 rgba(139,90,62,0.3)',
          zIndex: 40,
          transform: showMediaMenu ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <ChevronUp aria-hidden="true" size={24} strokeWidth={2.5} color="#6B4423" />
      </button>
    </>
  )
}
