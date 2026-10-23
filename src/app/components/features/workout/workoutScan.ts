import type { WorkoutEntry, WorkoutSet, WeightUnit } from '@/types'

/** One exercise proposed by an AI scan (photo, voice, text or coach chat), before it's logged. */
export interface WorkoutScan {
  exercise: string
  type: 'weights' | 'energy'
  sets: WorkoutSet[]
  energyRating: number
  unit: WeightUnit
  description?: string
}

export const DEFAULT_WORKOUT_SCAN: WorkoutScan = {
  exercise: '',
  type: 'weights',
  sets: [{ reps: 0, weight: 0 }],
  energyRating: 3,
  unit: 'kg',
}

export const MAX_EXERCISE_NAME = 60
export const MAX_COACH_INPUT = 500
export const MAX_COACH_HISTORY = 10
const MAX_REPS = 999
const MAX_WEIGHT = 1000
const MAX_SETS = 30

/** Coerces anything (AI JSON, typed input) to a finite number in [min, max]; otherwise `fallback`. */
export function toFiniteNumber(x: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof x === 'number' ? x : typeof x === 'string' ? parseFloat(x) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export const clampReps = (x: unknown) => Math.round(toFiniteNumber(x, 0, MAX_REPS))
export const clampWeight = (x: unknown) => Math.round(toFiniteNumber(x, 0, MAX_WEIGHT) * 100) / 100
export const clampEnergy = (x: unknown, fallback = 3) => Math.round(toFiniteNumber(x, 1, 5, fallback))

/** Trimmed, length-capped exercise name ('' when the value isn't a usable string). */
export function cleanExerciseName(x: unknown): string {
  return typeof x === 'string' ? x.trim().replace(/\s+/g, ' ').slice(0, MAX_EXERCISE_NAME) : ''
}

/** Units the app knows how to render. AI replies use 'm' for sprint distances and '' for bodyweight. */
function cleanUnit(x: unknown): WeightUnit {
  if (typeof x !== 'string') return 'kg'
  const u = x.trim().toLowerCase()
  if (u === 'lb' || u === 'lbs' || u === 'pounds') return 'lbs'
  if (u === 'km' || u === 'm' || u === '') return u as WeightUnit
  return 'kg'
}

/** Distance units aren't a weight — they must never be counted as kg of volume or converted kg<->lbs. */
export const isDistanceUnit = (unit: string | undefined) => unit === 'km' || unit === 'm'

/** Validates one AI-produced item into a safe WorkoutScan, or null when it's unusable. */
export function normalizeScanItem(p: unknown): WorkoutScan | null {
  if (!p || typeof p !== 'object') return null
  const o = p as Record<string, unknown>
  const type: WorkoutScan['type'] = o.type === 'energy' ? 'energy' : 'weights'
  const rawSets = Array.isArray(o.sets) ? o.sets.slice(0, MAX_SETS) : []
  const sets = rawSets
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(s => ({ reps: clampReps(s.reps), weight: clampWeight(s.weight) }))
  return {
    exercise: cleanExerciseName(o.exercise) || 'Workout',
    type,
    sets: sets.length > 0 ? sets : [{ reps: 0, weight: 0 }],
    energyRating: clampEnergy(o.energyRating),
    unit: cleanUnit(o.unit),
    description: typeof o.description === 'string' ? o.description.slice(0, 120) : undefined,
  }
}

/** Parses an AI reply (object or array) into scan items. Throws when nothing usable came back. */
export function parseScanItems(parsedRaw: unknown): WorkoutScan[] {
  const items = (Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw])
    .map(normalizeScanItem)
    .filter((x): x is WorkoutScan => x !== null)
  if (items.length === 0) throw new Error('Could not parse AI response')
  return items
}

/** A scan row can be logged only once it describes real work — never the blank placeholder. */
export function isLoggableScan(sv: WorkoutScan): boolean {
  if (!sv.exercise.trim()) return false
  if (sv.type === 'energy') return true
  return sv.sets.some(s => s.reps > 0)
}

/** Builds the entry to save. `energyFromSets` is for editors that store the 1-5 energy value in set.weight. */
export function scanToEntry(sv: WorkoutScan, opts: { energyFromSets?: boolean } = {}): WorkoutEntry {
  const base = {
    exercise: cleanExerciseName(sv.exercise) || 'Workout',
    time: new Date().toLocaleTimeString(),
  }
  if (sv.type === 'energy') {
    const fromSet = opts.energyFromSets ? sv.sets[0]?.weight : undefined
    const rating = fromSet && fromSet >= 1 && fromSet <= 5 ? fromSet : sv.energyRating
    return { ...base, type: 'energy', energyRating: clampEnergy(rating) }
  }
  const sets = sv.sets
    .map(s => ({ reps: clampReps(s.reps), weight: clampWeight(s.weight) }))
    .filter(s => s.reps > 0 || s.weight > 0)
  return { ...base, type: 'weights', sets, unit: sv.unit }
}

/** Short human summary for a scan row / coach card. */
export function describeScan(sv: WorkoutScan): string {
  if (sv.type !== 'weights') return `Energy: ${sv.energyRating}/5`
  const first = sv.sets[0]
  const n = sv.sets.length
  return `${n} set${n !== 1 ? 's' : ''} · ${first?.reps ?? 0} reps${first?.weight ? ` × ${first.weight}${sv.unit ? ' ' + sv.unit : ''}` : ''}`
}

/** Keeps the coach chat bounded so one long session can't blow past the model's context window. */
export function trimHistory<T>(history: T[]): T[] {
  return history.length > MAX_COACH_HISTORY ? history.slice(-MAX_COACH_HISTORY) : history
}

/** Readable message for a SpeechRecognition error code. */
export function micErrorMessage(code: unknown): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone permission denied — allow it in your browser settings.'
    case 'no-speech':
      return "Didn't catch that — try again."
    case 'network':
      return 'Speech service unavailable — check your connection.'
    case 'audio-capture':
      return 'No microphone found.'
    default:
      return 'Microphone unavailable right now.'
  }
}

/** Resize + JPEG-compress a photo before upload (Vercel's body limit is 4.5 MB).
 *  Always settles: decode/canvas failures reject instead of leaving the promise hanging. */
export function compressImage(file: File, maxDim: number, quality: number): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Only images can be scanned — pick a photo or screenshot.'))
      return
    }
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Could not process the image on this device.')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' })
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not process the image.'))
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

/** Weight volume of one logged entry in kg; distance entries and junk values contribute 0. */
export function entryVolumeKg(w: WorkoutEntry, toKg: (v: number, u: WeightUnit | undefined) => number): number {
  if (w.type !== 'weights' || !Array.isArray(w.sets) || isDistanceUnit(w.unit)) return 0
  return w.sets.reduce((s, set) => {
    const v = Number(set?.reps) * toKg(Number(set?.weight), w.unit)
    return Number.isFinite(v) && v > 0 ? s + v : s
  }, 0)
}

/** Formats a weight for display without long float tails (12.345678 -> 12.35). */
export const fmtWeight = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0)
