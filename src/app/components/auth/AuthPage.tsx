import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { enterDemo } from '@/lib/demo/demoMode'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'demo'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    background: 'rgba(255, 252, 248, 0.95)',
    border: '2px solid #8B5A3E',
    borderRadius: '14px',
    color: '#6B4423',
    // 16px stops iOS Safari from zooming the page when a field is focused
    fontSize: '16px',
    fontWeight: '600',
    boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
    fontFamily: 'Poppins, sans-serif',
  } as const

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (mode === 'signup' && inviteCode !== '12345') {
      setError('Invalid invite code.')
      setLoading(false)
      return
    }

    try {
      if (mode === 'signup') {
        const { error, session } = await signUp(email, password)
        if (error) { setError(error.message); return }
        // With email confirmation off, Supabase returns a session and the auth
        // listener logs the user straight in — nothing more to do here.
        if (!session) {
          // Confirmation is enabled on the project (Supabase also answers this
          // way for an already-registered email), so keep the wording neutral.
          setSuccess('Check your email to confirm your account, then sign in.')
          setMode('signin')
        }
        return
      }

      const { error } = await signIn(email, password)
      if (error) setError(error.message)
    } catch (err) {
      console.error('[auth] submit failed:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const labelStyle = { color: '#8B5A3E', fontSize: '10px', fontWeight: '700' } as const

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: '#F5E6D3' }}
    >
      {/* Logo area */}
      <div className="mb-8 text-center">
        <div className="flex justify-center mb-3">
          <img
            src="/rock-lee.jpeg"
            alt="VentureGain"
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              objectFit: 'cover',
              objectPosition: 'center',
              border: '3px solid #8B5A3E',
              boxShadow: '0 0 24px rgba(255, 159, 102, 0.4), 0 4px 0 rgba(139, 90, 62, 0.25)',
            }}
          />
        </div>
        <div className="monument-text" style={{ color: '#6B4423', fontSize: '24px', fontWeight: '800', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}>
          VentureGain
        </div>
        <div className="monument-text mt-1" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>
          YOUR HEALTH JOURNEY
        </div>
      </div>

      {/* Card */}
      <div className="monument-card p-6 w-full max-w-sm">
        {/* Tab toggle */}
        <div className="flex gap-2 mb-6">
          {(['signin', 'signup', 'demo'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); setSuccess(null) }}
              aria-pressed={mode === m}
              className="monument-button flex-1 py-3"
              style={mode === m
                ? { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }
                : { background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }
              }
            >
              {m === 'signin' ? 'SIGN IN' : m === 'signup' ? 'SIGN UP' : 'DEMO'}
            </button>
          ))}
        </div>

        {mode === 'demo' ? (
          <div className="space-y-4">
            <div className="monument-text text-center" style={{ color: '#6B4423', fontSize: '15px', fontWeight: '800' }}>Look around, no account needed</div>
            <ul className="space-y-2" style={{ color: '#8B5A3E', fontSize: '12px', fontWeight: '600', lineHeight: 1.45, listStyle: 'none', padding: 0, margin: 0 }}>
              <li>✨ Three weeks of sample workouts, meals and sleep</li>
              <li>🔥 Your companion reacts to the sample day</li>
              <li>🤖 AI scan and chat answer with example replies</li>
              <li>🔒 Nothing is saved to an account — it stays in this browser</li>
            </ul>
            <button
              type="button"
              onClick={enterDemo}
              className="monument-button w-full py-3 mt-2"
              style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
            >
              ENTER DEMO
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="monument-text block mb-2" style={labelStyle}>EMAIL</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="monument-text block mb-2" style={labelStyle}>PASSWORD</label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-invite" className="monument-text block mb-2" style={labelStyle}>INVITE CODE</label>
              <input
                id="auth-invite"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="Enter code"
                required
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div role="alert" className="monument-text px-3 py-2 text-center" style={{ background: 'rgba(211, 47, 47, 0.1)', border: '2px solid rgba(211, 47, 47, 0.3)', borderRadius: '10px', color: '#D32F2F', fontSize: '10px', fontWeight: '700' }}>
              {error}
            </div>
          )}

          {success && (
            <div role="status" aria-live="polite" className="monument-text px-3 py-2 text-center" style={{ background: 'rgba(76, 175, 80, 0.1)', border: '2px solid rgba(76, 175, 80, 0.3)', borderRadius: '10px', color: '#2E7D32', fontSize: '10px', fontWeight: '700' }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            aria-disabled={loading}
            aria-busy={loading}
            className="monument-button w-full py-3 mt-2"
            style={{ background: loading ? 'rgba(255, 184, 138, 0.5)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
          >
            {loading ? (mode === 'signin' ? 'SIGNING IN...' : 'CREATING...') : mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </form>
        )}
      </div>

      {/* 60-second launch film (public/film.html), built from the demo account */}
      <div className="w-full max-w-sm mt-6">
        <div className="flex items-center gap-3 mb-2" aria-hidden="true">
          <div style={{ flex: 1, height: 1.5, background: 'rgba(139, 90, 62, 0.2)' }} />
          <span className="monument-text" style={{ color: '#A0725A', fontSize: '10px', fontWeight: '700', letterSpacing: '1px' }}>WATCH THE 80-SECOND TOUR</span>
          <div style={{ flex: 1, height: 1.5, background: 'rgba(139, 90, 62, 0.2)' }} />
        </div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: '14px', overflow: 'hidden', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', background: '#0E0B09' }}>
          <iframe
            src="/film.html"
            title="VentureGain launch film"
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
        <a
          href="/film.html"
          target="_blank"
          rel="noopener"
          className="monument-text block text-center mt-2"
          style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px' }}
        >
          OPEN FULL SCREEN ↗
        </a>
      </div>
    </div>
  )
}
