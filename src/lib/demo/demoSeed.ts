// Sample data for no-login demo mode: 3 weeks of a track athlete's logs, shaped like daily_logs and workout_entries rows.

export interface DemoDay { offset: number; row: Record<string, unknown>; entries?: Record<string, unknown>[] }

export const DEMO_PROFILE: Record<string, unknown> = {
  water_target: 3,
  calories_target: 2500,
  protein_target: 170,
  cardio_target: 120,
  weight_kg: 64,
  height_cm: 168,
  avatar: 'chimchar',
  default_weight_unit: 'kg',
}

interface DemoSet { reps: number; weight: number }
interface Pair { entry: Record<string, unknown>; row: Record<string, unknown> }

const energy = (exercise: string, category: string, rating: number, time: string): Pair => ({
  entry: { exercise, type: 'energy', energyRating: rating, time, category },
  row: { exercise, category, type: 'energy', energy_rating: rating, sets: null },
})

const lift = (exercise: string, category: string, sets: DemoSet[], time: string): Pair => ({
  entry: { exercise, type: 'weights', sets, unit: 'kg', time, category },
  row: { exercise, category, type: 'weights', energy_rating: null, sets },
})

const rest = (time: string): Pair => energy('Rest Day', 'Rest Day', 3, time)

interface DayInput {
  offset: number
  water: number
  calories: number
  protein: number
  sugar: number
  sleep: [number, number]
  energy: number
  workoutEnergy: number
  cardio: number
  steps: number
  creatine: boolean
  vitamins: number
  planTime: string | null
  planCategories: string[]
  logs: Pair[]
}

const day = (d: DayInput): DemoDay => ({
  offset: d.offset,
  row: {
    today_workouts: d.logs.map(p => p.entry),
    workout_level: Math.min(100, d.logs.length * 5),
    energy_level_workout: d.workoutEnergy,
    cardio_minutes: d.cardio,
    workout_planned_time: d.planTime,
    workout_planned_categories: d.planCategories,
    water_liters: d.water,
    calories: d.calories,
    protein_grams: d.protein,
    sugar_grams: d.sugar,
    creatine_taken: d.creatine,
    multivitamins: d.vitamins,
    sleep_hours: d.sleep[0],
    sleep_minutes: d.sleep[1],
    energy_level: d.energy,
    steps: d.steps,
  },
  entries: d.logs.map(p => p.row),
})

export const DEMO_DAYS: DemoDay[] = [
  day({ offset: 0, water: 1.8, calories: 1400, protein: 96, sugar: 18, sleep: [7, 30], energy: 7, workoutEnergy: 6, cardio: 10, steps: 4200, creatine: false, vitamins: 0, planTime: 'Morning', planCategories: ['Speed'],
    logs: [energy('Block Starts', 'Speed', 4, '07:42'), energy('Acceleration Runs', 'Speed', 4, '07:58')] }),
  day({ offset: -1, water: 2.6, calories: 2350, protein: 168, sugar: 24, sleep: [7, 15], energy: 7, workoutEnergy: 3, cardio: 0, steps: 9300, creatine: true, vitamins: 0, planTime: null, planCategories: [],
    logs: [rest('09:10')] }),
  day({ offset: -2, water: 2.5, calories: 2480, protein: 172, sugar: 29, sleep: [7, 45], energy: 6, workoutEnergy: 8, cardio: 60, steps: 13200, creatine: true, vitamins: 1, planTime: 'Afternoon', planCategories: ['Speed Endurance'],
    logs: [energy('400m Repeats', 'Speed Endurance', 5, '17:05'), energy('Hollow Sprints', 'Speed Endurance', 4, '17:40')] }),
  day({ offset: -4, water: 2.9, calories: 2390, protein: 176, sugar: 22, sleep: [6, 45], energy: 6, workoutEnergy: 7, cardio: 40, steps: 11800, creatine: true, vitamins: 0, planTime: 'Evening', planCategories: ['Tempo'],
    logs: [energy('Tempo Runs', 'Tempo', 4, '18:30'), energy('Strides', 'Tempo', 3, '18:55')] }),
  day({ offset: -5, water: 2.4, calories: 2510, protein: 182, sugar: 31, sleep: [8, 0], energy: 8, workoutEnergy: 7, cardio: 0, steps: 7600, creatine: true, vitamins: 1, planTime: 'Morning', planCategories: ['Pull'],
    logs: [
      lift('Lat Pulldown', 'Pull', [{ reps: 10, weight: 45 }, { reps: 10, weight: 45 }, { reps: 8, weight: 50 }], '10:20'),
      lift('Barbell Row', 'Pull', [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 6, weight: 65 }], '10:41'),
      lift('Bicep Curls', 'Pull', [{ reps: 12, weight: 12 }, { reps: 12, weight: 12 }, { reps: 10, weight: 14 }], '11:02'),
    ] }),
  day({ offset: -6, water: 2.7, calories: 2440, protein: 178, sugar: 26, sleep: [7, 30], energy: 7, workoutEnergy: 7, cardio: 0, steps: 10400, creatine: true, vitamins: 0, planTime: 'Morning', planCategories: ['Push'],
    logs: [
      lift('Bench Press', 'Push', [{ reps: 8, weight: 60 }, { reps: 8, weight: 65 }, { reps: 6, weight: 70 }], '10:05'),
      lift('Overhead Press', 'Push', [{ reps: 8, weight: 35 }, { reps: 8, weight: 35 }, { reps: 6, weight: 37.5 }], '10:30'),
      energy('Dips', 'Push', 4, '10:52'),
    ] }),
  day({ offset: -7, water: 2.3, calories: 2300, protein: 165, sugar: 33, sleep: [6, 30], energy: 6, workoutEnergy: 8, cardio: 20, steps: 12100, creatine: true, vitamins: 0, planTime: 'Morning', planCategories: ['Speed'],
    logs: [energy('100m Sprint', 'Speed', 5, '07:30'), energy('Flying 30m', 'Speed', 4, '07:52'), energy('Sled Sprints', 'Speed', 4, '08:10')] }),
  day({ offset: -8, water: 2.2, calories: 2150, protein: 158, sugar: 27, sleep: [7, 0], energy: 7, workoutEnergy: 3, cardio: 0, steps: 8700, creatine: true, vitamins: 0, planTime: null, planCategories: [],
    logs: [rest('10:05')] }),
  day({ offset: -9, water: 3.1, calories: 2780, protein: 180, sugar: 30, sleep: [7, 30], energy: 8, workoutEnergy: 9, cardio: 95, steps: 16400, creatine: true, vitamins: 1, planTime: 'Afternoon', planCategories: ['Speed Endurance'],
    logs: [
      energy('300m Repeats', 'Speed Endurance', 5, '16:45'),
      energy('200m Repeats', 'Speed Endurance', 5, '17:20'),
      energy('Intensive Intervals', 'Speed Endurance', 5, '17:55'),
      energy('Special Endurance', 'Speed Endurance', 4, '18:30'),
    ] }),
  day({ offset: -10, water: 2.5, calories: 2620, protein: 185, sugar: 19, sleep: [7, 45], energy: 7, workoutEnergy: 8, cardio: 0, steps: 9900, creatine: true, vitamins: 0, planTime: 'Morning', planCategories: ['Lower'],
    logs: [
      lift('Squats', 'Lower', [{ reps: 5, weight: 80 }, { reps: 5, weight: 85 }, { reps: 5, weight: 85 }], '09:30'),
      lift('Romanian Deadlift', 'Lower', [{ reps: 8, weight: 60 }, { reps: 8, weight: 60 }, { reps: 8, weight: 60 }], '09:52'),
      lift('Bulgarian Split Squats', 'Lower', [{ reps: 10, weight: 16 }, { reps: 10, weight: 16 }, { reps: 8, weight: 18 }], '10:15'),
    ] }),
  day({ offset: -11, water: 2.6, calories: 2350, protein: 171, sugar: 21, sleep: [7, 0], energy: 6, workoutEnergy: 6, cardio: 30, steps: 11200, creatine: true, vitamins: 0, planTime: 'Evening', planCategories: ['Tempo'],
    logs: [energy('Threshold Runs', 'Tempo', 4, '18:10'), energy('Fartlek', 'Tempo', 4, '18:50')] }),
  day({ offset: -13, water: 1.9, calories: 3150, protein: 124, sugar: 88, sleep: [8, 0], energy: 6, workoutEnergy: 6, cardio: 0, steps: 6500, creatine: true, vitamins: 1, planTime: 'Morning', planCategories: ['Push'],
    logs: [
      lift('Incline Bench Press', 'Push', [{ reps: 8, weight: 50 }, { reps: 8, weight: 50 }, { reps: 6, weight: 55 }], '11:00'),
      energy('Push-ups', 'Push', 5, '11:25'),
    ] }),
  day({ offset: -14, water: 2.4, calories: 2410, protein: 170, sugar: 24, sleep: [7, 15], energy: 7, workoutEnergy: 7, cardio: 25, steps: 12800, creatine: true, vitamins: 0, planTime: 'Morning', planCategories: ['Speed'],
    logs: [energy('Acceleration Runs', 'Speed', 4, '07:35'), energy('Sled Sprints', 'Speed', 4, '07:58')] }),
  day({ offset: -15, water: 2.1, calories: 2100, protein: 150, sugar: 20, sleep: [8, 0], energy: 8, workoutEnergy: 3, cardio: 0, steps: 7200, creatine: true, vitamins: 0, planTime: null, planCategories: [],
    logs: [rest('09:50')] }),
  day({ offset: -16, water: 2.2, calories: 2290, protein: 169, sugar: 27, sleep: [5, 0], energy: 3, workoutEnergy: 6, cardio: 50, steps: 9600, creatine: true, vitamins: 0, planTime: 'Afternoon', planCategories: ['Speed Endurance'],
    logs: [
      energy('150m Runs', 'Speed Endurance', 4, '17:00'),
      energy('In & Outs', 'Speed Endurance', 5, '17:30'),
      energy('HIIT Intervals', 'Speed Endurance', 5, '17:58'),
    ] }),
  day({ offset: -17, water: 2.8, calories: 2560, protein: 182, sugar: 22, sleep: [7, 30], energy: 7, workoutEnergy: 7, cardio: 0, steps: 8800, creatine: true, vitamins: 0, planTime: 'Morning', planCategories: ['Lower'],
    logs: [
      lift('Hip Thrusts', 'Lower', [{ reps: 10, weight: 70 }, { reps: 10, weight: 70 }, { reps: 8, weight: 75 }], '10:00'),
      lift('Leg Press', 'Lower', [{ reps: 12, weight: 140 }, { reps: 12, weight: 140 }, { reps: 10, weight: 150 }], '10:25'),
    ] }),
  day({ offset: -18, water: 2.5, calories: 2440, protein: 174, sugar: 23, sleep: [7, 15], energy: 7, workoutEnergy: 6, cardio: 35, steps: 11600, creatine: true, vitamins: 0, planTime: 'Evening', planCategories: ['Tempo'],
    logs: [energy('Easy Runs', 'Tempo', 3, '18:00'), energy('Progression Runs', 'Tempo', 4, '18:35'), energy('Strides', 'Tempo', 4, '18:58')] }),
  day({ offset: -20, water: 2.6, calories: 2380, protein: 176, sugar: 25, sleep: [8, 15], energy: 8, workoutEnergy: 7, cardio: 0, steps: 10100, creatine: true, vitamins: 0, planTime: 'Morning', planCategories: ['Push'],
    logs: [
      lift('Overhead Press', 'Push', [{ reps: 8, weight: 35 }, { reps: 8, weight: 35 }, { reps: 6, weight: 37.5 }], '10:10'),
      lift('Cable Chest Fly', 'Push', [{ reps: 12, weight: 15 }, { reps: 12, weight: 15 }, { reps: 12, weight: 15 }], '10:40'),
    ] }),
]
