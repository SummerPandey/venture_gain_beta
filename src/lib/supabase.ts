import { createClient } from '@supabase/supabase-js'
import { IS_DEMO } from './demo/demoMode'
import { createDemoClient } from './demo/demoClient'
import { installDemoFetch } from './demo/demoFetch'

// Demo mode (no login) swaps in an in-browser client and answers /api calls locally,
// so it never touches the real project — see src/lib/demo/demoMode.ts.
if (IS_DEMO) installDemoFetch()

export const supabase = IS_DEMO
  ? createDemoClient()
  : createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    )

/** Always returns the current local date as YYYY-MM-DD. Call this fresh each time — never cache it. */
export function getToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
