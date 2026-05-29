export const CARDIO_TARGET_MINUTES = 120
export const CARDIO_MAX_MINUTES = 200

export const WORKOUT_LEVEL_SCREENSHOT_BOOST = 20
export const ENERGY_LEVEL_SCREENSHOT_DRAIN = 10
export const WORKOUT_LEVEL_LOG_BOOST = 5

export const EXERCISES_BY_CATEGORY: Record<string, string[]> = {
  Cardio: [
    'Running', 'Jogging', 'Cycling', 'Swimming', 'Rowing',
    'Stair Climber', 'Elliptical', 'Jump Rope', 'Walking', 'Hiking',
    'Dancing', 'Boxing', 'Kickboxing', 'Jump Jacks', 'Burpees',
    'Mountain Climbers',
  ],
  'Upper Body': [
    'Bench Press', 'Incline Bench Press', 'Decline Bench Press', 'Dumbbell Press',
    'Chest Fly', 'Cable Crossover', 'Push-ups', 'Dips', 'Pull-ups', 'Chin-ups',
    'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Shoulder Press',
    'Lateral Raises', 'Front Raises', 'Rear Delt Fly', 'Bicep Curls',
    'Hammer Curls', 'Tricep Extensions', 'Skull Crushers', 'Cable Curls',
    'Face Pulls', 'Shrugs',
  ],
  'Lower Body': [
    'Squats', 'Front Squats', 'Bulgarian Split Squats', 'Leg Press',
    'Lunges', 'Walking Lunges', 'Reverse Lunges', 'Leg Extensions',
    'Leg Curls', 'Calf Raises', 'Deadlift', 'Romanian Deadlift',
    'Sumo Deadlift', 'Hip Thrusts', 'Glute Bridges', 'Step-ups',
    'Goblet Squats', 'Hack Squats', 'Sissy Squats', 'Box Jumps',
  ],
  Sprinting: [
    'Sprint Intervals', '100m Sprints', '200m Sprints', '400m Sprints',
    'Hill Sprints', 'Stair Sprints', 'Shuttle Runs', 'Suicide Sprints',
    'Fartlek Training', 'Tempo Runs', 'HIIT Sprints', 'Track Sprints',
    'Treadmill Sprints', 'Beach Sprints', 'Prowler Push', 'Sled Push',
    'Sprint Drills', 'Acceleration Drills',
  ],
}
