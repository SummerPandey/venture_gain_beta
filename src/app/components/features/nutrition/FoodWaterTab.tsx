import { useState, useRef } from 'react'
import { ChevronUp, Droplet, Beef, Flame, Candy, Plus, Minus, Pill, X, Camera, Mic, FolderOpen, MessageCircle, Send } from 'lucide-react'
import { PixelBar } from '@/app/components/shared'
import { useNutrition } from '@/hooks'
import { groqText, groqVision } from '@/lib/groq'

function LimitWarning({ message }: { message: string }) {
  return (
    <div
      className="monument-text text-center mt-3 px-3 py-2"
      style={{
        background: 'rgba(211, 47, 47, 0.1)',
        borderRadius: '10px',
        color: '#D32F2F',
        fontSize: '9px',
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
  exceeded?: boolean
}

function StepperInput({ value, onDecrement, onIncrement, onChange, min = 0, max, step = 1, label, exceeded = false }: StepperInputProps) {
  const borderColor = exceeded ? '#D32F2F' : '#8B5A3E'
  const textColor = exceeded ? '#D32F2F' : '#6B4423'
  const shadowColor = exceeded ? 'rgba(211, 47, 47, 0.25)' : 'rgba(139, 90, 62, 0.25)'

  return (
    <>
      <label className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <button
          onClick={onDecrement}
          className="monument-button p-2"
          style={{
            background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
            borderRadius: '10px',
            border: '2px solid #8B5A3E',
            boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
          }}
        >
          <Minus size={18} strokeWidth={2.5} color="#6B4423" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value === 0 ? '' : value}
          placeholder="—"
          onChange={e => { const v = parseFloat(e.target.value); onChange(Math.max(min, Math.min(max, isNaN(v) ? 0 : v))) }}
          onFocus={e => e.target.select()}
          className="flex-1 px-3 py-2 monument-text"
          style={{
            background: 'rgba(255, 252, 248, 0.95)',
            border: `2px solid ${borderColor}`,
            borderRadius: '12px',
            color: value === 0 ? '#C4A898' : textColor,
            fontSize: '14px',
            fontWeight: '700',
            boxShadow: `0 4px 0 ${shadowColor}`,
            textAlign: 'center',
          }}
        />
        <button
          onClick={onIncrement}
          className="monument-button p-2"
          style={{
            background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
            borderRadius: '10px',
            border: '2px solid #8B5A3E',
            boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
          }}
        >
          <Plus size={18} strokeWidth={2.5} color="#6B4423" />
        </button>
      </div>
    </>
  )
}

const DEFAULT_SCAN = { water: 0, calories: 0, protein: 0, sugar: 0 }

export function FoodWaterTab() {
  const {
    state, limits, steps, maxes,
    adjustWater, setWater,
    adjustCalories, setCalories,
    adjustProtein, setProtein,
    adjustSugar, setSugar,
    adjustMultivitamins, setMultivitamins,
    weeklyMultivitamins,
    creatineTaken, toggleCreatine,
    celebration,
    simulateAIScan, approveScan, dismissScan,
  } = useNutrition()


  const [scanEditing, setScanEditing] = useState(false)
  const [scanValues, setScanValues] = useState(DEFAULT_SCAN)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(false)
  const [scanDescription, setScanDescription] = useState<string | null>(null)
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [companionMode, setCompanionMode] = useState(false)
  const [companionInput, setCompanionInput] = useState('')
  const [companionLoading, setCompanionLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  const resetScanState = () => {
    setScanValues(DEFAULT_SCAN)
    setScanEditing(false)
    setScanDescription(null)
    setScanError(false)
  }

  const handleCameraPress = () => {
    setShowMediaMenu(false)
    fileInputRef.current?.click()
  }

  const handleFilesPress = () => {
    setShowMediaMenu(false)
    filesInputRef.current?.click()
  }

  const handleMicPress = () => {
    setShowMediaMenu(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SpeechRecognition() as any
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.onresult = async (event: any) => {
      const transcript: string = event.results[0][0].transcript
      resetScanState()
      setScanLoading(true)
      simulateAIScan()
      try {
        const raw = await groqText(`The user described what they ate: "${transcript}". Return ONLY a JSON object (no markdown, no explanation):
{
  "waterDelta": <liters of water content in food, 0-2, number>,
  "caloriesDelta": <total calories, 0-3000, number>,
  "proteinDelta": <protein grams, 0-200, number>,
  "sugarDelta": <sugar grams, 0-100, number>,
  "description": "<brief food description, max 10 words>"
}`)
        const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
        setScanValues({
          water: parsed.waterDelta ?? DEFAULT_SCAN.water,
          calories: parsed.caloriesDelta ?? DEFAULT_SCAN.calories,
          protein: parsed.proteinDelta ?? DEFAULT_SCAN.protein,
          sugar: parsed.sugarDelta ?? DEFAULT_SCAN.sugar,
        })
        setScanDescription(parsed.description ?? transcript)
      } catch {
        setScanError(true)
      } finally {
        setScanLoading(false)
      }
    }
    recognition.onerror = () => { setScanLoading(false); setScanError(true) }
    recognition.start()
  }

  const handleCompanionSend = async () => {
    const input = companionInput.trim()
    if (!input || companionLoading) return
    setCompanionInput('')
    setCompanionLoading(true)
    setScanLoading(true)
    resetScanState()
    simulateAIScan()
    try {
      const raw = await groqText(`The user described what they ate or drank: "${input}". Return ONLY a JSON object (no markdown, no explanation):
{
  "waterDelta": <liters of water, 0-3, number — water/drinks count fully, food has small water content>,
  "caloriesDelta": <total calories, 0-3000, number>,
  "proteinDelta": <protein grams, 0-200, number>,
  "sugarDelta": <sugar grams, 0-150, number>,
  "description": "<concise food name, 2-6 words>"
}`)
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setScanValues({
        water: parsed.waterDelta ?? DEFAULT_SCAN.water,
        calories: parsed.caloriesDelta ?? DEFAULT_SCAN.calories,
        protein: parsed.proteinDelta ?? DEFAULT_SCAN.protein,
        sugar: parsed.sugarDelta ?? DEFAULT_SCAN.sugar,
      })
      setScanDescription(parsed.description ?? input)
    } catch {
      setScanError(true)
    } finally {
      setScanLoading(false)
      setCompanionLoading(false)
      setShowMediaMenu(false)
      setCompanionMode(false)
    }
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    resetScanState()
    setScanLoading(true)
    simulateAIScan()
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const raw = await groqVision(base64, file.type, `You are a nutrition expert. Look at this food image carefully and estimate the nutritional content. Return ONLY a valid JSON object — no markdown, no explanation, no extra text.
{
  "waterDelta": <water content in liters (e.g. a glass of water = 0.25, soup = 0.4, dry food = 0.05), number 0-2>,
  "caloriesDelta": <total calories for the full portion shown, number 0-3000>,
  "proteinDelta": <protein in grams, number 0-200>,
  "sugarDelta": <sugar in grams, number 0-100>,
  "description": "<2-5 word food name>"
}`)
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      setScanValues({
        water: parsed.waterDelta ?? DEFAULT_SCAN.water,
        calories: parsed.caloriesDelta ?? DEFAULT_SCAN.calories,
        protein: parsed.proteinDelta ?? DEFAULT_SCAN.protein,
        sugar: parsed.sugarDelta ?? DEFAULT_SCAN.sugar,
      })
      setScanDescription(parsed.description ?? null)
    } catch {
      setScanError(true)
    } finally {
      setScanLoading(false)
    }
  }

  const handleApproveScan = () => {
    approveScan(scanValues.water, scanValues.calories, scanValues.protein, scanValues.sugar)
    setScanEditing(false)
  }

  const waterExceeded = state.waterLiters > limits.waterLimit
  const caloriesExceeded = state.calories > limits.caloriesLimit
  const proteinExceeded = state.proteinGrams > limits.proteinLimit
  const sugarExceeded = state.sugarGrams > limits.sugarLimit

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2
        className="monument-text mb-6 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Food & Water
      </h2>

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

      {state.uploadedImage && (
        <div className="monument-card p-4 mb-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                {scanLoading ? 'Analysing...' : 'AI Scan Results'}
              </span>
              {scanDescription && !scanLoading && (
                <div className="monument-text mt-0.5" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>{scanDescription}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={dismissScan} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}>
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
              <div className="monument-text" style={{ color: '#D32F2F', fontSize: '11px', fontWeight: '700' }}>Could not read this image</div>
              <div className="monument-text text-center" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>Try a clearer photo or describe your food with the AI Companion</div>
              <button onClick={dismissScan} className="monument-button px-4 py-2" style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '9px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>DISMISS</button>
            </div>
          ) : scanEditing ? (
            /* Edit mode — stepper rows */
            <div>
              {([
                { key: 'water' as const, label: 'Water', unit: 'L', step: 0.5, max: 6 },
                { key: 'calories' as const, label: 'Calories', unit: '', step: 50, max: 1000 },
                { key: 'protein' as const, label: 'Protein', unit: 'g', step: 5, max: 150 },
                { key: 'sugar' as const, label: 'Sugar', unit: 'g', step: 5, max: 100 },
              ] as const).map(({ key, label, unit, step, max }) => (
                <div key={key} className="flex items-center gap-2 mb-3">
                  <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700', width: '52px' }}>{label}</span>
                  <button
                    onClick={() => setScanValues(v => ({ ...v, [key]: Math.max(0, +(v[key] - step).toFixed(2)) }))}
                    className="monument-button p-1.5"
                    style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.2)', flexShrink: 0 }}
                  >
                    <Minus size={12} strokeWidth={2.5} color="#6B4423" />
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={max}
                    step={step}
                    value={scanValues[key]}
                    onChange={e => setScanValues(v => ({ ...v, [key]: Math.max(0, Math.min(max, parseFloat(e.target.value) || 0)) }))}
                    className="flex-1 py-1 monument-text"
                    style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.2)', textAlign: 'center' }}
                  />
                  <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', width: '12px' }}>{unit}</span>
                  <button
                    onClick={() => setScanValues(v => ({ ...v, [key]: Math.min(max, +(v[key] + step).toFixed(2)) }))}
                    className="monument-button p-1.5"
                    style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.2)', flexShrink: 0 }}
                  >
                    <Plus size={12} strokeWidth={2.5} color="#6B4423" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => setScanEditing(false)}
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
                  { value: `${scanValues.water}L`, unit: '', label: 'WATER', color: '#7BAFD4' },
                  { value: `${scanValues.sugar}g`, unit: '', label: 'SUGAR', color: '#C4809A' },
                ].map(({ value, unit, label, color }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center justify-center py-3 px-2"
                    style={{ background: `${color}12`, border: `1.5px solid ${color}40`, borderRadius: '10px' }}
                  >
                    <span className="monument-text" style={{ color, fontSize: '22px', fontWeight: '700', lineHeight: 1 }}>
                      {value}{unit}
                    </span>
                    <span className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '1px' }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setScanEditing(true)}
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
      <div className="monument-card p-5 mb-6">
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
      <div className="monument-card p-5 mb-6">
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
        />
      </div>

      {/* Section: Nutrition */}
      <div className="flex items-center gap-2 mb-3">
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
        <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1.5px' }}>NUTRITION</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(139, 90, 62, 0.2)' }} />
      </div>

      {/* Calories */}
      <div className="monument-card p-5 mb-6">
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
      </div>

      {/* Protein */}
      <div className="monument-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Beef size={18} strokeWidth={2.5} color={proteinExceeded ? '#D32F2F' : '#C4856A'} />
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
            exceeded={proteinExceeded}
          />
        </div>
        <PixelBar
          label="PROTEIN"
          value={state.proteinGrams}
          max={maxes.protein}
          target={limits.proteinTarget}
          color={proteinExceeded ? '#D32F2F' : '#C4856A'}
          unit="g"
        />
        {proteinExceeded && <LimitWarning message="PROTEIN LIMIT EXCEEDED" />}
      </div>

      {/* Sugar */}
      <div className="monument-card p-5 mb-6">
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
      <div className="monument-card p-5 mb-6">
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
          />
        </div>
        <PixelBar
          label="WEEK"
          value={weeklyMultivitamins}
          max={3}
          color="#8BAF8C"
        />
        <div className="monument-text mt-1 text-right" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>
          resets every Saturday
        </div>
      </div>


      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelected} />
      <input ref={filesInputRef} type="file" accept="image/*,application/pdf,text/*" style={{ display: 'none' }} onChange={handleFileSelected} />

      {/* Drop-up media menu */}
      {showMediaMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { if (!companionMode) setShowMediaMenu(false) }} />
          <div className="fixed z-50 flex flex-col gap-2 items-end" style={{ bottom: '176px', right: '16px' }}>
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
                  <button onClick={() => { setCompanionMode(false); setShowMediaMenu(false) }} className="monument-button" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={companionInput}
                      onChange={e => setCompanionInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCompanionSend()}
                      placeholder={companionLoading ? 'Analysing...' : 'e.g. chicken salad, 2 eggs, protein shake...'}
                      disabled={companionLoading}
                      autoFocus
                      className="flex-1 px-4 monument-text"
                      style={{ height: 48, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '11px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)', outline: 'none' }}
                    />
                    <button
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
                ]).map(({ label, icon: Icon, onClick }) => (
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
