import { useState, useEffect, useRef, useId } from 'react'
import { ChevronUp, Droplet, Beef, Flame, Candy, Plus, Minus, Pill, X, Camera, Mic, FolderOpen, MessageCircle, Send } from 'lucide-react'
import { PixelBar } from '@/app/components/shared'
import { useHealthData } from '@/contexts/HealthDataContext'
import { groqText, parseAIJson } from '@/lib/groq'
import { geminiVision } from '@/lib/gemini'
import { getToday } from '@/lib/supabase'

type NutritionScan = { waterDelta?: number; caloriesDelta?: number; proteinDelta?: number; sugarDelta?: number; description?: string; servingNote?: string }

function LimitWarning({ message }: { message: string }) {
  return (
    <div
      className="monument-text text-center mt-3 px-3 py-2"
      style={{
        background: 'rgba(211, 47, 47, 0.1)',
        borderRadius: '10px',
        color: '#D32F2F',
        fontSize: '10px',
        fontWeight: '700',
        border: '2px solid rgba(211, 47, 47, 0.3)',
      }}
    >
      {message}
    </div>
  )
}

interface StepperInputProps {
  value: number
  onDecrement: () => void
  onIncrement: () => void
  onChange: (val: number) => void
  min?: number
  max: number
  step?: number
  label: string
  /** Short metric name for screen readers, e.g. "water" → "Decrease water". */
  name: string
  /** Whole numbers only (counts like multivitamins). */
  integer?: boolean
  exceeded?: boolean
}

const STEPPER_BUTTON_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
  borderRadius: '10px',
  border: '2px solid #8B5A3E',
  boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
  zIndex: 41,
  width: 40,
  height: 40,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function StepperInput({ value, onDecrement, onIncrement, onChange, min = 0, max, step = 1, label, name, integer = false, exceeded = false }: StepperInputProps) {
  const inputId = useId()
  // Raw text while the field is being typed in, so partial entries like "0" or
  // "0." survive until they become a real number (e.g. "0.5").
  const [draft, setDraft] = useState<string | null>(null)
  const borderColor = exceeded ? '#D32F2F' : '#8B5A3E'
  const textColor = exceeded ? '#D32F2F' : '#6B4423'
  const shadowColor = exceeded ? 'rgba(211, 47, 47, 0.25)' : 'rgba(139, 90, 62, 0.25)'

  const handleText = (text: string) => {
    setDraft(text)
    const normalized = text.trim().replace(',', '.')
    if (normalized === '') { onChange(min); return }
    const v = Number(normalized)
    if (!Number.isFinite(v)) return
    const n = integer ? Math.round(v) : v
    onChange(Math.max(min, Math.min(max, n)))
  }

  return (
    <>
      <label htmlFor={inputId} className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <button
          type="button"
          aria-label={`Decrease ${name}`}
          onClick={() => { setDraft(null); onDecrement() }}
          className="monument-button relative"
          style={STEPPER_BUTTON_STYLE}
        >
          <Minus size={18} strokeWidth={2.5} color="#6B4423" />
        </button>
        <input
          id={inputId}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={draft ?? (value === 0 ? '' : String(value))}
          placeholder="—"
          onChange={e => handleText(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={() => setDraft(null)}
          className="flex-1 min-w-0 px-3 py-2 monument-text"
          style={{
            background: 'rgba(255, 252, 248, 0.95)',
            border: `2px solid ${borderColor}`,
            borderRadius: '12px',
            color: value === 0 ? '#C4A898' : textColor,
            // 16px+ stops iOS Safari zooming the page when the field is focused.
            fontSize: '16px',
            fontWeight: '700',
            boxShadow: `0 4px 0 ${shadowColor}`,
            textAlign: 'center',
          }}
        />
        <button
          type="button"
          aria-label={`Increase ${name}`}
          onClick={() => { setDraft(null); onIncrement() }}
          className="monument-button relative"
          style={STEPPER_BUTTON_STYLE}
        >
          <Plus size={18} strokeWidth={2.5} color="#6B4423" />
        </button>
      </div>
    </>
  )
}

const DEFAULT_SCAN = { water: 0, calories: 0, protein: 0, sugar: 0 }

const FOOD_SCAN_DRAFT_KEY = 'venturegain:foodScanDraft'

const SCAN_INTERRUPTED = 'The scan was interrupted — please try again'

interface FoodScanDraft {
  date: string
  scanValues: typeof DEFAULT_SCAN
  scanDescription: string | null
  scanEditing: boolean
  scanError: string | null
}

/** AI output is untyped at runtime — models sometimes return "250" or "250 kcal"
 *  instead of 250. Coerce to a finite, non-negative number within `max`. */
function scanNum(v: unknown, max: number, decimals = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  if (!Number.isFinite(n)) return 0
  const f = 10 ** decimals
  return Math.round(Math.min(max, Math.max(0, n)) * f) / f
}

function toScanValues(parsed: NutritionScan, maxes: typeof DEFAULT_SCAN): typeof DEFAULT_SCAN {
  return {
    water: scanNum(parsed.waterDelta, maxes.water, 2),
    calories: scanNum(parsed.caloriesDelta, maxes.calories),
    protein: scanNum(parsed.proteinDelta, maxes.protein),
    sugar: scanNum(parsed.sugarDelta, maxes.sugar),
  }
}

/** A short display label — rendering a non-string (object/array) would crash React. */
function scanText(v: unknown, fallback: string | null = null): string | null {
  const t = typeof v === 'string' && v.trim() ? v.trim() : fallback
  return t ? (t.length > 80 ? `${t.slice(0, 77)}…` : t) : null
}

/** Turns raw network/AI errors into short, actionable copy. */
function friendlyScanError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : ''
  if (typeof navigator !== 'undefined' && !navigator.onLine) return "You're offline — reconnect and try again"
  if (err instanceof Error && err.name === 'AbortError') return 'The AI took too long — try again'
  if (/429|quota|rate.?limit/i.test(msg)) return 'Scan limit reached — try again in a little while'
  if (/503|overload|unavailable|busy/i.test(msg)) return 'The AI is busy right now — try again in a moment'
  if (/failed to fetch|network|load failed/i.test(msg)) return "Couldn't reach the AI — check your connection"
  return fallback
}

function friendlySaveError(msg: string): string {
  if (msg.startsWith("Couldn't load")) return msg
  if (/failed to fetch|network|load failed/i.test(msg)) return "No connection — your last change isn't saved yet"
  return "Couldn't save your last change"
}

/** Reads the pending (not-yet-approved) food scan result, so a reload or the PWA
 *  being backgrounded/reclaimed doesn't wipe a scan the user hasn't approved yet.
 *  Ignored once the calendar day rolls over. */
function readFoodScanDraft(): FoodScanDraft | null {
  try {
    const raw = localStorage.getItem(FOOD_SCAN_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as FoodScanDraft
    return draft.date === getToday() ? draft : null
  } catch {
    return null
  }
}

export function FoodWaterTab() {
  const {
    state, limits, steps, maxes,
    caloriesBurned, caloriesBurnedStatus,
    adjustWater, setWater,
    adjustCalories, setCalories,
    adjustProtein, setProtein,
    adjustSugar, setSugar,
    adjustMultivitamins, setMultivitamins,
    weeklyMultivitamins,
    creatineTaken, toggleCreatine,
    celebration,
    simulateAIScan, approveScan, dismissScan,
    saveError, retrySave,
    refreshFitbitCalories,
  } = useHealthData().nutrition

  const [initialScanDraft] = useState(() => readFoodScanDraft())
  const [scanEditing, setScanEditing] = useState(initialScanDraft?.scanEditing ?? false)
  const [scanValues, setScanValues] = useState(initialScanDraft?.scanValues ?? DEFAULT_SCAN)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState<string | null>(initialScanDraft?.scanError ?? null)
  const [scanDescription, setScanDescription] = useState<string | null>(initialScanDraft?.scanDescription ?? null)
  // Day the pending scan was made — a scan left unapproved past midnight must
  // not be added to the next day's totals.
  const [scanDate, setScanDate] = useState(initialScanDraft?.date ?? getToday())
  // Bumped on every new scan and on dismiss; a response whose id is no longer
  // current (superseded or dismissed) is discarded.
  const scanReqRef = useRef(0)
  // Values as they were when EDIT was tapped, so CANCEL can restore them.
  const scanEditSnapshot = useRef<typeof DEFAULT_SCAN | null>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [companionMode, setCompanionMode] = useState(false)
  const [companionInput, setCompanionInput] = useState('')
  const [companionLoading, setCompanionLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  // Re-open the scan card on mount if a draft was restored — the card's
  // visibility is driven by the shared uploadedImage flag, not local state.
  useEffect(() => {
    if (initialScanDraft) simulateAIScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror the pending scan to localStorage so it survives reload/backgrounding.
  useEffect(() => {
    if (!state.uploadedImage) {
      try { localStorage.removeItem(FOOD_SCAN_DRAFT_KEY) } catch { /* private mode etc — best-effort */ }
      return
    }
    // An in-flight request can't survive a reload, so a mid-scan draft restores
    // as an "interrupted" error rather than a fake zero-value result.
    const draft: FoodScanDraft = scanLoading
      ? { date: scanDate, scanValues: DEFAULT_SCAN, scanDescription: null, scanEditing: false, scanError: SCAN_INTERRUPTED }
      : { date: scanDate, scanValues, scanDescription, scanEditing, scanError }
    try { localStorage.setItem(FOOD_SCAN_DRAFT_KEY, JSON.stringify(draft)) } catch { /* private mode etc — best-effort */ }
  }, [state.uploadedImage, scanValues, scanDescription, scanEditing, scanError, scanLoading, scanDate])

  const resetScanState = () => {
    setScanValues(DEFAULT_SCAN)
    setScanEditing(false)
    setScanDescription(null)
    setScanError(null)
  }

  /** Clears the card and returns the id for a fresh scan request. */
  const beginScan = () => {
    const id = ++scanReqRef.current
    resetScanState()
    setScanDate(getToday())
    setScanLoading(true)
    simulateAIScan()
    return id
  }
  const isLatestScan = (id: number) => id === scanReqRef.current

  const handleDismissScan = () => {
    scanReqRef.current++
    setScanLoading(false)
    setScanEditing(false)
    dismissScan()
  }

  /** A finished, not-yet-approved result is on the card. */
  const hasPendingResult = () =>
    !!state.uploadedImage && !scanLoading && !scanError &&
    (scanValues.water > 0 || scanValues.calories > 0 || scanValues.protein > 0 || scanValues.sugar > 0)

  /** Starting a new scan replaces the current card — ask before discarding an unapproved result. */
  const confirmReplacePending = () =>
    !hasPendingResult() || window.confirm("Replace the scan you haven't approved yet?")

  // Drop a pending scan from a previous day when the app comes back — the tab
  // stays mounted (hidden) across midnight, so it never remounts on its own.
  useEffect(() => {
    if (!state.uploadedImage) return
    const check = () => {
      if (document.visibilityState === 'visible' && scanDate !== getToday()) handleDismissScan()
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.uploadedImage, scanDate])

  // Escape closes the add menu / companion panel and returns focus to the FAB.
  useEffect(() => {
    if (!showMediaMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setCompanionMode(false)
      setShowMediaMenu(false)
      fabRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showMediaMenu])

  const handleCameraPress = () => {
    setShowMediaMenu(false)
    if (!confirmReplacePending()) return
    fileInputRef.current?.click()
  }

  const handleFilesPress = () => {
    setShowMediaMenu(false)
    if (!confirmReplacePending()) return
    filesInputRef.current?.click()
  }

  /** Shows a message on the scan card without a request behind it. */
  const showScanMessage = (message: string) => {
    beginScan()
    setScanLoading(false)
    setScanError(message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)

  const handleMicPress = () => {
    setShowMediaMenu(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      showScanMessage('Voice input isn\'t supported in this browser — try the AI Companion instead')
      return
    }
    if (!confirmReplacePending()) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognition() as any
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.onresult = async (event: any) => {
      const transcript: string = event.results[0][0].transcript
      const id = beginScan()
      try {
        const raw = await groqText(
          `Estimate nutrition for: "${transcript}"\nReturn ONLY: {"waterDelta":<L>,"caloriesDelta":<kcal>,"proteinDelta":<g>,"sugarDelta":<g>,"description":"<2-6 words>"}`,
          `You are a precise sports nutrition database for Summer, an athlete. Estimate for the full portion described. Reference: egg 70kcal/6g, chicken breast per 100g 165kcal/31g, whey scoop 120kcal/24g, rice cup 240kcal/5g, oats cup 310kcal/10g, milk cup 150kcal/8g/12gsugar. Water: pure drinks = full volume in L, solid food ≈ 0. Sugar = ADDED/REFINED only — whole fruits always 0g sugar. Be accurate not conservative. Return ONLY valid JSON.`
        )
        const parsed = parseAIJson<NutritionScan>(raw)
        if (!isLatestScan(id)) return
        if (!parsed) throw new Error('Could not parse AI response')
        setScanValues(toScanValues(parsed, maxes))
        setScanDescription(scanText(parsed.description, scanText(transcript)))
      } catch (err) {
        if (isLatestScan(id)) setScanError(friendlyScanError(err, "Couldn't estimate that — try rephrasing or typing it instead"))
      } finally {
        if (isLatestScan(id)) setScanLoading(false)
      }
    }
    // Show the error on the card (the card isn't open yet if nothing was heard).
    recognition.onerror = () => showScanMessage("Couldn't hear that — try again")
    recognition.start()
  }

  const handleCompanionSend = async () => {
    const input = companionInput.trim()
    if (!input || companionLoading) return
    if (!confirmReplacePending()) return
    setCompanionInput('')
    setCompanionLoading(true)
    const id = beginScan()
    try {
      const systemPrompt = `You are a precise sports nutrition database for Summer, an athlete tracking macros. Estimate nutritional values accurately for any food or drink described.

Reference values (use these as anchors):
- 1 large egg: 70 kcal, 6g protein, 0g sugar
- 100g chicken breast (cooked): 165 kcal, 31g protein, 0g sugar
- 100g beef mince (lean): 215 kcal, 26g protein, 0g sugar
- 100g salmon: 208 kcal, 20g protein, 0g sugar
- 100g tuna (canned): 116 kcal, 26g protein, 0g sugar
- 1 scoop whey protein (30g): 120 kcal, 24g protein, 2g sugar
- 1 cup cooked rice (180g): 240 kcal, 5g protein, 0g sugar
- 1 cup cooked oats (240g): 310 kcal, 10g protein, 1g sugar
- 100g dry pasta: 371 kcal, 13g protein, 1g sugar
- 1 slice bread: 80 kcal, 3g protein, 2g sugar
- 1 banana (medium, ~118g): 105 kcal, 1g protein, 0g sugar
- 1 apple (medium, ~182g): 95 kcal, 0g protein, 0g sugar
- 1 cup mixed berries: 70 kcal, 1g protein, 0g sugar
- 1 orange (medium): 62 kcal, 1g protein, 0g sugar
- 1 cup mango chunks: 100 kcal, 1g protein, 0g sugar
- 1 cup whole milk (240ml): 150 kcal, 8g protein, 12g sugar
- 1 tbsp peanut butter: 95 kcal, 4g protein, 1g sugar
- 1 tbsp olive oil: 120 kcal, 0g protein, 0g sugar
- 1 avocado: 240 kcal, 3g protein, 0g sugar
- 100g Greek yogurt (full fat): 97 kcal, 9g protein, 4g sugar
- 100g cottage cheese: 98 kcal, 11g protein, 3g sugar

Rules:
- Estimate for the FULL portion described, not per 100g
- If no quantity given, assume a standard single serving
- For compound meals, sum all components
- Water: pure water/sparkling = full volume in L; tea/coffee = same; juice/milk/smoothie = 80% of volume; solid food ≈ 0L
- Be accurate not conservative — athletes need real numbers
- Sugar tracking is ADDED/REFINED sugars only. Whole fruits (banana, apple, orange, berries, mango, etc.) = 0g sugar. Only count sugar in processed/packaged foods, sweets, juice, soda, sauces, dairy.
- Return ONLY valid JSON, no markdown, no explanation`

      const raw = await groqText(
        `Estimate nutrition for: "${input}"\nReturn ONLY: {"waterDelta":<L>,"caloriesDelta":<kcal>,"proteinDelta":<g>,"sugarDelta":<g>,"description":"<2-6 words>"}`,
        systemPrompt
      )
      const parsed = parseAIJson<NutritionScan>(raw)
      if (!isLatestScan(id)) return
      if (!parsed) throw new Error('Could not parse AI response')
      setScanValues(toScanValues(parsed, maxes))
      setScanDescription(scanText(parsed.description, scanText(input)))
    } catch (err) {
      if (isLatestScan(id)) setScanError(friendlyScanError(err, "Couldn't estimate that — try rephrasing"))
    } finally {
      if (isLatestScan(id)) setScanLoading(false)
      setCompanionLoading(false)
      setShowMediaMenu(false)
      setCompanionMode(false)
    }
  }

  // Camera photos can be 5–10 MB raw; Vercel's body limit is 4.5 MB.
  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        // Any throw in here (e.g. no 2D context under iOS memory pressure) must
        // reject, or the promise never settles and the spinner runs forever.
        try {
          const MAX = 1536
          const scale = Math.min(1, MAX / Math.max(img.width, img.height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Could not process image')
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
          resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Could not process image'))
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
      img.src = url
    })

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (file.type && !file.type.startsWith('image/')) {
      showScanMessage('Only photos work here — take or pick a picture of the food')
      return
    }
    const id = beginScan()
    try {
      const { base64, mimeType } = await compressImage(file)
      const raw = await geminiVision(base64, mimeType, `You are a nutrition expert. Look at this food image carefully.

CRITICAL RULE — SERVING SIZE:
- If this is a packaged product (box, bag, bottle, tin, wrapper), read the nutrition label and use EXACTLY 1 serving as defined on the label (e.g. "per 100g", "per cup", "per 2 biscuits"). Do NOT multiply by servings per container.
- If this is a prepared meal or whole food (plate of food, fruit, sandwich, etc.), estimate the portion actually shown.
- If you can see a nutrition label, trust its numbers for 1 serving over your own estimate.

Return ONLY a valid JSON object — no markdown, no explanation, no extra text.
{
  "waterDelta": <water content in liters (e.g. a glass of water = 0.25, soup = 0.4, dry food = 0.05), number 0-2>,
  "caloriesDelta": <calories for 1 serving or the portion shown, number 0-1500>,
  "proteinDelta": <protein in grams for 1 serving, number 0-100>,
  "sugarDelta": <added/refined sugar in grams for 1 serving, number 0-60>,
  "description": "<2-5 word food name + serving size>",
  "servingNote": "<e.g. '1 serving (30g)' or 'full plate'>"
}`)
      const parsed = parseAIJson<NutritionScan>(raw)
      if (!isLatestScan(id)) return
      if (!parsed) throw new Error('Could not read this image')
      setScanValues(toScanValues(parsed, maxes))
      const desc = scanText(parsed.description)
      const servingNote = scanText(parsed.servingNote)
      setScanDescription(desc ? `${desc}${servingNote ? ` · ${servingNote}` : ''}` : null)
    } catch (err) {
      console.error('AI scan failed:', err)
      if (isLatestScan(id)) setScanError(friendlyScanError(err, 'Could not read this image'))
    } finally {
      if (isLatestScan(id)) setScanLoading(false)
    }
  }

  const handleApproveScan = () => {
    if (scanDate !== getToday()) {
      setScanEditing(false)
      setScanError("This scan was from yesterday — scan it again to log it today")
      return
    }
    approveScan(scanValues.water, scanValues.calories, scanValues.protein, scanValues.sugar)
    setScanEditing(false)
  }

  const startScanEdit = () => {
    scanEditSnapshot.current = scanValues
    setScanEditing(true)
  }

  const cancelScanEdit = () => {
    if (scanEditSnapshot.current) setScanValues(scanEditSnapshot.current)
    scanEditSnapshot.current = null
    setScanEditing(false)
  }

  const waterExceeded = state.waterLiters > limits.waterLimit
  const caloriesExceeded = state.calories > limits.caloriesLimit
  const proteinExceeded = state.proteinGrams > limits.proteinLimit
  const sugarExceeded = state.sugarGrams > limits.sugarLimit

  return (
    <div className="p-6 max-w-md mx-auto" style={{ paddingBottom: 'calc(9rem + env(safe-area-inset-bottom))' }}>
      <h2
        className="monument-text mb-6 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Food & Water
      </h2>

      {celebration && (
        <div
          key={celebration}
          role="status"
          aria-live="polite"
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

      {saveError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 px-4 py-3 mb-4"
          style={{
            background: 'rgba(211, 47, 47, 0.08)',
            border: '2px solid rgba(211, 47, 47, 0.3)',
            borderRadius: '12px',
          }}
        >
          <div className="monument-text" style={{ color: '#D32F2F', fontSize: '10px', fontWeight: '700', lineHeight: 1.4 }}>
            {friendlySaveError(saveError)}
          </div>
          <button
            onClick={retrySave}
            aria-label="Retry saving nutrition"
            className="monument-button px-3 py-1.5 flex-shrink-0"
            style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #D32F2F', color: '#D32F2F', fontSize: '9px', fontWeight: '700' }}
          >
            RETRY
          </button>
        </div>
      )}

      {state.uploadedImage && (
        <div className="monument-card p-4 mb-6 relative" style={{ zIndex: 41 }}>
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                {scanLoading ? 'Analysing...' : 'AI Scan Results'}
              </span>
              {scanDescription && !scanLoading && (
                <div className="monument-text mt-0.5 line-clamp-2" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', overflowWrap: 'anywhere' }}>{scanDescription}</div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                aria-label="Dismiss scan"
                onClick={handleDismissScan}
                style={{ background: 'none', border: 'none', cursor: 'pointer', width: 40, height: 40, margin: -10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={14} strokeWidth={2.5} color="#A0725A" />
              </button>
            </div>
          </div>

          {scanLoading ? (
            /* Real loading state — no fake values */
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2.5 h-2.5 rounded-full soft-pulse" style={{ background: '#FF9F66', animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
              <div className="monument-text" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>AI is analysing your food...</div>
            </div>
          ) : scanError ? (
            /* Error state */
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <div role="alert" className="monument-text text-center line-clamp-3" style={{ color: '#D32F2F', fontSize: '11px', fontWeight: '700', maxWidth: '260px', overflowWrap: 'anywhere' }}>{scanError}</div>
              <div className="monument-text text-center" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
                {scanError === 'Could not read this image' ? 'Try a clearer photo or describe your food with the AI Companion' : 'Give it another try'}
              </div>
              <button onClick={handleDismissScan} className="monument-button px-5 py-2.5" style={{ minHeight: 40, background: 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>DISMISS</button>
            </div>
          ) : scanEditing ? (
            /* Edit mode — stepper rows */
            <div>
              {([
                { key: 'water' as const, label: 'Water', unit: 'L', step: 0.5, max: maxes.water },
                { key: 'calories' as const, label: 'Calories', unit: '', step: 50, max: maxes.calories },
                { key: 'protein' as const, label: 'Protein', unit: 'g', step: 5, max: maxes.protein },
                { key: 'sugar' as const, label: 'Sugar', unit: 'g', step: 5, max: maxes.sugar },
              ]).map(({ key, label, unit, step, max }) => (
                <div key={key} className="flex items-center gap-2 mb-3">
                  <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', width: '52px' }}>{label}</span>
                  <button
                    type="button"
                    aria-label={`Decrease ${label.toLowerCase()}`}
                    onClick={() => setScanValues(v => ({ ...v, [key]: Math.max(0, +(v[key] - step).toFixed(2)) }))}
                    className="monument-button"
                    style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.2)', flexShrink: 0, width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={14} strokeWidth={2.5} color="#6B4423" />
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    aria-label={`${label} to add`}
                    min={0}
                    max={max}
                    step={step}
                    value={scanValues[key]}
                    onChange={e => setScanValues(v => ({ ...v, [key]: Math.max(0, Math.min(max, parseFloat(e.target.value) || 0)) }))}
                    className="flex-1 min-w-0 py-1 monument-text"
                    style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '16px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.2)', textAlign: 'center' }}
                  />
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', width: '12px' }}>{unit}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${label.toLowerCase()}`}
                    onClick={() => setScanValues(v => ({ ...v, [key]: Math.min(max, +(v[key] + step).toFixed(2)) }))}
                    className="monument-button"
                    style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.2)', flexShrink: 0, width: 40, height: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={14} strokeWidth={2.5} color="#6B4423" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={cancelScanEdit}
                  className="monument-button flex-1 py-2"
                  style={{ background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139, 90, 62, 0.2)' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleApproveScan}
                  className="monument-button flex-1 py-2"
                  style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139, 90, 62, 0.25)' }}
                >
                  APPROVE
                </button>
              </div>
            </div>
          ) : (
            /* Default view — big stat grid + Approve */
            <div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  { value: `${scanValues.calories}`, unit: 'kcal', label: 'CALORIES', color: '#E8956A' },
                  { value: `${scanValues.protein}g`, unit: '', label: 'PROTEIN', color: '#C4A45A' },
                  { value: `${+scanValues.water.toFixed(2)}L`, unit: '', label: 'WATER', color: '#7BAFD4' },
                  { value: `${scanValues.sugar}g`, unit: '', label: 'SUGAR', color: '#C4809A' },
                ].map(({ value, unit, label, color }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center justify-center py-3 px-2"
                    style={{ background: `${color}12`, border: `1.5px solid ${color}40`, borderRadius: '10px' }}
                  >
                    <span className="monument-text whitespace-nowrap" style={{ color, fontSize: '22px', fontWeight: '700', lineHeight: 1 }}>
                      {value}{unit}
                    </span>
                    <span className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', letterSpacing: '1px' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={startScanEdit}
                  className="monument-button py-2"
                  style={{ flex: 1, background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139, 90, 62, 0.2)' }}
                >
                  EDIT
                </button>
                <button
                  onClick={handleApproveScan}
                  className="monument-button py-2"
                  style={{ flex: 2, background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139, 90, 62, 0.25)' }}
                >
                  ✓ APPROVE & ADD
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section: Hydration */}

      <div className="flex items-center gap-2 mb-3">
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
        <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1.5px' }}>HYDRATION</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
      </div>

      {/* Water */}
      <div className="monument-card p-5 mb-6 relative" style={{ zIndex: 41 }}>
        <div className="flex items-center gap-2 mb-4">
          <Droplet size={18} strokeWidth={2.5} color={waterExceeded ? '#D32F2F' : '#7BAFD4'} />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Water Intake</div>
        </div>
        <div className="mb-3">
          <StepperInput
            value={state.waterLiters}
            onDecrement={() => adjustWater(-steps.water)}
            onIncrement={() => adjustWater(steps.water)}
            onChange={v => setWater(v)}
            max={maxes.water}
            step={steps.water}
            label="Liters (0-6L)"
            name="water"
            exceeded={waterExceeded}
          />
        </div>
        <PixelBar
          label="WATER"
          value={state.waterLiters}
          max={maxes.water}
          target={limits.waterTarget}
          color={waterExceeded ? '#D32F2F' : '#7BAFD4'}
          unit="L"
        />
        {waterExceeded && <LimitWarning message="WATER LIMIT EXCEEDED" />}
      </div>

      {/* Creatine */}
      <div className="monument-card p-5 mb-6 relative" style={{ zIndex: 41 }}>
        <div className="flex items-center gap-2 mb-4">
          <Pill size={18} strokeWidth={2.5} color="#7BAFD4" />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Creatine</div>
        </div>
        <StepperInput
          value={creatineTaken ? 1 : 0}
          onDecrement={() => creatineTaken && toggleCreatine()}
          onIncrement={() => !creatineTaken && toggleCreatine()}
          onChange={v => { if ((v === 1) !== creatineTaken) toggleCreatine() }}
          min={0}
          max={1}
          step={1}
          label="Today"
          name="creatine"
          integer
        />
      </div>

      {/* Section: Nutrition */}
      <div className="flex items-center gap-2 mb-3">
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
        <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1.5px' }}>NUTRITION</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
      </div>

      {/* Calories */}
      <div className="monument-card p-5 mb-6 relative" style={{ zIndex: 41 }}>
        <div className="flex items-center gap-2 mb-4">
          <Flame size={18} strokeWidth={2.5} color={caloriesExceeded ? '#D32F2F' : '#E8956A'} />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Calories</div>
        </div>
        <div className="mb-3">
          <StepperInput
            value={state.calories}
            onDecrement={() => adjustCalories(-steps.calories)}
            onIncrement={() => adjustCalories(steps.calories)}
            onChange={v => setCalories(v)}
            max={maxes.calories}
            step={steps.calories}
            label="Calories (0-4000)"
            name="calories"
            exceeded={caloriesExceeded}
          />
        </div>
        <PixelBar
          label="CALORIES"
          value={state.calories}
          max={maxes.calories}
          target={limits.caloriesTarget}
          color={caloriesExceeded ? '#D32F2F' : '#E8956A'}
          unit=""
        />
        {caloriesExceeded && <LimitWarning message="CALORIE LIMIT EXCEEDED" />}
        {caloriesBurnedStatus === 'not_connected' ? null : caloriesBurnedStatus === 'error' ? (
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="monument-text text-center" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
              Couldn't reach Fitbit — calories burnt unavailable
            </div>
            <button
              type="button"
              onClick={refreshFitbitCalories}
              aria-label="Retry loading calories burnt from Fitbit"
              className="monument-button px-3 flex-shrink-0"
              style={{ minHeight: 32, background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}
            >
              RETRY
            </button>
          </div>
        ) : caloriesBurnedStatus === 'loading' ? (
          <div className="monument-text text-center mt-3" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
            Loading calories burnt…
          </div>
        ) : (
          <div className="mt-3">
            <PixelBar label="CALORIES BURNT" value={caloriesBurned} max={maxes.calories} color="#8B2020" unit="" />
          </div>
        )}
      </div>

      {/* Protein */}
      <div className="monument-card p-5 mb-6 relative" style={{ zIndex: 41 }}>
        <div className="flex items-center gap-2 mb-4">
          <Beef size={18} strokeWidth={2.5} color={proteinExceeded ? '#D32F2F' : '#C4A45A'} />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Protein</div>
        </div>
        <div className="mb-3">
          <StepperInput
            value={state.proteinGrams}
            onDecrement={() => adjustProtein(-steps.protein)}
            onIncrement={() => adjustProtein(steps.protein)}
            onChange={v => setProtein(v)}
            max={maxes.protein}
            step={steps.protein}
            label="Grams (0-300g)"
            name="protein"
            exceeded={proteinExceeded}
          />
        </div>
        <PixelBar
          label="PROTEIN"
          value={state.proteinGrams}
          max={maxes.protein}
          target={limits.proteinTarget}
          color={proteinExceeded ? '#D32F2F' : '#C4A45A'}
          unit="g"
        />
        {proteinExceeded && <LimitWarning message="PROTEIN LIMIT EXCEEDED" />}
      </div>

      {/* Sugar */}
      <div className="monument-card p-5 mb-6 relative" style={{ zIndex: 41 }}>
        <div className="flex items-center gap-2 mb-4">
          <Candy size={18} strokeWidth={2.5} color={sugarExceeded ? '#D32F2F' : '#C4809A'} />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Sugar</div>
        </div>
        <div className="mb-3">
          <StepperInput
            value={state.sugarGrams}
            onDecrement={() => adjustSugar(-steps.sugar)}
            onIncrement={() => adjustSugar(steps.sugar)}
            onChange={v => setSugar(v)}
            max={maxes.sugar}
            step={steps.sugar}
            label="Grams (0-100g)"
            name="sugar"
            exceeded={sugarExceeded}
          />
        </div>
        <PixelBar
          label="SUGAR"
          value={state.sugarGrams}
          max={maxes.sugar}
          target={limits.sugarLimit}
          color={sugarExceeded ? '#D32F2F' : '#C4809A'}
          unit="g"
        />
        {sugarExceeded && <LimitWarning message="SUGAR LIMIT EXCEEDED" />}
      </div>

      {/* Section: Supplements */}
      <div className="flex items-center gap-2 mb-3">
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
        <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1.5px' }}>SUPPLEMENTS</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
      </div>

      {/* Multivitamins */}
      <div className="monument-card p-5 mb-6 relative" style={{ zIndex: 41 }}>
        <div className="flex items-center gap-2 mb-4">
          <Pill size={18} strokeWidth={2.5} color="#8BAF8C" />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Multivitamins</div>
        </div>
        <div className="mb-3">
          <StepperInput
            value={weeklyMultivitamins}
            onDecrement={() => adjustMultivitamins(-1)}
            onIncrement={() => adjustMultivitamins(1)}
            onChange={v => setMultivitamins(v)}
            min={0}
            max={3}
            step={1}
            label="This Week"
            name="multivitamins"
            integer
          />
        </div>
        <PixelBar
          label="WEEK"
          value={weeklyMultivitamins}
          max={3}
          color="#8BAF8C"
        />
        <div className="monument-text mt-1 text-right" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
          resets every Saturday
        </div>
      </div>


      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={filesInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Drop-up media menu */}
      {showMediaMenu && (
        <>
          <div className="fixed inset-0 z-[44]" onClick={() => { if (!companionMode) setShowMediaMenu(false) }} />
          {/* Sits 80px above the FAB (bottom: 6rem + safe area), so it tracks it on notched phones. */}
          <div id="food-add-menu" className="fixed z-50 flex flex-col gap-2 items-end" style={{ bottom: 'calc(6rem + 80px + env(safe-area-inset-bottom))', right: '16px' }}>
            {companionMode ? (
              /* AI Companion panel */
              <div className="monument-card flex flex-col" style={{ width: 'min(calc(100vw - 32px), 360px)' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b-2" style={{ borderColor: '#8B5A3E' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 cozy-glow" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '50%', border: '2px solid #8B5A3E' }}>
                      <MessageCircle size={18} strokeWidth={2.5} color="#6B4423" />
                    </div>
                    <div>
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>AI Companion</div>
                      <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Describe your food — I'll categorise it</div>
                    </div>
                  </div>
                  <button type="button" aria-label="Close AI companion" onClick={() => { setCompanionMode(false); setShowMediaMenu(false) }} className="monument-button flex-shrink-0" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={companionInput}
                      onChange={e => setCompanionInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCompanionSend()}
                      aria-label="Describe your food for the AI companion"
                      placeholder={companionLoading ? 'Analysing...' : 'e.g. chicken salad, 2 eggs, protein shake...'}
                      disabled={companionLoading}
                      autoFocus
                      className="flex-1 min-w-0 px-4 monument-text"
                      style={{ height: 48, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '16px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)', outline: 'none' }}
                    />
                    <button
                      type="button"
                      aria-label="Send to AI companion"
                      onClick={handleCompanionSend}
                      disabled={companionLoading || !companionInput.trim()}
                      className="monument-button"
                      style={{ width: 48, height: 48, background: (companionLoading || !companionInput.trim()) ? 'rgba(200,180,160,0.4)' : 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '12px', border: '2px solid #8B5A3E', boxShadow: '0 3px 0 rgba(139,90,62,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                    >
                      {companionLoading
                        ? <div className="soft-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B5A3E' }} />
                        : <Send size={18} strokeWidth={2.5} color="#6B4423" />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Normal menu */
              <>
                {([
                  { label: 'AI Companion', icon: null as null, onClick: () => setCompanionMode(true) },
                  { label: 'Camera', icon: Camera as React.ElementType | null, onClick: handleCameraPress },
                  { label: 'Microphone', icon: Mic as React.ElementType | null, onClick: handleMicPress },
                  { label: 'Files', icon: FolderOpen as React.ElementType | null, onClick: handleFilesPress },
                ]).filter(item => item.label !== 'Microphone' || speechSupported).map(({ label, icon: Icon, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="monument-button flex items-center gap-3 px-4 py-3"
                    style={{ background: 'rgba(255, 252, 248, 0.97)', borderRadius: '14px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', backdropFilter: 'blur(8px)' }}
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
        ref={fabRef}
        type="button"
        aria-label={showMediaMenu ? 'Close add menu' : 'Open add menu'}
        aria-expanded={showMediaMenu}
        aria-controls="food-add-menu"
        onClick={() => setShowMediaMenu(v => !v)}
        className="fixed right-6 p-3 soft-pulse monument-button"
        style={{
          bottom: 'calc(6rem + env(safe-area-inset-bottom))',
          background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
          borderRadius: '50%',
          border: '3px solid #8B5A3E',
          boxShadow: '0 0 20px rgba(255, 184, 138, 0.4), 0 6px 0 rgba(139, 90, 62, 0.3)',
          zIndex: 45,
          transform: showMediaMenu ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }}
      >
        <ChevronUp size={24} strokeWidth={2.5} color="#6B4423" />
      </button>
    </div>
  )
}
