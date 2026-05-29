const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const KEY = import.meta.env.VITE_GROQ_API_KEY

function headers() {
  return { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }
}

/** Plain text prompt → response string */
export async function groqText(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.1, max_tokens: 500 }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** Image (base64) + text prompt → response string */
export async function groqVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: prompt },
        ],
      }],
      temperature: 0.1,
      max_tokens: 500,
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** Multi-turn chat — pass full history each time */
export async function groqChat(
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      temperature: 0.7,
      max_tokens: 200,
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? "Sorry, I couldn't reach the AI right now."
}
