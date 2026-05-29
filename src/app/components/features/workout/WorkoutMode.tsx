import React, { useState, useMemo } from 'react'
import { Dumbbell, Zap, X } from 'lucide-react'
import { useWorkout } from '@/hooks'
import { TRAINING_CATEGORIES, REST_DAY_CATEGORY } from '@/constants/trainingCategories'
import type { WorkoutSet } from '@/types'

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
    logWorkout, removeWorkout,
  } = useWorkout()

  // ── Exercise selection modal ──
  const [showExerciseSelection, setShowExerciseSelection] = useState(false)
  const [selectedWorkoutCategory, setSelectedWorkoutCategory] = useState<string | null>(null)
  const [activeLogCategory, setActiveLogCategory] = useState<string | undefined>(undefined)
  const [customExerciseMode, setCustomExerciseMode] = useState(false)
  const [customExerciseName, setCustomExerciseName] = useState('')

  // ── Previous view category filter ──
  const [filterCategory, setFilterCategory] = useState<string>('All')

  // All unique exercises ever logged (for history display)
  const historicalExercises = useMemo(() => {
    const seen = new Set<string>()
    for (const day of historicalLogs) {
      for (const w of day.workouts) {
        if (w.exercise) seen.add(w.exercise)
      }
    }
    return Array.from(seen)
  }, [historicalLogs])

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

      {/* Tracking mode toggle */}
      <div className="flex gap-2 mb-5">
        {(['energy', 'weights'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setTrackingMode(mode)}
            className="monument-button flex-1 py-3"
            style={{
              background: trackingMode === mode ? 'linear-gradient(135deg,#FF9F66,#FFB88A)' : 'rgba(255,252,248,0.95)',
              borderRadius: '12px',
              border: `2px solid ${trackingMode === mode ? '#8B5A3E' : 'rgba(139,90,62,0.3)'}`,
              color: trackingMode === mode ? '#6B4423' : '#A0725A',
              fontSize: '11px', fontWeight: '700',
              boxShadow: trackingMode === mode ? '0 4px 0 rgba(139,90,62,0.25)' : 'none',
            }}
          >
            {mode === 'energy' ? '⚡ ENERGY' : '🏋️ WEIGHTS'}
          </button>
        ))}
      </div>

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
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>💪</div>
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
            const cat = TRAINING_CATEGORIES.find(c =>
              w.category === c.name || (c.exercises as readonly string[]).includes(w.exercise)
            )
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
  const filterCats = ['All', ...TRAINING_CATEGORIES.map(c => c.name), 'Rest Day']

  const filteredHistory = useMemo(() => {
    const entries: { date: string; dayLabel: string; exercise: string; workout: typeof historicalLogs[0]['workouts'][0] }[] = []
    for (const day of [...historicalLogs].reverse()) {
      for (const w of day.workouts) {
        if (filterCategory === 'All') {
          entries.push({ date: day.date, dayLabel: day.dayLabel, exercise: w.exercise, workout: w })
        } else {
          const cat = TRAINING_CATEGORIES.find(c => c.name === filterCategory)
          const matchByCategory = w.category === filterCategory
          const matchByName = cat ? (cat.exercises as readonly string[]).includes(w.exercise) : false
          if (matchByCategory || matchByName) {
            entries.push({ date: day.date, dayLabel: day.dayLabel, exercise: w.exercise, workout: w })
          }
        }
      }
    }
    return entries
  }, [historicalLogs, filterCategory])

  const previousView = (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="monument-text mb-4 text-center" style={{ color: '#6B4423', fontSize: '18px', fontWeight: '700' }}>
        Workout History
      </h2>

      {/* Category filter pills — horizontal scroll */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {filterCats.map(c => {
          const cat = TRAINING_CATEGORIES.find(t => t.name === c)
          const isActive = filterCategory === c
          return (
            <button
              key={c}
              onClick={() => setFilterCategory(c)}
              className="monument-button flex-shrink-0 px-3 py-1.5"
              style={{
                background: isActive ? (cat?.gradient ?? 'linear-gradient(135deg,#FF9F66,#FFB88A)') : 'rgba(255,252,248,0.95)',
                borderRadius: '20px',
                border: `1.5px solid ${isActive ? (cat?.border ?? '#8B5A3E') : 'rgba(139,90,62,0.25)'}`,
                color: isActive ? '#fff' : '#8B5A3E',
                fontSize: '10px', fontWeight: '700',
                boxShadow: isActive ? `0 3px 0 ${cat?.shadow ?? 'rgba(139,90,62,0.25)'}` : 'none',
                textShadow: isActive ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
              }}
            >
              {c}
            </button>
          )
        })}
      </div>

      {/* History cards */}
      {filteredHistory.length === 0 ? (
        <div className="monument-card p-8 text-center">
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>📋</div>
          <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '12px', fontWeight: '700' }}>No history yet</div>
          <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700' }}>
            {filterCategory === 'All' ? 'Log your first workout to see it here' : `No ${filterCategory} workouts logged yet`}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredHistory.map((entry, i) => {
            const w = entry.workout
            const cat = TRAINING_CATEGORIES.find(c =>
              w.category === c.name || (c.exercises as readonly string[]).includes(w.exercise)
            )
            const accentColor = cat?.color ?? '#FF9F66'
            const totalVol = w.type === 'weights' && w.sets
              ? w.sets.reduce((s, set) => s + set.reps * set.weight, 0)
              : 0

            return (
              <div
                key={i}
                className="monument-card overflow-hidden"
                style={{ boxShadow: `0 3px 12px ${cat?.shadow ?? 'rgba(255,159,102,0.15)'}` }}
              >
                <div style={{ height: 3, background: cat?.gradient ?? 'linear-gradient(135deg,#FF9F66,#FFB88A)' }} />
                <div className="p-3.5">
                  {/* Date + exercise */}
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '800', textTransform: 'uppercase' }}>
                        {w.exercise}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="monument-text" style={{ color: '#A0725A', fontSize: '9px', fontWeight: '700' }}>
                          {entry.dayLabel} · {entry.date}
                        </span>
                        {cat && (
                          <span
                            className="monument-text px-1.5 py-0.5"
                            style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}40`, borderRadius: '5px', color: accentColor, fontSize: '8px', fontWeight: '700' }}
                          >
                            {cat.name.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sets */}
                  {w.type === 'weights' && w.sets && w.sets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {w.sets.map((s, si) => (
                        <span
                          key={si}
                          className="monument-text px-2 py-0.5"
                          style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}35`, borderRadius: '7px', color: '#6B4423', fontSize: '9px', fontWeight: '700' }}
                        >
                          {s.reps}r × {s.weight}kg
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Energy dots */}
                  {w.energyRating != null && w.energyRating > 0 && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>ENERGY</span>
                      <div className="flex gap-1">
                        {[1,2,3,4,5].map(n => (
                          <div key={n} style={{ width: 7, height: 7, borderRadius: '50%', background: n <= (w.energyRating ?? 0) ? accentColor : `${accentColor}25` }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {totalVol > 0 && (
                    <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${accentColor}15` }}>
                      <span className="monument-text" style={{ color: '#A0725A', fontSize: '8px', fontWeight: '700' }}>
                        VOLUME · <span style={{ color: accentColor }}>{totalVol.toLocaleString()} kg</span>
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
          const catExercises = cat ? (cat.exercises as readonly string[]) : []
          const borderColor = cat?.border ?? '#7A5FA8'
          const shadowColor = cat?.shadow ?? 'rgba(155,127,200,0.3)'
          const dotColor = cat?.color ?? '#9B7FC8'

          const todaySet = new Set(todayWorkouts.map(w => w.exercise))
          const todayForCat = isRestDay ? [] : todayWorkouts
            .filter(w => w.category === selectedWorkoutCategory || catExercises.includes(w.exercise))
            .map(w => w.exercise)
            .filter((e, i, arr) => arr.indexOf(e) === i)

          const histForCat = isRestDay ? [] : [
            ...historicalLogs.slice().sort((a, b) => b.date.localeCompare(a.date))
              .flatMap(d => d.workouts.map(w => w.exercise))
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
                  <div style={{ fontSize: '36px' }}>🛌</div>
                  <div className="monument-text text-center" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>Rest & Recovery</div>
                  <div className="monument-text text-center px-4" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', lineHeight: 1.6 }}>Rest days are when your body actually gets stronger.</div>
                  <button onClick={() => { logWorkout('Rest Day'); closeExerciseModal() }} className="monument-button px-6 py-3" style={{ background: 'linear-gradient(135deg,#9B7FC8,#B89FDE)', borderRadius: '12px', border: '2px solid #7A5FA8', color: '#fff', fontSize: '11px', fontWeight: '700', boxShadow: '0 4px 0 rgba(155,127,200,0.3)' }}>
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
          onClick={() => { logWorkout(activeLogCategory); setSelectedExercise(null) }}
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
    </div>
  )
}
