import { useState, useRef } from 'react'
import { Dumbbell, Apple, BarChart3, Moon, Calendar, Settings, Plus, Minus, X, LogOut, ChevronLeft } from 'lucide-react'
import { WorkoutTab } from './components/features/workout'
import { WorkoutMode } from './components/features/workout/WorkoutMode'
import { FoodWaterTab } from './components/features/nutrition'
import { OverviewTab } from './components/features/overview'
import { SleepTab } from './components/features/sleep'
import { LogTab } from './components/features/log'
import { AuthPage } from './components/auth/AuthPage'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { HealthDataProvider } from '@/contexts/HealthDataContext'
import { UserSettingsProvider, useUserSettings, AVATAR_SPRITES, type UserSettings } from '@/contexts/UserSettingsContext'

interface TabConfig {
  name: string
  icon: typeof Dumbbell
}

const NAV_TABS: TabConfig[] = [
  { name: 'WORKOUT',       icon: Dumbbell  },
  { name: 'FOOD+WATER',    icon: Apple     },
  { name: 'OVERVIEW',      icon: BarChart3 },
  { name: 'SLEEP+ENERGY',  icon: Moon      },
  { name: 'LOG',           icon: Calendar  },
]

const BTN = {
  background: 'linear-gradient(135deg,#FF9F66,#FFB88A)',
  borderRadius: '10px',
  border: '2px solid #8B5A3E',
  boxShadow: '0 4px 0 rgba(139,90,62,0.25)',
} as const

// Defined outside SettingsModal so its identity is stable across re-renders.
// If it were inside, every setDraft call would create a new function reference,
// React would unmount/remount it, and timerRef would reset — leaking the timer.
function SettingsRow({ label, unit, value, min, max, onDecrement, onIncrement, onSet }: {
  label: string; unit: string; value: number; min: number; max: number
  onDecrement: () => void; onIncrement: () => void; onSet: (v: number) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopRepeat = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const startRepeat = (action: () => void) => {
    action()
    let delay = 500
    const tick = () => {
      action()
      delay = Math.max(80, Math.floor(delay * 0.82))
      timerRef.current = setTimeout(tick, delay)
    }
    timerRef.current = setTimeout(tick, 600)
  }

  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(139,90,62,0.1)' }}>
      <div>
        <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>{label}</div>
        <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px' }}>{unit}</div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onPointerDown={() => startRepeat(onDecrement)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
          className="monument-button flex items-center justify-center"
          style={{ ...BTN, width: 32, height: 32 }}
        >
          <Minus size={13} strokeWidth={2.5} color="#6B4423" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onSet(Math.min(max, Math.max(min, v)))
          }}
          onFocus={e => e.target.select()}
          className="monument-text"
          style={{
            width: '52px', textAlign: 'center', background: 'transparent',
            border: 'none', outline: 'none', color: '#6B4423',
            fontSize: '15px', fontWeight: '700',
          }}
        />
        <button
          onPointerDown={() => startRepeat(onIncrement)}
          onPointerUp={stopRepeat}
          onPointerLeave={stopRepeat}
          onPointerCancel={stopRepeat}
          className="monument-button flex items-center justify-center"
          style={{ ...BTN, width: 32, height: 32 }}
        >
          <Plus size={13} strokeWidth={2.5} color="#6B4423" />
        </button>
      </div>
    </div>
  )
}

function SettingsModal({ onClose, onboarding = false }: { onClose: () => void; onboarding?: boolean }) {
  const { settings: saved, saveSettings } = useUserSettings()
  const [draft, setDraft] = useState<UserSettings>(saved)
  const [syncing, setSyncing] = useState(false)

  const handleSave = async () => {
    setSyncing(true)
    try { await saveSettings(draft) } catch (e) { console.error(e) } finally { setSyncing(false) }
    onClose()
  }

  const AVATARS = Object.entries(AVATAR_SPRITES).map(([id, sprite]) => ({ id, sprite }))

  const SectionLabel = ({ children }: { children: string }) => (
    <div className="monument-text mb-2" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1px' }}>{children}</div>
  )

  const row = (field: keyof UserSettings, step: number, min: number, max: number) => ({
    value: draft[field] as number,
    min, max,
    onDecrement: () => setDraft(s => ({ ...s, [field]: Math.min(max, Math.max(min, (s[field] as number) - step)) })),
    onIncrement: () => setDraft(s => ({ ...s, [field]: Math.min(max, Math.max(min, (s[field] as number) + step)) })),
    onSet: (v: number) => setDraft(s => ({ ...s, [field]: v })),
  })

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{ background: 'rgba(107,68,35,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm flex flex-col"
        style={{
          background: '#FDF6EE',
          borderRadius: '20px 20px 0 0',
          border: '2px solid rgba(139,90,62,0.25)',
          borderBottom: 'none',
          boxShadow: '0 -8px 32px rgba(107,68,35,0.18)',
          padding: '0 0 env(safe-area-inset-bottom)',
          maxHeight: '82vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle + header */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3">
          <div className="mx-auto mb-3" style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(139,90,62,0.25)' }} />
          {onboarding ? (
            <div className="text-center mb-1">
              <div className="monument-text" style={{ color: '#6B4423', fontSize: '17px', fontWeight: '800' }}>Welcome!</div>
              <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px' }}>Set up your goals & companion to get started</div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="monument-text" style={{ color: '#6B4423', fontSize: '15px', fontWeight: '700', letterSpacing: '0.5px' }}>SETTINGS</span>
              <button onClick={onClose} className="monument-button flex items-center justify-center" style={{ ...BTN, width: 30, height: 30 }}>
                <X size={13} strokeWidth={2.5} color="#6B4423" />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">

          {/* Avatar */}
          <SectionLabel>COMPANION</SectionLabel>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {AVATARS.map((av) => {
              const active = draft.avatar === av.id
              return (
                <button
                  key={av.id}
                  onClick={() => setDraft(s => ({ ...s, avatar: av.id }))}
                  className="monument-button flex flex-col items-center justify-center gap-1"
                  style={{
                    height: 64,
                    borderRadius: '14px',
                    background: active ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.9)',
                    border: active ? '2px solid #8B5A3E' : '1.5px solid rgba(139,90,62,0.2)',
                    boxShadow: active ? '0 3px 0 rgba(139,90,62,0.25)' : 'none',
                  }}
                >
                  <img src={av.sprite} alt={av.id} style={{ width: 36, height: 36, imageRendering: 'pixelated' }} />
                  <span className="monument-text" style={{ fontSize: '7px', fontWeight: '700', color: active ? '#6B4423' : '#A0725A', letterSpacing: '0.5px', textTransform: 'capitalize' }}>{av.id}</span>
                </button>
              )
            })}
          </div>

          {/* Daily Goals */}
          <SectionLabel>DAILY GOALS</SectionLabel>
          <div className="mb-4" style={{ background: 'rgba(255,252,248,0.9)', borderRadius: '14px', border: '1.5px solid rgba(139,90,62,0.15)', overflow: 'hidden', padding: '0 14px' }}>
            <SettingsRow label="Water" unit="liters / day" {...row('waterTarget', 0.5, 0.5, 10)} />
            <SettingsRow label="Calories" unit="kcal / day" {...row('caloriesTarget', 100, 500, 6000)} />
            <SettingsRow label="Protein" unit="grams / day" {...row('proteinTarget', 5, 10, 400)} />
            <SettingsRow label="Cardio" unit="minutes / week" {...row('cardioTarget', 10, 10, 600)} />
          </div>

          {/* Body Metrics */}
          <SectionLabel>BODY METRICS</SectionLabel>
          <div className="mb-4" style={{ background: 'rgba(255,252,248,0.9)', borderRadius: '14px', border: '1.5px solid rgba(139,90,62,0.15)', overflow: 'hidden', padding: '0 14px' }}>
            <SettingsRow label="Weight" unit="kg" {...row('weightKg', 1, 20, 300)} />
            <SettingsRow label="Height" unit="cm" {...row('heightCm', 1, 100, 250)} />
            <SettingsRow label="Streak" unit="days" {...row('streakDays', 1, 0, 9999)} />
          </div>
        </div>

        {/* Save */}
        <div className="flex-shrink-0 px-5 pb-5 pt-2">
          <button
            onClick={handleSave}
            className="monument-button w-full py-3.5"
            style={{ ...BTN, color: '#6B4423', fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}
          >
            {syncing ? 'SAVING...' : onboarding ? "LET'S GO →" : 'SAVE SETTINGS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AppShell() {
  const { user, loading, signOut } = useAuth()
  const { isNewUser, loaded: settingsLoaded } = useUserSettings()
  const [activeTab, setActiveTab] = useState(2)
  const [showSettings, setShowSettings] = useState(false)
  const [workoutModeActive, setWorkoutModeActive] = useState(false)
  const [workoutModeTab, setWorkoutModeTab] = useState<'today' | 'previous'>('today')

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center" style={{ background: '#F5E6D3' }}>
        <div className="monument-text soft-pulse" style={{ color: '#8B5A3E', fontSize: '12px', fontWeight: '700' }}>Loading...</div>
      </div>
    )
  }

  if (!user) return <AuthPage />

  const iconBtnStyle = {
    position: 'absolute' as const,
    top: '12px',
    zIndex: 20,
    background: 'rgba(255,252,248,0.85)',
    border: '1.5px solid rgba(139,90,62,0.35)',
    borderRadius: '10px',
    padding: '6px 8px',
    backdropFilter: 'blur(6px)',
  }

  return (
    <div className="size-full flex flex-col relative overflow-hidden" style={{ background: '#F5E6D3' }}>
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 800">
          <defs>
            <linearGradient id="wave1" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#FFE5CC', stopOpacity: 0.6 }} />
              <stop offset="100%" style={{ stopColor: '#FFDBB8', stopOpacity: 0.6 }} />
            </linearGradient>
            <linearGradient id="wave2" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#FFDBB8', stopOpacity: 0.7 }} />
              <stop offset="100%" style={{ stopColor: '#FFCFA3', stopOpacity: 0.7 }} />
            </linearGradient>
            <linearGradient id="wave3" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#FFCFA3', stopOpacity: 0.8 }} />
              <stop offset="100%" style={{ stopColor: '#FFC194', stopOpacity: 0.8 }} />
            </linearGradient>
          </defs>
          <path d="M 0 80 Q 100 40 200 80 T 400 80 L 400 0 L 0 0 Z" fill="url(#wave1)" />
          <path d="M 0 300 Q 120 260 240 300 T 400 300 L 400 0 L 0 0 Z" fill="url(#wave2)" />
          <path d="M 0 600 Q 100 560 200 600 T 400 600 L 400 0 L 0 0 Z" fill="url(#wave3)" />
          <path d="M 0 720 Q 120 680 240 720 T 400 720 L 400 800 L 0 800 Z" fill="#FFB88A" opacity="0.5" />
        </svg>
        <div className="absolute top-20 left-8" style={{ opacity: 0.15 }}>
          <svg width="24" height="24" viewBox="0 0 24 24">
            <ellipse cx="12" cy="16" rx="4" ry="5" fill="#8B5A3E" />
            <ellipse cx="7" cy="10" rx="2.5" ry="3" fill="#8B5A3E" />
            <ellipse cx="12" cy="8" rx="2.5" ry="3" fill="#8B5A3E" />
            <ellipse cx="17" cy="10" rx="2.5" ry="3" fill="#8B5A3E" />
          </svg>
        </div>
        <div className="absolute top-40 right-12" style={{ opacity: 0.12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <ellipse cx="12" cy="16" rx="4" ry="5" fill="#8B5A3E" />
            <ellipse cx="7" cy="10" rx="2.5" ry="3" fill="#8B5A3E" />
            <ellipse cx="12" cy="8" rx="2.5" ry="3" fill="#8B5A3E" />
            <ellipse cx="17" cy="10" rx="2.5" ry="3" fill="#8B5A3E" />
          </svg>
        </div>
      </div>

      {/* Settings + Log buttons — only visible on LOG tab (not in workout mode) */}
      {!workoutModeActive && activeTab === 4 && (
        <>
          <button
            onClick={() => setShowSettings(true)}
            className="monument-button"
            aria-label="Settings"
            style={{ ...iconBtnStyle, left: '14px' }}
          >
            <Settings size={16} color="#8B5A3E" strokeWidth={2} />
          </button>
          <button
            onClick={signOut}
            className="monument-button"
            aria-label="Sign out"
            style={{ ...iconBtnStyle, right: '14px' }}
          >
            <LogOut size={16} color="#8B5A3E" strokeWidth={2} />
          </button>
        </>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-auto relative" style={{ zIndex: 1 }}>
        {workoutModeActive ? (
          <WorkoutMode currentView={workoutModeTab} />
        ) : (
          <>
            <div style={{ display: activeTab === 0 ? 'block' : 'none', height: '100%' }}>
              <WorkoutTab onEnterWorkoutMode={() => { setWorkoutModeActive(true); setWorkoutModeTab('today') }} />
            </div>
            <div style={{ display: activeTab === 1 ? 'block' : 'none', height: '100%' }}><FoodWaterTab /></div>
            <div style={{ display: activeTab === 2 ? 'block' : 'none', height: '100%' }}><OverviewTab /></div>
            <div style={{ display: activeTab === 3 ? 'block' : 'none', height: '100%' }}><SleepTab /></div>
            <div style={{ display: activeTab === 4 ? 'block' : 'none', height: '100%' }}><LogTab isActive={activeTab === 4} /></div>
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav
        className="flex justify-around items-center py-3 px-2 relative"
        style={{ background: 'rgba(255,245,230,0.95)', borderTop: '2px solid rgba(139,90,62,0.2)', backdropFilter: 'blur(10px)', zIndex: 10 }}
      >
        {workoutModeActive ? (
          /* ── Workout mode nav: back + Today + Previous ── */
          <>
            {/* Back button */}
            <button
              onClick={() => setWorkoutModeActive(false)}
              className="monument-button flex flex-col items-center gap-1"
              style={{ background: 'transparent', border: 'none', padding: '4px' }}
              aria-label="Back"
            >
              <div className="flex items-center justify-center" style={{ width: '32px', height: '32px', borderRadius: '50%' }}>
                <ChevronLeft size={22} color="#8B5A3E" strokeWidth={2.5} />
              </div>
              <span className="monument-text" style={{ fontSize: '8px', fontWeight: '700', color: '#A0725A', letterSpacing: '0.5px' }}>BACK</span>
            </button>

            {/* Today tab */}
            {(['today', 'previous'] as const).map(view => {
              const isActive = workoutModeTab === view
              return (
                <button
                  key={view}
                  onClick={() => setWorkoutModeTab(view)}
                  className="monument-button transition-all flex flex-col items-center gap-1"
                  style={{ background: 'transparent', border: 'none', padding: '4px' }}
                  aria-label={view}
                >
                  <div
                    className="flex items-center justify-center transition-all"
                    style={{
                      width: isActive ? '44px' : '32px',
                      height: isActive ? '44px' : '32px',
                      borderRadius: '50%',
                      background: isActive ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'transparent',
                      boxShadow: isActive ? '0 4px 16px rgba(255,159,102,0.5),0 0 24px rgba(255,184,138,0.3)' : 'none',
                    }}
                  >
                    {view === 'today'
                      ? <Plus size={isActive ? 22 : 18} color={isActive ? '#6B4423' : '#8B5A3E'} strokeWidth={2} />
                      : <Calendar size={isActive ? 22 : 18} color={isActive ? '#6B4423' : '#8B5A3E'} strokeWidth={2} />
                    }
                  </div>
                  <span className="monument-text" style={{ fontSize: '8px', fontWeight: '700', color: isActive ? '#FF9F66' : '#A0725A', letterSpacing: '0.5px' }}>
                    {view.toUpperCase()}
                  </span>
                </button>
              )
            })}

            {/* Spacer to balance layout */}
            <div style={{ width: '48px' }} />
          </>
        ) : (
          /* ── Normal 5-tab nav ── */
          NAV_TABS.map((tab, index) => {
            const Icon = tab.icon
            const isActive = activeTab === index
            return (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className="monument-button transition-all flex flex-col items-center gap-1"
                style={{ background: 'transparent', border: 'none', padding: '4px' }}
                aria-label={tab.name}
                aria-current={isActive ? 'page' : undefined}
              >
                <div
                  className="flex items-center justify-center transition-all"
                  style={{
                    width: isActive ? '44px' : '32px',
                    height: isActive ? '44px' : '32px',
                    borderRadius: '50%',
                    background: isActive ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'transparent',
                    boxShadow: isActive ? '0 4px 16px rgba(255,159,102,0.5),0 0 24px rgba(255,184,138,0.3)' : 'none',
                  }}
                >
                  <Icon size={isActive ? 22 : 18} color={isActive ? '#6B4423' : '#8B5A3E'} strokeWidth={2} />
                </div>
                <span className="monument-text" style={{ fontSize: '8px', fontWeight: '700', color: isActive ? '#FF9F66' : '#A0725A', letterSpacing: '0.5px' }}>
                  {tab.name.split('+')[0]}
                </span>
              </button>
            )
          })
        )}
      </nav>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {!showSettings && settingsLoaded && isNewUser && <SettingsModal onClose={() => {}} onboarding />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <UserSettingsProvider>
        <HealthDataProvider>
          <AppShell />
        </HealthDataProvider>
      </UserSettingsProvider>
    </AuthProvider>
  )
}
