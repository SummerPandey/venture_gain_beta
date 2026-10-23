/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Demo-mode canned AI replies. In demo mode, every request to /api/groq and
 * /api/gemini is answered here instead of by a real model.
 *
 * Envelopes match the upstream Groq chat completion and Gemini generateContent
 * responses that src/lib/groq.ts and src/lib/gemini.ts read. Reply text matches
 * what each caller in src/app/components/features/ expects to parse.
 */

interface ChatMsg { role: string; content: string }

interface DemoSet { reps: number; weight: number }

interface DemoWorkout {
  exercise: string
  type: 'weights' | 'energy'
  sets: DemoSet[]
  energyRating: number | null
  unit: string
  description: string
}

const DEMO_TAG = '(demo reply)'

// ---------- helpers ----------

/** Tiny deterministic string hash (FNV-1a). Used to vary replies per input. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(items: readonly T[], seed: string, salt = 0): T {
  return items[(hash(seed) + salt) % items.length]
}

function rep(n: number, s: DemoSet): DemoSet[] {
  return Array.from({ length: n }, () => ({ ...s }))
}

function groqEnvelope(content: string): unknown {
  return {
    id: 'demo-' + hash(content).toString(36),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'openai/gpt-oss-120b',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

function geminiEnvelope(text: string): unknown {
  return {
    candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 }],
    usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
  }
}

function messagesOf(body: any): ChatMsg[] {
  const list: any[] = Array.isArray(body?.messages) ? body.messages : []
  return list.map(m => ({
    role: typeof m?.role === 'string' ? m.role : '',
    content: typeof m?.content === 'string' ? m.content : '',
  }))
}

function joinRole(msgs: ChatMsg[], role: string): string {
  return msgs.filter(m => m.role === role).map(m => m.content).join('\n')
}

function lastUserText(msgs: ChatMsg[]): string {
  for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'user') return msgs[i].content
  return ''
}

/** First double-quoted span in a prompt. Every caller that quotes user input puts it first. */
function firstQuoted(s: string): string {
  const m = s.match(/"([^"]{1,500})"/)
  return m ? m[1].trim() : ''
}

function snippet(s: string, max = 40): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, c => c.toUpperCase())
}

// ---------- workout text parsing ----------

const SPRINT_RE = /(\d+)\s*[x×]\s*(\d+)\s*m\b/i
const LOADED_RE = /(\d+)\s*[x×]\s*(\d+)\s*(?:@\s*)?(\d+(?:\.\d+)?)\s*(kg|lbs?)\b/i
const BODY_RE = /(\d+)\s*[x×]\s*(\d+)/i
const CARDIO_RE = /\b(run|running|cardio|bike|biking|row|rowing|walk|swim|jog|hiit|mins?|minutes?)\b/i

function cleanName(s: string): string {
  return titleCase(
    s.replace(/^[A-Za-z]:\s*/, '').replace(/[^A-Za-z' -]/g, ' ').replace(/\s+/g, ' ').trim(),
  ).slice(0, 40)
}

/** Turns a workout phrase like "A: 3x60m" or "bench press 4x8 80kg" into scan items. */
function parseWorkoutText(input: string): DemoWorkout[] {
  const out: DemoWorkout[] = []
  const chunks = input.split(/\n|;|,|\s\/\s/).map(c => c.trim()).filter(Boolean)
  for (const chunk of chunks) {
    const description = chunk.slice(0, 120)

    const sprint = chunk.match(SPRINT_RE)
    if (sprint) {
      const sets = Math.min(Number(sprint[1]), 10)
      const dist = Math.min(Number(sprint[2]), 1000)
      out.push({
        exercise: `${dist}m Sprint`,
        type: 'weights',
        sets: rep(sets, { reps: 1, weight: dist }),
        energyRating: null,
        unit: 'm',
        description,
      })
      continue
    }

    const loaded = chunk.match(LOADED_RE)
    const body = loaded ?? chunk.match(BODY_RE)
    if (body && body.index !== undefined) {
      const sets = Math.min(Number(body[1]), 10)
      const reps = Math.min(Number(body[2]), 50)
      const weight = loaded ? Math.min(Number(loaded[3]), 1000) : 0
      const unit = loaded ? (/lb/i.test(loaded[4]) ? 'lbs' : 'kg') : ''
      const before = chunk.slice(0, body.index)
      const after = chunk.slice(body.index + body[0].length)
      const name = cleanName(before) || cleanName(after) || 'Workout'
      out.push({
        exercise: name,
        type: 'weights',
        sets: rep(sets, { reps, weight }),
        energyRating: null,
        unit,
        description,
      })
      continue
    }

    // Cardio needs a number too, so a plain question like "how many mins left" is not logged.
    if (CARDIO_RE.test(chunk) && /\d/.test(chunk)) {
      const name = /run/i.test(chunk) ? 'Run'
        : /bike|biking/i.test(chunk) ? 'Bike'
        : /row/i.test(chunk) ? 'Rowing'
        : /swim/i.test(chunk) ? 'Swim'
        : 'Cardio'
      out.push({ exercise: name, type: 'energy', sets: [], energyRating: 4, unit: '', description })
    }
  }
  return out
}

const MIXED_CIRCUIT: DemoWorkout = {
  exercise: 'Mixed Circuit',
  type: 'energy',
  sets: [],
  energyRating: 4,
  unit: '',
  description: 'Full body fun',
}

// ---------- canned workout photo results (Gemini) ----------

const WORKOUT_PHOTO_PRESETS: DemoWorkout[][] = [
  [
    { exercise: '60m Sprint', type: 'weights', sets: rep(3, { reps: 1, weight: 60 }), energyRating: null, unit: 'm', description: 'A: 3x60m' },
    { exercise: 'Bench Press', type: 'weights', sets: rep(4, { reps: 8, weight: 80 }), energyRating: null, unit: 'kg', description: 'B: 4x8 @ 80kg' },
  ],
  [
    { exercise: 'Goblet Squat', type: 'weights', sets: rep(3, { reps: 12, weight: 20 }), energyRating: null, unit: 'kg', description: 'A: 3x12 @ 20kg' },
    { exercise: 'Pull-Ups', type: 'weights', sets: rep(3, { reps: 6, weight: 0 }), energyRating: null, unit: '', description: 'B: 3x6 bodyweight' },
    { exercise: 'Hill Sprints', type: 'energy', sets: [], energyRating: 4, unit: '', description: 'C: easy hill sprints' },
  ],
  [
    { exercise: '80m Sprint', type: 'weights', sets: rep(8, { reps: 1, weight: 80 }), energyRating: null, unit: 'm', description: 'A: 8x80m / walk back' },
    { exercise: 'Romanian Deadlift', type: 'weights', sets: rep(3, { reps: 10, weight: 50 }), energyRating: null, unit: 'kg', description: 'B: 3x10 @ 50kg' },
  ],
]

// ---------- canned meal estimates ----------

interface FoodRow { re: RegExp; kcal: number; protein: number; sugar: number; water: number }

const FOOD_TABLE: FoodRow[] = [
  { re: /whey|protein shake|\bshake\b/i, kcal: 120, protein: 24, sugar: 2, water: 0.25 },
  { re: /\beggs?\b/i, kcal: 70, protein: 6, sugar: 0, water: 0 },
  { re: /chicken/i, kcal: 250, protein: 46, sugar: 0, water: 0 },
  { re: /salmon|tuna/i, kcal: 210, protein: 40, sugar: 0, water: 0 },
  { re: /\brice\b/i, kcal: 240, protein: 5, sugar: 0, water: 0 },
  { re: /oats?\b|oatmeal|porridge/i, kcal: 310, protein: 10, sugar: 1, water: 0.1 },
  { re: /banana/i, kcal: 105, protein: 1, sugar: 0, water: 0 },
  { re: /apple|orange|berr|mango/i, kcal: 90, protein: 1, sugar: 0, water: 0.1 },
  { re: /toast|bread/i, kcal: 80, protein: 3, sugar: 2, water: 0 },
  { re: /yogh?urt/i, kcal: 97, protein: 9, sugar: 4, water: 0.07 },
  { re: /milk/i, kcal: 150, protein: 8, sugar: 12, water: 0.19 },
  { re: /juice|soda|cola/i, kcal: 140, protein: 0, sugar: 35, water: 0.3 },
  { re: /coffee|\btea\b/i, kcal: 5, protein: 0, sugar: 0, water: 0.25 },
  { re: /\bwater\b/i, kcal: 0, protein: 0, sugar: 0, water: 0.5 },
  { re: /pizza/i, kcal: 285, protein: 12, sugar: 4, water: 0 },
  { re: /salad/i, kcal: 150, protein: 5, sugar: 3, water: 0.1 },
  { re: /chocolate|candy|cookie|cake/i, kcal: 250, protein: 3, sugar: 28, water: 0 },
]

function estimateFood(text: string): Record<string, unknown> {
  // "2 eggs" / "3x banana" style quantities. Digits followed by a letter, so "500ml" or "2%" are ignored.
  const q = text.match(/\b([1-4])\s*(?:x\s*)?(?=[a-z])/i)
  const mult = q ? Number(q[1]) : 1
  let kcal = 0, protein = 0, sugar = 0, water = 0, hits = 0
  for (const row of FOOD_TABLE) {
    if (row.re.test(text)) {
      hits++
      kcal += row.kcal
      protein += row.protein
      sugar += row.sugar
      water += row.water
    }
  }
  if (hits === 0) { kcal = 350; protein = 15; sugar = 5; water = 0.1 }
  const words = text.split(/\s+/).filter(Boolean).slice(0, 5).join(' ')
  return {
    waterDelta: Math.round(water * mult * 100) / 100,
    caloriesDelta: Math.round(kcal * mult),
    proteinDelta: Math.round(protein * mult),
    sugarDelta: Math.round(sugar * mult),
    description: words ? titleCase(words).slice(0, 40) : 'Mystery snack',
  }
}

const MEAL_PHOTO_PRESETS: Record<string, unknown>[] = [
  { waterDelta: 0.05, caloriesDelta: 520, proteinDelta: 42, sugarDelta: 4, description: 'Chicken rice bowl', servingNote: '1 bowl (about 450g)' },
  { waterDelta: 0.1, caloriesDelta: 430, proteinDelta: 34, sugarDelta: 3, description: 'Salmon and greens', servingNote: '1 plate' },
  { waterDelta: 0.3, caloriesDelta: 310, proteinDelta: 12, sugarDelta: 6, description: 'Berry yogurt bowl', servingNote: '1 bowl (250g)' },
]

// ---------- canned exercise info ----------

const EXERCISE_INFO: Array<{ re: RegExp; muscles: string; tips: string[] }> = [
  { re: /squat/i, muscles: 'Quads, glutes, hamstrings', tips: ['Brace your core and sit straight down.', 'Knees track over toes, chest stays proud.'] },
  { re: /deadlift/i, muscles: 'Hamstrings, glutes, lower back', tips: ['Bar stays close to your shins the whole way.'] },
  { re: /bench/i, muscles: 'Chest, triceps, front delts', tips: ['Shoulder blades pinched, feet planted.'] },
  { re: /overhead|ohp|shoulder press/i, muscles: 'Shoulders, triceps, upper chest', tips: ['Squeeze glutes and ribs down to protect your back.'] },
  { re: /pull|chin/i, muscles: 'Lats, biceps, rear delts', tips: ['Lead with your elbows, control the way down.'] },
  { re: /\browing?\b/i, muscles: 'Upper back, lats, biceps', tips: ['Pull to your ribs and squeeze at the top.'] },
  { re: /sprint|\brun/i, muscles: 'Hamstrings, glutes, calves', tips: ['Drive your knees and stay tall.'] },
  { re: /lunge/i, muscles: 'Quads, glutes, adductors', tips: ['Long stride, front knee over the ankle.'] },
  { re: /curl/i, muscles: 'Biceps, forearms', tips: ['Keep elbows pinned and avoid swinging.'] },
  { re: /plank|crunch|\bcore\b/i, muscles: 'Core, shoulders', tips: ['Squeeze glutes and keep a straight line.'] },
  { re: /.*/, muscles: 'Full body, core', tips: ['Smooth reps beat heavy, sloppy ones.'] },
]

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const

// ---------- canned chat replies ----------

function companionLine(userText: string): string {
  const t = userText.toLowerCase()
  const q = snippet(userText)
  if (/water|drink|hydrat/.test(t)) {
    return pick([
      `Hydration hero! "${q}" is exactly the move, keep sipping.`,
      `Love that you mentioned "${q}". Every glass counts toward your 3L.`,
    ], userText)
  }
  if (/sleep|slept|tired|nap|bed/.test(t)) {
    return pick([
      `Rest is part of the training, so protect that sleep tonight.`,
      `You said "${q}". Recovery mode activated, go easy on yourself today.`,
    ], userText)
  }
  if (/lift|run|workout|sprint|gym|squat|bench|cardio|train/.test(t)) {
    return pick([
      `Beast mode! "${q}" sounds like a strong session. Chimchar is fired up.`,
      `Yes, "${q}" is exactly what the streak needs. Keep stacking those sets.`,
    ], userText)
  }
  if (/eat|ate|lunch|dinner|breakfast|snack|food|meal|protein|calor/.test(t)) {
    return pick([
      `Fuel up smart: protein first, then whatever you're craving.`,
      `"${q}" noted. Balanced plates make the goals feel easy.`,
    ], userText)
  }
  return pick([
    `You said "${q}", and I'm here for it. What's the next move?`,
    `Thanks for sharing "${q}". Small steps add up to a 7-year streak.`,
    `Got it: "${q}". Keep the vibes high and the water flowing.`,
  ], userText)
}

function coachPlainLine(userText: string): string {
  return pick([
    `Nice one, Summer! Tell me a set like "3x12 pull-ups" and I'll get it ready to log.`,
    `Solid energy. Describe a workout with sets and reps and I'll turn it into a log card.`,
    `Chimchar approves. Try "bench press 4x8 80kg" and I'll set it up for you.`,
  ], userText) + ` ${DEMO_TAG}`
}

// ---------- entry points ----------

/** Answers a POST body destined for /api/groq. */
export function demoGroqResponse(body: any): unknown {
  const msgs = messagesOf(body)
  const system = joinRole(msgs, 'system')
  const userAll = joinRole(msgs, 'user')
  const lastUser = lastUserText(msgs)

  // Meal scan (voice, text, or the companion box). groqText(`Estimate nutrition for: "..."`).
  if (userAll.includes('Estimate nutrition for:')) {
    const food = firstQuoted(userAll)
    return groqEnvelope(JSON.stringify(estimateFood(food)))
  }

  // Exercise info sheet. Plain three-line text, parsed by nothing, so no demo tag.
  if (userAll.includes('Give brief info for the exercise')) {
    const name = firstQuoted(userAll) || 'this exercise'
    const info = EXERCISE_INFO.find(e => e.re.test(name)) ?? EXERCISE_INFO[EXERCISE_INFO.length - 1]
    const seed = name
    const text = [
      `Muscles: ${info.muscles}`,
      `Tip: ${pick(info.tips, seed)}`,
      `Level: ${pick(LEVELS, seed)}`,
    ].join('\n')
    return groqEnvelope(text)
  }

  // Workout score after a logged exercise. Expects {"score","verdict","bonus"} JSON.
  if (userAll.includes('Exercise:') && userAll.includes('"score"')) {
    const seed = userAll
    const score = pick([3, 4, 4, 5], seed)
    const verdict = score === 5 ? 'Max Effort 💪' : score === 4 ? 'Above Average' : 'Solid Session'
    const bonus = score === 5 ? 10 : score === 4 ? 6 : 3
    return groqEnvelope(JSON.stringify({ score, verdict, bonus }))
  }

  // Log-intent parse. Always "chat" in demo mode so nothing gets written to a database.
  if (system.includes('Parse health logging intent')) {
    return groqEnvelope('{"action":"chat"}')
  }

  // Typed or spoken workout. Expects a JSON array of scan items.
  if (userAll.includes('The user gave this voice transcript') || userAll.includes('The user typed:')) {
    const items = parseWorkoutText(firstQuoted(userAll))
    return groqEnvelope(JSON.stringify(items.length ? items : [MIXED_CIRCUIT]))
  }

  // Workout coach chat. Expects {"reply","workouts"} JSON for logs, plain text otherwise.
  if (system.includes('AI companion and workout coach')) {
    const items = parseWorkoutText(lastUser)
    if (items.length > 0) {
      const reply = pick([
        'Logged it in the card below, Summer. Nice work!',
        'Here is what I picked up. Tap log when it looks right.',
        'Strong session. Check these over and log them.',
      ], lastUser)
      return groqEnvelope(JSON.stringify({ reply, workouts: items }))
    }
    return groqEnvelope(coachPlainLine(lastUser))
  }

  // Log-tab companion chat. Plain text, 1-2 short sentences.
  if (system.includes("Summer's health companion")) {
    return groqEnvelope(`${companionLine(lastUser)} ${DEMO_TAG}`)
  }

  // Anything else.
  return groqEnvelope(`Hi Summer! This is demo mode, so every reply is a sample. ${DEMO_TAG}`)
}

/** Answers a POST body destined for /api/gemini (vision scans). */
export function demoGeminiResponse(body: any): unknown {
  const parts: any[] = Array.isArray(body?.contents?.[0]?.parts) ? body.contents[0].parts : []
  const prompt = parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('\n')

  // Workout screenshot. Expects a JSON array of scan items.
  if (prompt.includes('workout screenshot')) {
    return geminiEnvelope(JSON.stringify(pick(WORKOUT_PHOTO_PRESETS, prompt)))
  }

  // Food photo. Expects a single nutrition JSON object.
  if (prompt.includes('food image')) {
    return geminiEnvelope(JSON.stringify(pick(MEAL_PHOTO_PRESETS, prompt)))
  }

  return geminiEnvelope(`Looks tasty! This is a demo reply, so the numbers are samples. ${DEMO_TAG}`)
}
