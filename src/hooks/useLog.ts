import { useState } from 'react'
import type { LogCategory, LogPeriod, LogView, ChatMessage, WeekGroup } from '@/types'

export function useLog() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [expandedWeek, setExpandedWeek] = useState<number | null>(() => {
    const today = new Date()
    const month = today.getMonth()
    const year = today.getFullYear()
    const todayDay = today.getDate()
    let weekNum = 1
    for (let d = 1; d <= new Date(year, month + 1, 0).getDate(); d++) {
      if (d === todayDay) return weekNum
      if (new Date(year, month, d).getDay() === 0) weekNum++
    }
    return null
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

  const goToPrevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
    else setCurrentMonth(m => m - 1)
  }

  const goToNextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
    else setCurrentMonth(m => m + 1)
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
