import { useState, useEffect } from 'react'
import { Dumbbell, Apple, BarChart3, Moon, Calendar, Settings, Plus, Minus, X, LogOut } from 'lucide-react'
import { WorkoutTab } from './components/features/workout'
import { FoodWaterTab } from './components/features/nutrition'
import { OverviewTab } from './components/features/overview'
import { SleepTab } from './components/features/sleep'
import { LogTab } from './components/features/log'
import { AuthPage } from './components/auth/AuthPage'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface TabConfig {
  name: string
  component: React.ReactNode
  icon: typeof Dumbbell
}

const TABS: TabConfig[] = [
  { name: 'WORKOUT',    component: <WorkoutTab />,   icon: Dumbbell  },
  { name: 'FOOD+WATER', component: <FoodWaterTab />, icon: Apple     },
  { name: 'OVERVIEW',  component: <OverviewTab />,   icon: BarChart3 },
  { name: 'SLEEP+ENERGY', component: <SleepTab />,  icon: Moon      },
  { name: 'LOG',        component: <LogTab />,       icon: Calendar  },
]

const SETTINGS_KEY = 'vg_settings_v1'

interface UserSettings {
  waterTarget: number
  caloriesTarget: number
  proteinTarget: number
  weightKg: number
  heightCm: number
  avatar: string
}

const DEFAULT_SETTINGS: UserSettings = {
  waterTarget: 3,
  caloriesTarget: 2500,
  proteinTarget: 110,
  weightKg: 70,
  heightCm: 175,
  avatar: 'chimchar',
}

function loadSettings(): UserSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } }
  catch { return DEFAULT_SETTINGS }
}

const BTN = {
  background: 'linear-gradient(135deg,#FF9F66,#FFB88A)',
  borderRadius: '10px',
  border: '2px solid #8B5A3E',
  boxShadow: '0 4px 0 rgba(139,90,62,0.25)',
} as const

const INPUT = {
  background: 'rgba(255,252,248,0.95)',
  border: '2px solid #8B5A3E',
  borderRadius: '10px',
  color: '#6B4423',
  fontSize: '16px',
  fontWeight: '700',
  boxShadow: '0 3px 0 rgba(139,90,62,0.2)',
  textAlign: 'center' as const,
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<'goals' | 'metrics'>('goals')
  const [settings, setSettings] = useState<UserSettings>(loadSettings)
  const [syncing, setSyncing] = useState(false)

  // Load from Supabase on open — overrides localStorage with server values
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_profiles')
      .select('water_target,calories_target,protein_target,weight_kg,height_cm,avatar')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const merged: UserSettings = {
          waterTarget:    Number(data.water_target)    || DEFAULT_SETTINGS.waterTarget,
          caloriesTarget: Number(data.calories_target) || DEFAULT_SETTINGS.caloriesTarget,
          proteinTarget:  Number(data.protein_target)  || DEFAULT_SETTINGS.proteinTarget,
          weightKg:       Number(data.weight_kg)       || DEFAULT_SETTINGS.weightKg,
          heightCm:       Number(data.height_cm)       || DEFAULT_SETTINGS.heightCm,
          avatar:         data.avatar                  ?? DEFAULT_SETTINGS.avatar,
        }
        setSettings(merged)
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
      })
  }, [user])

  const set = (patch: Partial<UserSettings>) => setSettings(s => ({ ...s, ...patch }))

  const handleSave = async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    if (user) {
      setSyncing(true)
      try {
        await supabase.from('user_profiles').upsert({
          user_id:         user.id,
          water_target:    settings.waterTarget,
          calories_target: settings.caloriesTarget,
          protein_target:  settings.proteinTarget,
          weight_kg:       settings.weightKg,
          height_cm:       settings.heightCm,
          avatar:          settings.avatar,
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'user_id' })
      } catch (e) {
        console.error('Settings save failed:', e)
      } finally {
        setSyncing(false)
      }
    }
    onClose()
  }

  const NumRow = ({ label, field, step, min, max }: {
    label: string
    field: keyof UserSettings
    step: number
    min: number
    max: number
  }) => {
    const val = settings[field] as number
    return (
      <div className="mb-5">
        <div className="monument-text mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px' }}>{label}</div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => set({ [field]: Math.max(min, val - step) })}
            className="monument-button p-3" style={BTN}
          >
            <Minus size={16} strokeWidth={2.5} color="#6B4423" />
          </button>
          <input
            type="number" value={val}
            onChange={e => set({ [field]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
            onFocus={e => e.target.select()}
            className="flex-1 px-3 py-3 monument-text"
            style={INPUT}
          />
          <button
            onClick={() => set({ [field]: Math.min(max, val + step) })}
            className="monument-button p-3" style={BTN}
          >
            <Plus size={16} strokeWidth={2.5} color="#6B4423" />
          </button>
        </div>
      </div>
    )
  }

  const AVATARS = [
    { id: 'chimchar', sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/chimchar.gif' },
    { id: 'piplup',   sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/piplup.gif' },
    { id: 'turtwig',  sprite: 'https://img.pokemondb.net/sprites/black-white/anim/normal/turtwig.gif' },
    { id: 'pikachu',  sprite: 'https://img.pokemondb.net/sprites/black-white/normal/pikachu-f.png' },
  ]

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(107,68,35,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="monument-card w-full max-w-sm max-h-[88vh] flex flex-col"
        style={{ padding: '24px 20px 20px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <span className="monument-text" style={{ color: '#6B4423', fontSize: '16px', fontWeight: '700', letterSpacing: '0.5px' }}>SETTINGS</span>
          <button onClick={onClose} className="monument-button" style={{ ...BTN, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} strokeWidth={2.5} color="#6B4423" />
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-2 mb-5 flex-shrink-0">
          {(['goals', 'metrics'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="monument-button flex-1 py-2.5"
              style={{
                background: tab === t ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)',
                borderRadius: '10px',
                border: `2px solid ${tab === t ? '#8B5A3E' : 'rgba(139,90,62,0.3)'}`,
                color: tab === t ? '#6B4423' : '#A0725A',
                fontSize: '11px', fontWeight: '700',
                boxShadow: tab === t ? '0 3px 0 rgba(139,90,62,0.25)' : 'none',
              }}
            >
              {t === 'goals' ? 'DAILY GOALS' : 'BODY METRICS'}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'goals' && (
            <>
              <NumRow label="WATER (LITERS)" field="waterTarget" step={0.5} min={0.5} max={10} />
              <NumRow label="CALORIES" field="caloriesTarget" step={100} min={500} max={6000} />
              <NumRow label="PROTEIN (GRAMS)" field="proteinTarget" step={5} min={10} max={400} />
            </>
          )}

          {tab === 'metrics' && (
            <>
              <NumRow label="WEIGHT (KG)" field="weightKg" step={1} min={20} max={300} />
              <NumRow label="HEIGHT (CM)" field="heightCm" step={1} min={100} max={250} />
            </>
          )}

          {/* Avatar */}
          <div className="mt-2 mb-4">
            <div className="monument-text mb-3" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px' }}>CHOOSE AVATAR</div>
            <div className="grid grid-cols-4 gap-2">
              {AVATARS.map((av, i) => {
                const active = settings.avatar === av.id && av.id !== ''
                const locked = av.id === ''
                return (
                  <button
                    key={i}
                    onClick={() => !locked && set({ avatar: av.id })}
                    className="monument-button flex items-center justify-center"
                    style={{
                      height: 72,
                      borderRadius: '14px',
                      background: active ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : locked ? 'rgba(139,90,62,0.06)' : 'rgba(255,252,248,0.95)',
                      border: active ? '2px solid #8B5A3E' : locked ? '1.5px dashed rgba(139,90,62,0.2)' : '2px solid rgba(139,90,62,0.25)',
                      boxShadow: active ? '0 4px 0 rgba(139,90,62,0.25)' : 'none',
                      cursor: locked ? 'default' : 'pointer',
                    }}
                  >
                    {av.sprite ? (
                      <img src={av.sprite} alt={av.id} style={{ width: 40, height: 40, imageRendering: 'pixelated' }} />
                    ) : (
                      <span style={{ fontSize: '18px', opacity: 0.2 }}>?</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          className="monument-button w-full py-4 flex-shrink-0 mt-2"
          style={{ ...BTN, color: '#6B4423', fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px' }}
        >
          {syncing ? 'SAVING...' : 'SAVE SETTINGS'}
        </button>
      </div>
    </div>
  )
}

function AppShell() {
  const { user, loading, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState(2)
  const [showSettings, setShowSettings] = useState(false)

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

      {/* Settings + Log buttons — only visible on LOG tab */}
      {activeTab === 4 && (
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
        {TABS.map((tab, index) => (
          <div key={index} style={{ display: activeTab === index ? 'block' : 'none', height: '100%' }}>
            {tab.component}
          </div>
        ))}
      </div>

      {/* Bottom Navigation */}
      <nav
        className="flex justify-around items-center py-3 px-2 relative"
        style={{ background: 'rgba(255,245,230,0.95)', borderTop: '2px solid rgba(139,90,62,0.2)', backdropFilter: 'blur(10px)', zIndex: 10 }}
      >
        {TABS.map((tab, index) => {
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
        })}
      </nav>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
