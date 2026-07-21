import { useState, useMemo } from 'react'
import { Dumbbell, X, Moon, Calendar, ChevronLeft } from 'lucide-react'
import { useHealthData } from '@/contexts/HealthDataContext'
import { TRAINING_CATEGORIES, REST_DAY_CATEGORY } from '@/constants/trainingCategories'
import { WorkoutMediaFAB } from './WorkoutMediaFAB'
import { getToday } from '@/lib/supabase'
import type { DayLog } from '@/hooks/useWorkout'

const BTN_BASE = {
  background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)',
  borderRadius: '10px',
  border: '2px solid #8B5A3E',
  boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
} as const

const ALL_CATS = [...TRAINING_CATEGORIES, REST_DAY_CATEGORY] as const

export function WorkoutMode({ currentView }: { currentView: 'today' | 'previous' }) {
  const {
    todayWorkouts, historicalLogs,
    selectedExercise, setSelectedExercise,
    trackingMode, setTrackingMode,
    energyRating, setEnergyRating,
    sets, addSet, updateSet,
    logWorkout, logRestDay, logWorkoutDirect, removeWorkout,
  } = useHealthData().workout

  // ── Exercise selection modal ──
  const [showExerciseSelection, setShowExerciseSelection] = useState(false)
  const [selectedWorkoutCategory, setSelectedWorkoutCategory] = useState<string | null>(null)
  const [activeLogCategory, setActiveLogCategory] = useState<string | undefined>(undefined)
  const [customExerciseMode, setCustomExerciseMode] = useState(false)
  const [customExerciseName, setCustomExerciseName] = useState('')

  const [browseCategory, setBrowseCategory] = useState<string | null>(null)

  // Effective category for a workout in a given day: its own stored category
  // (explicit pick) wins; otherwise it inherits the single category the user
  // saved in that day's plan. Never inferred — only user-saved values.
  const categoryOf = (w: { category?: string }, day: DayLog) =>
    w.category ?? (day.plannedCategories.length === 1 ? day.plannedCategories[0] : undefined)

  // For a selected category: days that have at least one workout in that category, descending
  const daysForCategory = useMemo(() => {
    if (!browseCategory) return []
    return [...historicalLogs]
      .filter(d => d.workouts.some(w => categoryOf(w, d) === browseCategory))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [historicalLogs, browseCategory])

  // Helpers for exercise selection modal
  const closeExerciseModal = () => {
    setShowExerciseSelection(false)
    setSelectedWorkoutCategory(null)
    setCustomExerciseMode(false)
    setCustomExerciseName('')
  }

  const pickExercise = (exercise: string, category: string) => {
    setSelectedExercise(exercise)
    setActiveLogCategory(category)
    closeExerciseModal()
  }

  // ─────────────── TODAY VIEW ───────────────
  const todayView = (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="monument-text mb-5 text-center" style={{ color: '#6B4423', fontSize: '18px', fontWeight: '700' }}>
        Today's Session
      </h2>

      {/* ADD EXERCISE button */}
      <button
        onClick={() => { setShowExerciseSelection(true); setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
        className="monument-button w-full py-4 mb-5"
        style={{ ...BTN_BASE, color: '#6B4423', fontSize: '14px', fontWeight: '700', letterSpacing: '0.5px' }}
      >
        + ADD EXERCISE
      </button>

      {/* Today's workout cards */}
      {todayWorkouts.length === 0 ? (
        <div className="monument-card p-8 text-center">
          <div className="flex items-center justify-center mb-3" style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', border: '2.5px solid #8B5A3E', margin: '0 auto 12px' }}>
              <Dumbbell size={26} strokeWidth={2.5} color="#6B4423" />
            </div>
          <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '12px', fontWeight: '700' }}>
            No exercises logged yet
          </div>
          <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
            Tap ADD EXERCISE to get started
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...todayWorkouts].reverse().map((w, ri) => {
            const i = todayWorkouts.length - 1 - ri
            const cat = TRAINING_CATEGORIES.find(c => w.category === c.name)
            const accentColor = cat?.color ?? '#FF9F66'
            const totalVol = w.type === 'weights' && w.sets
              ? w.sets.reduce((s, set) => s + set.reps * set.weight, 0)
              : 0

            return (
              <div
                key={i}
                className="monument-card overflow-hidden"
                style={{ boxShadow: `0 4px 16px ${cat?.shadow ?? 'rgba(255,159,102,0.2)'}` }}
              >
                {/* Colored accent bar */}
                <div style={{ height: 4, background: cat?.gradient ?? 'linear-gradient(135deg,#FF9F66,#FFB88A)' }} />

                <div className="p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '800', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                        {w.exercise}
                      </div>
                      {cat && (
                        <span
                          className="monument-text inline-block mt-1 px-2 py-0.5"
                          style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}50`, borderRadius: '6px', color: accentColor, fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}
                        >
                          {cat.name.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeWorkout(i)}
                      className="flex-shrink-0 ml-2"
                      style={{ background: 'rgba(220,80,60,0.08)', border: '1.5px solid rgba(220,80,60,0.2)', borderRadius: '8px', padding: '4px 6px', cursor: 'pointer' }}
                    >
                      <X size={12} strokeWidth={2.5} color="#E05A4E" />
                    </button>
                  </div>

                  {/* Sets as pill badges */}
                  {w.type === 'weights' && w.sets && w.sets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {w.sets.map((s, si) => (
                        <span
                          key={si}
                          className="monument-text px-2 py-1"
                          style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}40`, borderRadius: '8px', color: '#6B4423', fontSize: '10px', fontWeight: '700' }}
                        >
                          {s.reps}<span style={{ color: '#A0725A', fontWeight: '600' }}>r</span> × {s.weight}<span style={{ color: '#A0725A', fontWeight: '600' }}>kg</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Energy rating dots */}
                  {w.energyRating != null && w.energyRating > 0 && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '0.5px' }}>ENERGY</span>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <div key={n} style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: n <= (w.energyRating ?? 0) ? accentColor : `${accentColor}25`,
                            boxShadow: n <= (w.energyRating ?? 0) ? `0 0 4px ${accentColor}80` : 'none',
                          }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Volume summary */}
                  {totalVol > 0 && (
                    <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${accentColor}18` }}>
                      <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700', letterSpacing: '0.5px' }}>
                        VOLUME · <span style={{ color: accentColor }}>{totalVol.toLocaleString()} kg</span>
                        {'  '}·{'  '}{w.sets!.length} SET{w.sets!.length !== 1 ? 'S' : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─────────────── PREVIOUS VIEW ───────────────
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const previousView = browseCategory === null ? (
    // ── Step 1: Category picker ──
    <div className="p-5 max-w-md mx-auto">
      <h2 className="monument-text mb-5 text-center" style={{ color: '#6B4423', fontSize: '18px', fontWeight: '700' }}>
        Workout History
      </h2>
      <div className="flex flex-col gap-3">
        {ALL_CATS.map(cat => {
          const isRest = cat.name === 'Rest Day'
          // Count how many days have this category
          const dayCount = historicalLogs.filter(d =>
            d.workouts.some(w => categoryOf(w, d) === cat.name)
          ).length
          return (
            <button
              key={cat.name}
              onClick={() => setBrowseCategory(cat.name)}
              className="monument-button w-full flex items-center gap-4 px-5 py-4"
              style={{
                background: cat.gradient,
                borderRadius: '16px',
                border: `2px solid ${cat.border}`,
                boxShadow: `0 4px 0 ${cat.shadow}`,
                opacity: dayCount === 0 ? 0.45 : 1,
              }}
            >
              {isRest
                ? <Moon size={22} strokeWidth={2.5} color="#fff" style={{ flexShrink: 0 }} />
                : <Dumbbell size={22} strokeWidth={2.5} color="#fff" style={{ flexShrink: 0 }} />
              }
              <span className="monument-text flex-1 text-left" style={{ color: '#fff', fontSize: '14px', fontWeight: '700', textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                {cat.name}
              </span>
              <span className="monument-text" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '11px', fontWeight: '700' }}>
                {dayCount} {dayCount === 1 ? 'session' : 'sessions'} ›
              </span>
            </button>
          )
        })}
      </div>
    </div>
  ) : (
    // ── Step 2: Sessions for selected category ──
    <div className="p-5 max-w-md mx-auto">
      {/* Back + title */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setBrowseCategory(null)}
          className="monument-button flex items-center justify-center"
          style={{ ...BTN_BASE, width: 36, height: 36, flexShrink: 0 }}
        >
          <ChevronLeft size={18} strokeWidth={2.5} color="#6B4423" />
        </button>
        <h2 className="monument-text" style={{ color: '#6B4423', fontSize: '18px', fontWeight: '700' }}>
          {browseCategory}
        </h2>
      </div>

      {daysForCategory.length === 0 ? (
        <div className="monument-card p-10 text-center">
          <div className="flex items-center justify-center mb-3" style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,159,102,0.15)', border: '2px solid rgba(255,159,102,0.4)', margin: '0 auto 12px' }}>
            <Calendar size={24} strokeWidth={2.5} color="#FF9F66" />
          </div>
          <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '12px', fontWeight: '700' }}>No sessions yet</div>
          <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>Log a {browseCategory} workout to see it here</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {daysForCategory.map(day => {
            const dayName = DAY_NAMES[new Date(day.date + 'T12:00:00').getDay()]
            const [, mm, dd] = day.date.split('-')
            const isToday = day.date === getToday()
            // Only exercises for this category
            const exercises = day.workouts.filter(w => categoryOf(w, day) === browseCategory)
            const catData = TRAINING_CATEGORIES.find(c => c.name === browseCategory)
            const isRest = browseCategory === 'Rest Day'
            const color = isRest ? '#9B7FC8' : (catData?.color ?? '#FF9F66')
            const gradient = isRest ? 'linear-gradient(135deg,#9B7FC8,#B89FDE)' : (catData?.gradient ?? 'linear-gradient(135deg,#FF9F66,#FFB88A)')

            return (
              <div key={day.date} className="monument-card overflow-hidden">
                {/* Date header */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ background: `${color}10`, borderBottom: `1px solid ${color}20` }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                    background: gradient, border: `2px solid ${color}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="monument-text" style={{ fontSize: '7px', fontWeight: '700', color: '#fff', letterSpacing: '0.3px' }}>{dayName.toUpperCase()}</span>
                    <span className="monument-text" style={{ fontSize: '13px', fontWeight: '800', color: '#fff', lineHeight: 1 }}>{parseInt(dd)}</span>
                  </div>
                  <div>
                    <span className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                      {isToday ? 'Today' : `${dayName} ${parseInt(mm)}/${parseInt(dd)}`}
                    </span>
                    <div className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>
                      {exercises.length} exercise{exercises.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* Exercises */}
                <div className="p-3 flex flex-col gap-2">
                  {exercises.map((w, wi) => {
                    const totalVol = w.type === 'weights' && w.sets
                      ? w.sets.reduce((s, set) => s + set.reps * set.weight, 0) : 0
                    return (
                      <div key={wi} style={{ background: `${color}08`, borderRadius: '10px', border: `1px solid ${color}20`, padding: '10px 12px' }}>
                        <div className="monument-text mb-1" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}>
                          {w.exercise}
                        </div>
                        {w.type === 'weights' && w.sets && w.sets.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {w.sets.map((s, si) => (
                              <span key={si} className="monument-text px-2 py-0.5" style={{ background: `${color}15`, border: `1px solid ${color}30`, borderRadius: '6px', color: '#6B4423', fontSize: '9px', fontWeight: '700' }}>
                                {s.reps}r × {s.weight}kg
                              </span>
                            ))}
                          </div>
                        )}
                        {w.energyRating != null && w.energyRating > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>ENERGY</span>
                            <div className="flex gap-1">
                              {[1,2,3,4,5].map(n => (
                                <div key={n} style={{ width: 7, height: 7, borderRadius: '50%', background: n <= (w.energyRating ?? 0) ? color : `${color}22` }} />
                              ))}
                            </div>
                          </div>
                        )}
                        {totalVol > 0 && (
                          <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${color}15` }}>
                            <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>
                              VOL · <span style={{ color }}>{totalVol.toLocaleString()} kg</span>
                              {'  '}·{'  '}{w.sets!.length} SET{w.sets!.length !== 1 ? 'S' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ─────────────── EXERCISE SELECTION MODAL ───────────────
  const exerciseModal = showExerciseSelection && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(107, 68, 35, 0.7)', backdropFilter: 'blur(8px)' }}
      onClick={closeExerciseModal}
    >
      <div className="monument-card p-6 max-w-md w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex justify-between items-center mb-5 flex-shrink-0">
          <div className="flex items-center gap-2">
            {(selectedWorkoutCategory || customExerciseMode) && (
              <button
                onClick={() => { setSelectedWorkoutCategory(null); setCustomExerciseMode(false); setCustomExerciseName('') }}
                className="monument-button p-1.5"
                style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '8px', border: '2px solid #8B5A3E', boxShadow: '0 2px 0 rgba(139,90,62,0.2)' }}
              >
                <span style={{ color: '#8B5A3E', fontSize: '14px', fontWeight: '700', lineHeight: 1 }}>‹</span>
              </button>
            )}
            <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>
              {customExerciseMode ? 'CUSTOM EXERCISE' : selectedWorkoutCategory ? selectedWorkoutCategory.toUpperCase() : 'SELECT EXERCISE'}
            </div>
          </div>
          <button
            onClick={closeExerciseModal}
            className="monument-button"
            style={{ ...BTN_BASE, color: '#6B4423', fontSize: '16px', fontWeight: '700', width: '36px', height: '36px' }}
          >×</button>
        </div>

        {/* Custom exercise */}
        {customExerciseMode && (
          <div className="flex flex-col flex-1">
            <div className="monument-text mb-2" style={{ color: '#6B4423', fontSize: '10px', fontWeight: '700' }}>EXERCISE NAME</div>
            <input
              type="text"
              placeholder="Enter exercise name..."
              value={customExerciseName}
              onChange={e => setCustomExerciseName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customExerciseName.trim()) {
                  setSelectedExercise(customExerciseName.trim())
                  closeExerciseModal()
                }
              }}
              className="w-full px-4 monument-text mb-6"
              style={{ height: 52, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '14px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.2)' }}
              autoFocus
            />
            <div className="flex gap-3 mt-auto">
              <button onClick={() => { setCustomExerciseMode(false); setCustomExerciseName('') }} className="monument-button flex-1" style={{ height: 48, background: 'rgba(255,252,248,0.95)', borderRadius: '12px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>BACK</button>
              <button
                onClick={() => { if (!customExerciseName.trim()) return; setSelectedExercise(customExerciseName.trim()); closeExerciseModal() }}
                className="monument-button flex-1"
                style={{ height: 48, background: customExerciseName.trim() ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(200,190,180,0.4)', borderRadius: '12px', border: `2px solid ${customExerciseName.trim() ? '#8B5A3E' : 'rgba(139,90,62,0.2)'}`, color: customExerciseName.trim() ? '#6B4423' : '#A0725A', fontSize: '12px', fontWeight: '700' }}
              >CONTINUE</button>
            </div>
          </div>
        )}

        {/* Step 1: Category grid */}
        {!customExerciseMode && !selectedWorkoutCategory && (
          <div className="flex flex-col gap-3 overflow-y-auto flex-1">
            <button onClick={() => setCustomExerciseMode(true)} className="monument-button w-full flex-shrink-0" style={{ height: 54, background: 'linear-gradient(135deg,#FF9F66,#FFB88A)', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '13px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}>
              + CREATE CUSTOM EXERCISE
            </button>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.2)' }} />
              <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '1px' }}>OR SELECT FROM LIST</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(139,90,62,0.2)' }} />
            </div>
            {ALL_CATS.map(cat => (
              <button key={cat.name} onClick={() => setSelectedWorkoutCategory(cat.name)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: cat.gradient, borderRadius: '12px', border: `2px solid ${cat.border}`, boxShadow: `0 4px 0 ${cat.shadow}` }}>
                <span className="monument-text" style={{ color: '#fff', fontSize: '12px', fontWeight: '700', textShadow: '0 1px 4px rgba(0,0,0,0.25)', flex: 1, textAlign: 'left' }}>{cat.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '9px', fontWeight: '700' }}>{cat.exercises.length > 0 ? `${cat.exercises.length} exercises ›` : '›'}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Exercise list */}
        {!customExerciseMode && selectedWorkoutCategory && (() => {
          const isRestDay = selectedWorkoutCategory === 'Rest Day'
          const cat = TRAINING_CATEGORIES.find(c => c.name === selectedWorkoutCategory)
          const borderColor = cat?.border ?? '#7A5FA8'
          const shadowColor = cat?.shadow ?? 'rgba(155,127,200,0.3)'
          const dotColor = cat?.color ?? '#9B7FC8'

          const todaySet = new Set(todayWorkouts.map(w => w.exercise))
          const todayForCat = isRestDay ? [] : todayWorkouts
            .filter(w => w.category === selectedWorkoutCategory)
            .map(w => w.exercise)
            .filter((e, i, arr) => arr.indexOf(e) === i)

          const histForCat = isRestDay ? [] : [
            ...historicalLogs.slice().sort((a, b) => b.date.localeCompare(a.date))
              .flatMap(d => d.workouts
                .filter(w => w.category === selectedWorkoutCategory)
                .map(w => w.exercise))
              .filter(e => !todaySet.has(e)),
          ].filter((e, i, arr) => arr.indexOf(e) === i)

          const doneNames = new Set([...todayForCat, ...histForCat])
          const remaining = cat ? cat.exercises.filter(e => !doneNames.has(e)) : []

          return (
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {todayForCat.length > 0 && (
                <>
                  <div className="monument-text px-1 pb-0.5 flex-shrink-0" style={{ color: dotColor, fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px' }}>✓ LOGGED TODAY</div>
                  {todayForCat.map(exercise => (
                    <button key={exercise} onClick={() => pickExercise(exercise, selectedWorkoutCategory)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: `${dotColor}18`, borderRadius: '10px', border: `2px solid ${borderColor}`, boxShadow: `0 3px 0 ${shadowColor}` }}>
                      <span style={{ color: dotColor, fontSize: '13px', fontWeight: '900' }}>✓</span>
                      <span className="monument-text flex-1 text-left" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                      <span style={{ color: dotColor, fontSize: '14px', fontWeight: '700' }}>+</span>
                    </button>
                  ))}
                </>
              )}
              {histForCat.length > 0 && (
                <>
                  <div className="monument-text px-1 pb-0.5 flex-shrink-0" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', marginTop: todayForCat.length > 0 ? 4 : 0 }}>YOUR PREVIOUS WORKOUTS</div>
                  {histForCat.map(exercise => (
                    <button key={exercise} onClick={() => pickExercise(exercise, selectedWorkoutCategory)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: `1.5px solid ${borderColor}`, boxShadow: `0 2px 0 ${shadowColor}` }}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                      <span className="monument-text flex-1 text-left" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                      <span style={{ color: dotColor, fontSize: '14px', fontWeight: '700' }}>›</span>
                    </button>
                  ))}
                </>
              )}
              {remaining.length > 0 && (
                <>
                  {(todayForCat.length > 0 || histForCat.length > 0) && <div className="monument-text px-1 pb-0.5 flex-shrink-0" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', marginTop: 4 }}>SUGGESTIONS</div>}
                  {remaining.map(exercise => (
                    <button key={exercise} onClick={() => pickExercise(exercise, selectedWorkoutCategory)} className="monument-button w-full flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '1.5px solid rgba(139,90,62,0.2)', boxShadow: '0 2px 0 rgba(139,90,62,0.1)' }}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'rgba(139,90,62,0.3)' }} />
                      <span className="monument-text flex-1 text-left" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>{exercise}</span>
                      <span style={{ color: '#A0725A', fontSize: '14px', fontWeight: '700' }}>›</span>
                    </button>
                  ))}
                </>
              )}
              {isRestDay && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="flex items-center justify-center" style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', border: '2.5px solid #7A5FA8' }}>
                    <Moon size={30} strokeWidth={2.5} color="#fff" />
                  </div>
                  <div className="monument-text text-center" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>Rest & Recovery</div>
                  <div className="monument-text text-center px-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', lineHeight: 1.6 }}>Rest days are when your body actually gets stronger.</div>
                  <button onClick={() => { logRestDay(); closeExerciseModal() }} className="monument-button px-6 py-3" style={{ background: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', borderRadius: '12px', border: '2px solid #7A5FA8', color: '#fff', fontSize: '11px', fontWeight: '700', boxShadow: '0 4px 0 rgba(155,127,200,0.3)' }}>
                    LOG REST DAY
                  </button>
                </div>
              )}
              {!isRestDay && todayForCat.length === 0 && histForCat.length === 0 && remaining.length === 0 && (
                <div className="monument-text text-center py-8" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>No exercises found for this category</div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )

  // ─────────────── EXERCISE LOGGING MODAL ───────────────
  const loggingModal = selectedExercise && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(107, 68, 35, 0.7)', backdropFilter: 'blur(8px)' }} onClick={() => setSelectedExercise(null)}>
      <div className="monument-card p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>{selectedExercise}</div>
          <button onClick={() => setSelectedExercise(null)} className="monument-button" style={{ ...BTN_BASE, color: '#6B4423', fontSize: '18px', fontWeight: '700', lineHeight: '1', width: '32px', height: '32px' }}>×</button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['energy', 'weights'] as const).map(mode => (
            <button key={mode} onClick={() => setTrackingMode(mode)} className="monument-button flex-1 py-2"
              style={{ background: trackingMode === mode ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: trackingMode === mode ? '#6B4423' : '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}>
              {mode === 'energy' ? 'ENERGY ONLY' : 'WEIGHTS'}
            </button>
          ))}
        </div>

        {trackingMode === 'energy' ? (
          <div className="mb-4">
            <div className="monument-text mb-3 text-center" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>How did you feel? (1-5)</div>
            <div className="flex justify-center gap-2">
              {[1,2,3,4,5].map(r => (
                <button key={r} onClick={() => setEnergyRating(r)} className="monument-button w-12 h-12"
                  style={{ background: energyRating === r ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: energyRating === r ? '#6B4423' : '#8B5A3E', fontSize: '14px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4 max-h-48 overflow-y-auto">
            {sets.map((set, i) => (
              <div key={i} className="grid gap-2 mb-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>SET {i + 1} — REPS</label>
                  <input type="number" inputMode="numeric" min={0} value={set.reps || ''} placeholder="0"
                    onChange={e => updateSet(i, 'reps', Math.max(0, parseInt(e.target.value) || 0))}
                    onFocus={e => e.target.select()}
                    className="w-full monument-text"
                    style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }} />
                </div>
                <div>
                  <label className="monument-text block mb-1" style={{ color: '#8B5A3E', fontSize: '9px', fontWeight: '700' }}>WEIGHT (KG)</label>
                  <input type="number" inputMode="decimal" min={0} value={set.weight || ''} placeholder="0"
                    onChange={e => updateSet(i, 'weight', Math.max(0, parseFloat(e.target.value) || 0))}
                    onFocus={e => e.target.select()}
                    className="w-full monument-text"
                    style={{ height: 40, background: 'rgba(255,252,248,0.95)', border: '2px solid #8B5A3E', borderRadius: '8px', color: '#6B4423', fontSize: '14px', fontWeight: '700', textAlign: 'center', boxShadow: '0 4px 0 rgba(139,90,62,0.25)' }} />
                </div>
              </div>
            ))}
            <button onClick={addSet} className="monument-button w-full mt-1" style={{ height: 36, background: 'rgba(255,252,248,0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
              + ADD SET
            </button>
          </div>
        )}

        <button
          onClick={() => logWorkout(activeLogCategory)}
          className="monument-button w-full py-3.5"
          style={{ ...BTN_BASE, color: '#6B4423', fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px' }}
        >
          LOG WORKOUT
        </button>
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-auto relative" style={{ zIndex: 1 }}>
      {currentView === 'today' ? todayView : previousView}
      {exerciseModal}
      {loggingModal}
      <WorkoutMediaFAB logWorkoutDirect={logWorkoutDirect} />
    </div>
  )
}
