import { useId, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { Moon, Zap, Plus, Minus } from 'lucide-react'
import { PixelBar } from '@/app/components/shared'
import { useHealthData } from '@/contexts/HealthDataContext'

const STEP_BUTTON_STYLE = { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' } as const
const INPUT_STYLE = { background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', textAlign: 'center' } as const
const STATUS_STYLE = { color: '#8B5A3E', fontSize: '11px', fontWeight: '700' } as const
const AXIS_TICK = { fill: '#A0725A', fontSize: 10, fontFamily: 'Poppins', fontWeight: 700 } as const

function StepButton({ kind, label, onClick, disabled }: { kind: 'dec' | 'inc'; label: string; onClick: () => void; disabled: boolean }) {
  const Icon = kind === 'dec' ? Minus : Plus
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="monument-button w-10 h-10 flex-shrink-0 flex items-center justify-center"
      style={{ ...STEP_BUTTON_STYLE, opacity: disabled ? 0.45 : 1 }}
    >
      <Icon size={16} strokeWidth={2.5} color="#6B4423" />
    </button>
  )
}

interface StepperProps {
  label: string
  /** Noun used in button labels, e.g. "sleep hours" */
  name: string
  value: number
  onDecrement: () => void
  onIncrement: () => void
  onChange: (val: number) => void
  min?: number
  max: number
  step?: number
}

/** Number stepper. Keeps a local draft while typing so the field can be cleared
 *  without snapping back to 0; commits finite whole numbers, clamped to [min, max]. */
function Stepper({ label, name, value, onDecrement, onIncrement, onChange, min = 0, max, step = 1 }: StepperProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
        {label}
      </label>
      <div className="flex gap-1.5 items-center">
        <StepButton kind="dec" label={`Decrease ${name}`} onClick={onDecrement} disabled={value <= min} />
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={draft ?? value}
          onChange={e => {
            const raw = e.target.value
            setDraft(raw)
            const n = Number(raw)
            if (raw.trim() !== '' && Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.trunc(n))))
          }}
          onBlur={() => setDraft(null)}
          className="flex-1 min-w-0 w-full px-2 py-2 monument-text"
          style={INPUT_STYLE}
        />
        <StepButton kind="inc" label={`Increase ${name}`} onClick={onIncrement} disabled={value >= max} />
      </div>
    </div>
  )
}

export function SleepTab() {
  const {
    state,
    totalSleepHours,
    constants,
    loadError, saveError,
    sleepStatus, fitbitSynced,
    weeklyChartData,
    adjustSleepHours, setSleepHours,
    adjustSleepMinutes, setSleepMinutes,
    adjustEnergy, setEnergy,
    refreshFitbitSleep, retryLoad, retrySave,
  } = useHealthData().sleep

  const maxSleepVal = weeklyChartData.reduce((m, d) => Math.max(m, Number.isFinite(d.sleep) ? d.sleep : 0), 0)
  // Capped so a bad value can never build a huge tick array
  const yMax = Math.min(24, Math.max(10, Math.ceil(maxSleepVal / 2) * 2 + 2))
  const yTicks = Array.from({ length: Math.floor(yMax / 2) + 1 }, (_, i) => i * 2)
  const hasChartData = weeklyChartData.some(d => d.sleep > 0 || d.energy > 0)

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2
        className="monument-text mb-6 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Sleep & Energy
      </h2>

      {(loadError || saveError) && (
        <div role="alert" className="monument-card px-4 py-3 mb-6 flex items-center justify-between gap-3">
          <span className="monument-text" style={STATUS_STYLE}>
            {loadError ? "Couldn't load today's log — changes won't save yet" : 'Not saved — check your connection'}
          </span>
          <button
            type="button"
            onClick={loadError ? retryLoad : retrySave}
            className="monument-button px-3 min-h-10 flex-shrink-0 monument-text"
            style={{ ...STEP_BUTTON_STYLE, color: '#6B4423', fontSize: '11px', fontWeight: '700' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Sleep Duration */}
      <div className="monument-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Moon size={18} strokeWidth={2.5} color="#FF9F66" />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Sleep Duration</div>
        </div>
        <div className="flex gap-3 mb-3">
          <Stepper
            label="Hours"
            name="sleep hours"
            value={state.sleepHours}
            onDecrement={() => adjustSleepHours(-1)}
            onIncrement={() => adjustSleepHours(1)}
            onChange={v => setSleepHours(v)}
            max={constants.hoursMax}
          />
          <Stepper
            label="Minutes"
            name="sleep minutes"
            value={state.sleepMinutes}
            onDecrement={() => adjustSleepMinutes(-constants.minutesStep)}
            onIncrement={() => adjustSleepMinutes(constants.minutesStep)}
            onChange={v => setSleepMinutes(v)}
            max={constants.minutesMax}
            step={constants.minutesStep}
          />
        </div>
        <PixelBar
          label="SLEEP"
          value={totalSleepHours}
          max={constants.hoursMax}
          target={9}
          color="#9B7FC8"
          overThreshold={9 + 10 / 60}
        />
        {sleepStatus === 'not_connected' ? null : sleepStatus === 'error' ? (
          <div className="monument-text text-center mt-3" style={STATUS_STYLE}>
            Couldn't reach Fitbit — sleep sync unavailable right now.{' '}
            <button type="button" onClick={refreshFitbitSleep} className="underline" style={{ color: '#6B4423', fontWeight: 700 }}>
              Retry
            </button>
          </div>
        ) : fitbitSynced ? (
          <div className="monument-text text-center mt-3" style={STATUS_STYLE}>
            Synced from Fitbit — edit above to override
          </div>
        ) : null}
      </div>

      {/* Energy Level */}
      <div className="monument-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} strokeWidth={2.5} color="#FFB88A" />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Energy Level</div>
        </div>
        <div className="mb-3">
          <Stepper
            label="Rate 0-10"
            name="energy"
            value={state.energyLevel}
            onDecrement={() => adjustEnergy(-1)}
            onIncrement={() => adjustEnergy(1)}
            onChange={v => setEnergy(v)}
            max={constants.energyMax}
          />
        </div>
        <PixelBar
          label="ENERGY"
          value={state.energyLevel}
          max={constants.energyMax}
          color="#FFD166"
          icon={<Zap size={18} strokeWidth={2.5} />}
        />
      </div>

      {/* Weekly Chart */}
      <div className="monument-card p-5">
        <div className="monument-text text-center mb-4" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
          Weekly Overview
        </div>
        <div className="relative" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(160, 114, 90, 0.2)" />
              <XAxis
                dataKey="day"
                tick={AXIS_TICK}
                axisLine={{ stroke: 'rgba(160, 114, 90, 0.2)' }}
              />
              <YAxis
                yAxisId="hours"
                tick={AXIS_TICK}
                axisLine={{ stroke: 'rgba(160, 114, 90, 0.2)' }}
                domain={[0, yMax]}
                ticks={yTicks}
                width={28}
              />
              <YAxis
                yAxisId="energy"
                orientation="right"
                tick={AXIS_TICK}
                axisLine={{ stroke: 'rgba(160, 114, 90, 0.2)' }}
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                width={24}
              />
              <Legend
                verticalAlign="top"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontFamily: 'Poppins', fontSize: 10, fontWeight: 700, color: '#8B5A3E' }}
              />
              <Tooltip
                cursor={{ fill: 'rgba(160,114,90,0.08)' }}
                contentStyle={{ borderRadius: 12, border: '2px solid #8B5A3E', background: '#FFF8F0', fontFamily: 'Poppins', fontSize: 11, fontWeight: 700, color: '#6B4423' }}
              />
              <Bar yAxisId="hours" dataKey="sleep" name="Sleep (h)" fill="#9B7FC8" radius={[8, 8, 0, 0]} />
              <Bar yAxisId="energy" dataKey="energy" name="Energy (0-10)" fill="#FFD166" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {!hasChartData && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="monument-text text-center px-3 py-2" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700', background: 'rgba(255,252,248,0.85)', borderRadius: '10px' }}>
                Log sleep to see your weekly overview
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
