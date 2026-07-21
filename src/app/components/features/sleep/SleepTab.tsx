import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Moon, Zap, Plus, Minus } from 'lucide-react'
import { PixelBar } from '@/app/components/shared'
import { useHealthData } from '@/contexts/HealthDataContext'

interface SleepStepperProps {
  label: string
  value: number
  onDecrement: () => void
  onIncrement: () => void
  onChange: (val: number) => void
  min?: number
  max: number
  step?: number
}

function SleepStepper({ label, value, onDecrement, onIncrement, onChange, min = 0, max, step = 1 }: SleepStepperProps) {
  return (
    <div className="flex-1">
      <label className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
        {label}
      </label>
      <div className="flex gap-1 items-center">
        <button
          onClick={onDecrement}
          className="monument-button p-1.5"
          style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
        >
          <Minus size={14} strokeWidth={2.5} color="#6B4423" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Math.max(0, Math.min(max, parseInt(e.target.value) || 0)))}
          className="flex-1 px-2 py-2 monument-text"
          style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', textAlign: 'center' }}
        />
        <button
          onClick={onIncrement}
          className="monument-button p-1.5"
          style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
        >
          <Plus size={14} strokeWidth={2.5} color="#6B4423" />
        </button>
      </div>
    </div>
  )
}

export function SleepTab() {
  const {
    state,
    totalSleepHours,
    constants,
    weeklyChartData,
    adjustSleepHours, setSleepHours,
    adjustSleepMinutes, setSleepMinutes,
    adjustEnergy, setEnergy,
  } = useHealthData().sleep

  const maxSleepVal = weeklyChartData.reduce((m, d) => Math.max(m, d.sleep), 0)
  const yMax = Math.max(10, Math.ceil(maxSleepVal / 2) * 2 + 2)
  const yTicks = Array.from({ length: Math.floor(yMax / 2) + 1 }, (_, i) => i * 2)

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2
        className="monument-text mb-6 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Sleep & Energy
      </h2>

      {/* Sleep Duration */}
      <div className="monument-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Moon size={18} strokeWidth={2.5} color="#FF9F66" />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Sleep Duration</div>
        </div>
        <div className="flex gap-3 mb-3">
          <SleepStepper
            label="Hours"
            value={state.sleepHours}
            onDecrement={() => adjustSleepHours(-1)}
            onIncrement={() => adjustSleepHours(1)}
            onChange={v => setSleepHours(v)}
            max={constants.hoursMax}
          />
          <SleepStepper
            label="Minutes"
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
      </div>

      {/* Energy Level */}
      <div className="monument-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} strokeWidth={2.5} color="#FFB88A" />
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>Energy Level</div>
        </div>
        <div className="mb-3">
          <label className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
            Rate 0-10
          </label>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => adjustEnergy(-1)}
              className="monument-button p-2"
              style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
            >
              <Minus size={18} strokeWidth={2.5} color="#6B4423" />
            </button>
            <input
              type="number"
              min={0}
              max={constants.energyMax}
              value={state.energyLevel}
              onChange={e => setEnergy(Math.max(0, Math.min(constants.energyMax, parseInt(e.target.value) || 0)))}
              className="flex-1 px-3 py-2 monument-text"
              style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', textAlign: 'center' }}
            />
            <button
              onClick={() => adjustEnergy(1)}
              className="monument-button p-2"
              style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
            >
              <Plus size={18} strokeWidth={2.5} color="#6B4423" />
            </button>
          </div>
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
        {weeklyChartData.length === 0 && (
          <div className="monument-text text-center pb-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>Log sleep to see your weekly overview</div>
        )}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weeklyChartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(160, 114, 90, 0.2)" />
            <XAxis
              dataKey="day"
              tick={{ fill: '#A0725A', fontSize: 10, fontFamily: 'Poppins', fontWeight: 700 }}
              axisLine={{ stroke: 'rgba(160, 114, 90, 0.2)' }}
            />
            <YAxis
              tick={{ fill: '#A0725A', fontSize: 10, fontFamily: 'Poppins', fontWeight: 700 }}
              axisLine={{ stroke: 'rgba(160, 114, 90, 0.2)' }}
              domain={[0, yMax]}
              ticks={yTicks}
            />
            <Bar dataKey="sleep" fill="#9B7FC8" radius={[8, 8, 0, 0]} />
            <Bar dataKey="energy" fill="#FFD166" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
