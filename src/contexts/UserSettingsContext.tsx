import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { WeightUnit } from '@/types'

export interface UserSettings {
  waterTarget: number
  caloriesTarget: number
  proteinTarget: number
  cardioTarget: number
  weightKg: number
  heightCm: number
  avatar: string
  defaultWeightUnit: WeightUnit
}

export const DEFAULT_SETTINGS: UserSettings = {
  waterTarget: 3,
  caloriesTarget: 2500,
  proteinTarget: 170,
  cardioTarget: 120,
  weightKg: 70,
  heightCm: 175,
  avatar: 'chimchar',
  defaultWeightUnit: 'kg',
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
  setDefaultWeightUnit: (unit: WeightUnit) => void
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
    avatar:          s.avatar,
    updated_at:      new Date().toISOString(),
  }
}

// Storage can throw (blocked site data, some private windows) — never let that
// break the settings load.
function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}
function writeFlag(key: string) {
  try { localStorage.setItem(key, '1') } catch { /* ignore */ }
}

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [isNewUser, setIsNewUser] = useState(false)

  useEffect(() => {
    // Never carry one account's targets/avatar over to the next sign-in.
    setSettings(DEFAULT_SETTINGS)
    setIsNewUser(false)
    if (!user) { setLoaded(true); return }
    setLoaded(false)
    let cancelled = false
    const seenKey = `vg_onboarding_seen_${user.id}`
    supabase
      .from('user_profiles')
      .select('water_target,calories_target,protein_target,cardio_target,weight_kg,height_cm,avatar')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // A failed read is not "no profile" — don't onboard and don't seed
          // defaults over the real row.
          console.error('[settings] profile load failed:', error)
        } else if (data) {
          setSettings(prev => ({
            ...prev,
            waterTarget:    Number(data.water_target)    || DEFAULT_SETTINGS.waterTarget,
            caloriesTarget: Number(data.calories_target) || DEFAULT_SETTINGS.caloriesTarget,
            proteinTarget:  Number(data.protein_target)  || DEFAULT_SETTINGS.proteinTarget,
            cardioTarget:   Number(data.cardio_target)   || DEFAULT_SETTINGS.cardioTarget,
            weightKg:       Number(data.weight_kg)       || DEFAULT_SETTINGS.weightKg,
            heightCm:       Number(data.height_cm)       || DEFAULT_SETTINGS.heightCm,
            avatar:         data.avatar                  ?? DEFAULT_SETTINGS.avatar,
          }))
          // Profile exists — mark as seen so onboarding never fires again
          writeFlag(seenKey)
          setIsNewUser(false)
        } else if (!readFlag(seenKey)) {
          // No profile row and this device hasn't onboarded yet
          setIsNewUser(true)
          supabase
            .from('user_profiles')
            .upsert(buildRow(user.id, DEFAULT_SETTINGS), { onConflict: 'user_id' })
            .then(({ error: upsertError }) => {
              // Only remember onboarding once the row actually exists
              if (upsertError) console.error('[settings] default profile write failed:', upsertError)
              else writeFlag(seenKey)
            })
        }
        setLoaded(true)
      }, (err: unknown) => {
        if (cancelled) return
        console.error('[settings] profile load failed:', err)
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [user?.id])

  // Throws on failure so callers can keep their UI open and report it.
  const saveSettings = async (next: UserSettings) => {
    if (user) {
      const { error } = await supabase
        .from('user_profiles')
        .upsert(buildRow(user.id, next), { onConflict: 'user_id' })
      if (error) throw error
    }
    setSettings(next)
    setIsNewUser(false)
  }

  // Separate query so a missing `default_weight_unit` column can't break the main settings load
  useEffect(() => {
    if (!user) return
    let cancelled = false
    supabase
      .from('user_profiles')
      .select('default_weight_unit')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data?.default_weight_unit) return
        setSettings(prev => ({ ...prev, defaultWeightUnit: data.default_weight_unit as WeightUnit }))
      })
    return () => { cancelled = true }
  }, [user?.id])

  const setDefaultWeightUnit = (unit: WeightUnit) => {
    const previous = settings.defaultWeightUnit
    setSettings(prev => ({ ...prev, defaultWeightUnit: unit }))
    if (!user) return
    supabase
      .from('user_profiles')
      .upsert(
        { user_id: user.id, default_weight_unit: unit, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
      .then(({ error }) => {
        if (!error) return
        console.error('[settings] weight unit save failed:', error)
        // Revert so the toggle doesn't claim a unit that won't survive a reload
        setSettings(prev => (prev.defaultWeightUnit === unit ? { ...prev, defaultWeightUnit: previous } : prev))
      })
  }

  return (
    <UserSettingsContext.Provider value={{ settings, loaded, isNewUser, saveSettings, setDefaultWeightUnit }}>
      {children}
    </UserSettingsContext.Provider>
  )
}

export function useUserSettings() {
  const ctx = useContext(UserSettingsContext)
  if (!ctx) throw new Error('useUserSettings must be used within UserSettingsProvider')
  return ctx
}
