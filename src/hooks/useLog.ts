import { useState } from 'react'
import type { LogCategory, LogPeriod, LogView, ChatMessage, WeekGroup } from '@/types'

/** Week number (same numbering as getWeeks) containing today, or null when
 *  today isn't in the given month. */
function currentWeekOf(month: number, year: number): number | null {
  const today = new Date()
  if (today.getMonth() !== month || today.getFullYear() !== year) return null
  let weekNum = 1
  for (let d = 1; d < today.getDate(); d++) {
    if (new Date(year, month, d).getDay() === 0) weekNum++
  }
  return weekNum
}

export function useLog() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [expandedWeek, setExpandedWeek] = useState<number | null>(() => {
    const today = new Date()
    return currentWeekOf(today.getMonth(), today.getFullYear())
  })
  const [activeView, setActiveView] = useState<LogView>('log')
  const [selectedCategory, setSelectedCategory] = useState<LogCategory>('workouts')
  const [selectedPeriod, setSelectedPeriod] = useState<LogPeriod>('daily')
  const [showChat, setShowChat] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [chatMessages] = useState<ChatMessage[]>([
    { text: "Hi! I'm your wellness companion. How can I help you today?", isUser: false },
  ])
  const [chatInput] = useState('')

  const getDaysInMonth = (month: number, year: number) =>
    new Date(year, month + 1, 0).getDate()

  // Changing month also resets the expanded week, so a week index from the old
  // month doesn't auto-open an unrelated week of the new one.
  const goToMonth = (month: number, year: number) => {
    setCurrentMonth(month)
    setCurrentYear(year)
    setExpandedWeek(currentWeekOf(month, year))
  }

  const goToPrevMonth = () => {
    if (currentMonth === 0) goToMonth(11, currentYear - 1)
    else goToMonth(currentMonth - 1, currentYear)
  }

  const goToNextMonth = () => {
    if (currentMonth === 11) goToMonth(0, currentYear + 1)
    else goToMonth(currentMonth + 1, currentYear)
  }

  const daysInMonth = getDaysInMonth(currentMonth, currentYear)

  const getDayName = (day: number) => {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return names[new Date(currentYear, currentMonth, day).getDay()]
  }

  const getWeeks = (): WeekGroup[] => {
    const weeks: WeekGroup[] = []
    let current: number[] = []
    let num = 1
    for (let day = 1; day <= daysInMonth; day++) {
      current.push(day)
      const dow = new Date(currentYear, currentMonth, day).getDay()
      if (dow === 0 || day === daysInMonth) {
        weeks.push({ weekNumber: num++, days: [...current] })
        current = []
      }
    }
    return weeks.reverse()
  }

  return {
    currentMonth, currentYear, selectedDay, setSelectedDay,
    expandedWeek, setExpandedWeek,
    activeView, setActiveView,
    selectedCategory, setSelectedCategory,
    selectedPeriod, setSelectedPeriod,
    showChat, setShowChat,
    showInsights, setShowInsights,
    chatMessages, chatInput,
    getDayName, getWeeks,
    goToPrevMonth, goToNextMonth,
  }
}
