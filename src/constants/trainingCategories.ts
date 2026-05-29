export const TRAINING_CATEGORIES = [
  {
    name: 'Speed',
    color: '#FF6B6B',
    gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E8E 100%)',
    border: '#CC4444',
    shadow: 'rgba(255, 107, 107, 0.3)',
    exercises: ['100m Sprint', '60m Sprint', '40 Yard Dash', 'Flying 30m', 'Resisted Sprints', 'Overspeed Sprints', 'Acceleration Runs', 'Block Starts', 'Hill Sprints', 'Sled Sprints', 'Wicket Runs', 'Sprint Drills'],
  },
  {
    name: 'Speed Endurance',
    color: '#C47AE8',
    gradient: 'linear-gradient(135deg, #C47AE8 0%, #D49AF0 100%)',
    border: '#9A50C8',
    shadow: 'rgba(196, 122, 232, 0.3)',
    exercises: ['200m Repeats', '300m Repeats', '400m Repeats', 'Shuttle Runs', 'Suicide Sprints', 'HIIT Intervals', '150m Runs', 'Hollow Sprints', 'In & Outs', 'Intensive Intervals', 'Special Endurance', 'Flying 200s'],
  },
  {
    name: 'Tempo',
    color: '#7BAFD4',
    gradient: 'linear-gradient(135deg, #7BAFD4 0%, #9ECAE8 100%)',
    border: '#4A88B8',
    shadow: 'rgba(123, 175, 212, 0.3)',
    exercises: ['Tempo Runs', 'Extensive Tempo', 'Intensive Tempo', 'Threshold Runs', 'Circuit Training', 'Aerobic Intervals', 'Recovery Runs', 'Fartlek', 'Progression Runs', 'Strides', 'Easy Runs', 'Cross Training'],
  },
  {
    name: 'Push',
    color: '#FF9F66',
    gradient: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
    border: '#CC7040',
    shadow: 'rgba(255, 159, 102, 0.3)',
    exercises: ['Bench Press', 'Incline Bench Press', 'Overhead Press', 'Dumbbell Press', 'Push-ups', 'Dips', 'Pike Push-ups', 'Cable Chest Fly', 'Lateral Raises', 'Front Raises', 'Tricep Extensions', 'Skull Crushers', 'Close Grip Bench', 'Arnold Press', 'Machine Press', 'Landmine Press'],
  },
  {
    name: 'Pull',
    color: '#5BB8A8',
    gradient: 'linear-gradient(135deg, #5BB8A8 0%, #7ECEC0 100%)',
    border: '#369080',
    shadow: 'rgba(91, 184, 168, 0.3)',
    exercises: ['Pull-ups', 'Chin-ups', 'Lat Pulldown', 'Barbell Row', 'Dumbbell Row', 'Cable Row', 'Face Pulls', 'Rear Delt Fly', 'Bicep Curls', 'Hammer Curls', 'Shrugs', 'T-Bar Row', 'Meadows Row', 'Inverted Row', 'Single Arm Row', 'Rack Pull'],
  },
  {
    name: 'Upper',
    color: '#D4956A',
    gradient: 'linear-gradient(135deg, #D4956A 0%, #E8B088 100%)',
    border: '#A86840',
    shadow: 'rgba(212, 149, 106, 0.3)',
    exercises: ['Bench Press', 'Pull-ups', 'Overhead Press', 'Barbell Row', 'Dips', 'Bicep Curls', 'Tricep Extensions', 'Lateral Raises', 'Face Pulls', 'Cable Crossover', 'Chest Fly', 'Upright Row', 'Arnold Press', 'Hammer Curls', 'Skull Crushers', 'Shrugs'],
  },
  {
    name: 'Lower',
    color: '#8BAF8C',
    gradient: 'linear-gradient(135deg, #8BAF8C 0%, #A8C8A8 100%)',
    border: '#5A8C5E',
    shadow: 'rgba(139, 175, 140, 0.3)',
    exercises: ['Squats', 'Deadlift', 'Romanian Deadlift', 'Leg Press', 'Bulgarian Split Squats', 'Lunges', 'Hip Thrusts', 'Glute Bridges', 'Leg Curls', 'Leg Extensions', 'Calf Raises', 'Step-ups', 'Box Jumps', 'Hack Squats', 'Sumo Deadlift', 'Good Mornings'],
  },
] as const

export const REST_DAY_CATEGORY = {
  name: 'Rest Day',
  color: '#9B7FC8',
  gradient: 'linear-gradient(135deg,#9B7FC8,#B89FDE)',
  border: '#7A5FA8',
  shadow: 'rgba(155,127,200,0.3)',
  exercises: [] as readonly string[],
} as const

export type TrainingCategoryName = typeof TRAINING_CATEGORIES[number]['name'] | 'Rest Day'
