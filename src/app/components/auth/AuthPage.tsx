import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export function AuthPage() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
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
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)',
    outline: 'none',
    fontFamily: 'Poppins, sans-serif',
  } as const

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    if (mode === 'signup' && inviteCode !== '12345') {
      setError('Invalid invite code.')
      setLoading(false)
      return
    }

    if (mode === 'signup') {
      const { error, session } = await signUp(email, password)
      setLoading(false)
      if (error) { setError(error.message); return }
      // With email confirmation off, Supabase returns a session and the auth
      // listener logs the user straight in — nothing more to do here.
      if (!session) {
        // Confirmation is still enabled on the project; fall back to sign-in.
        setSuccess('Account created! You can sign in now.')
        setMode('signin')
      }
      return
    }

    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError(error.message)
  }

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
          {(['signin', 'signup'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); setSuccess(null) }}
              className="monument-button flex-1 py-2"
              style={mode === m
                ? { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }
                : { background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }
              }
            >
              {m === 'signin' ? 'SIGN IN' : 'SIGN UP'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={inputStyle}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="monument-text block mb-2" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>INVITE CODE</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="Enter code"
                required
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div className="monument-text px-3 py-2 text-center" style={{ background: 'rgba(211, 47, 47, 0.1)', border: '2px solid rgba(211, 47, 47, 0.3)', borderRadius: '10px', color: '#D32F2F', fontSize: '10px', fontWeight: '700' }}>
              {error}
            </div>
          )}

          {success && (
            <div className="monument-text px-3 py-2 text-center" style={{ background: 'rgba(76, 175, 80, 0.1)', border: '2px solid rgba(76, 175, 80, 0.3)', borderRadius: '10px', color: '#2E7D32', fontSize: '10px', fontWeight: '700' }}>
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="monument-button w-full py-3 mt-2"
            style={{ background: loading ? 'rgba(255, 184, 138, 0.5)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '14px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '12px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}
          >
            {loading ? '...' : mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
          </button>
        </form>
      </div>
    </div>
  )
}
