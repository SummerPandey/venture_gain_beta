import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Dev-only: mirror the production /api/groq serverless function so `npm run dev`
 * keeps working. The key is read from .env.local (server-side, NOT VITE_*) and
 * used here in the Node dev server — it is never sent to the browser.
 */
function devGroqProxy(key: string): Plugin {
  return {
    name: 'dev-groq-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/groq', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        if (!key) { res.statusCode = 500; res.end(JSON.stringify({ error: 'GROQ_API_KEY missing from .env.local' })); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const upstream = await fetch(GROQ_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body,
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'Upstream request to Groq failed' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // empty prefix → load ALL vars (incl. non-VITE server-side secrets) for the
  // dev proxy; only VITE_* are ever exposed to client code by Vite.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      devGroqProxy(env.GROQ_API_KEY),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
