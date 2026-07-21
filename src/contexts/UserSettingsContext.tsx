import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'

export interface UserSettings {
  waterTarget: number
  caloriesTarget: number
  proteinTarget: number
  cardioTarget: number
  weightKg: number
  heightCm: number
  streakDays: number
  avatar: string
}

export const DEFAULT_SETTINGS: UserSettings = {
  waterTarget: 3,
  caloriesTarget: 2500,
  proteinTarget: 170,
  cardioTarget: 120,
  weightKg: 70,
  heightCm: 175,
  streakDays: 0,
  avatar: 'chimchar',
}

export const AVATAR_SPRITES: Record<string, string> = {
  chimchar: 'https://img.pokemondb.net/sprites/black-white/anim/normal/chimchar.gif',
  piplup:   'https://img.pokemondb.net/sprites/black-white/anim/normal/piplup.gif',
  turtwig:  'https://img.pokemondb.net/sprites/black-white/anim/normal/turtwig.gif',
  pikachu:  'https://img.pokemondb.net/sprites/black-white/normal/pikachu-f.png',
}

interface UserSettingsContextValue {
  settings: UserSettings
  loaded: boolean
  isNewUser: boolean
  saveSettings: (next: UserSettings) => Promise<void>
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null)

function buildRow(userId: string, s: UserSettings) {
  return {
    user_id:         userId,
    water_target:    s.waterTarget,
    calories_target: s.caloriesTarget,
    protein_target:  s.proteinTarget,
    cardio_target:   s.cardioTarget,
    weight_kg:       s.weightKg,
    height_cm:       s.heightCm,
    streak_days:     s.streakDays,
    avatar:          s.avatar,
    updated_at:      new Date().toISOString(),
  }
}

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [isNewUser, setIsNewUser] = useState(false)

  useEffect(() => {
    if (!user) { setLoaded(true); return }
    const seenKey = `vg_onboarding_seen_${user.id}`
    supabase
      .from('user_profiles')
      .select('water_target,calories_target,protein_target,cardio_target,weight_kg,height_cm,streak_days,avatar')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            waterTarget:    Number(data.water_target)    || DEFAULT_SETTINGS.waterTarget,
            caloriesTarget: Number(data.calories_target) || DEFAULT_SETTINGS.caloriesTarget,
            proteinTarget:  Number(data.protein_target)  || DEFAULT_SETTINGS.proteinTarget,
            cardioTarget:   Number(data.cardio_target)   || DEFAULT_SETTINGS.cardioTarget,
            weightKg:       Number(data.weight_kg)       || DEFAULT_SETTINGS.weightKg,
            heightCm:       Number(data.height_cm)       || DEFAULT_SETTINGS.heightCm,
            streakDays:     Number(data.streak_days)     || 0,
            avatar:         data.avatar                  ?? DEFAULT_SETTINGS.avatar,
          })
          // Profile exists — mark as seen so onboarding never fires again
          localStorage.setItem(seenKey, '1')
          setIsNewUser(false)
        } else {
          // No profile row — only show onboarding if this device hasn't seen it yet
          const alreadySeen = localStorage.getItem(seenKey) === '1'
          if (alreadySeen) {
            setIsNewUser(false)
          } else {
            localStorage.setItem(seenKey, '1')
            setIsNewUser(true)
            supabase
              .from('user_profiles')
              .upsert(buildRow(user.id, DEFAULT_SETTINGS), { onConflict: 'user_id' })
          }
        }
        setLoaded(true)
      })
  }, [user])

  const saveSettings = async (next: UserSettings) => {
    setSettings(next)
    setIsNewUser(false)
    if (!user) return
    await supabase
      .from('user_profiles')
      .upsert(buildRow(user.id, next), { onConflict: 'user_id' })
  }

  return (
    <UserSettingsContext.Provider value={{ settings, loaded, isNewUser, saveSettings }}>
      {children}
    </UserSettingsContext.Provider>
  )
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext)
  if (!ctx) throw new Error('useUserSettings must be used within UserSettingsProvider')
  return ctx
}
