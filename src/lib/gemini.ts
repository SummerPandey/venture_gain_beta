import { GoogleGenerativeAI } from '@google/generative-ai'

export const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY)

export const geminiFlash = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
