import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Supabase will fire PASSWORD_RECOVERY when it detects the recovery token in the URL
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    // Also check if there's already an active session with recovery (immediate case)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async () => {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setDone(true)
    setTimeout(() => navigate('/'), 2000)
  }

  const EyeIcon = ({ visible }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {visible ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0', fontFamily: 'Barlow, sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: '#d4785a', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>Sesh Wars</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#2a1e14', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {done ? 'Password updated!' : 'Set new password'}
            </div>
          </div>

          {done ? (
            <div style={{ fontSize: 13, color: '#5a4a3a', lineHeight: 1.6 }}>
              Your password has been updated. Taking you back to the app…
            </div>
          ) : !ready ? (
            <div style={{ fontSize: 13, color: '#9a8878' }}>
              Verifying reset link…
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#9a8878', lineHeight: 1.5 }}>
                Enter a new password for your account.
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="New password (min 6 characters)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  style={{ paddingRight: 44 }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9a8878', display: 'flex', alignItems: 'center' }}
                  tabIndex={-1}
                >
                  <EyeIcon visible={showPass} />
                </button>
              </div>

              {error && <div style={{ color: '#d9534f', fontSize: 11, fontWeight: 700 }}>{error}</div>}

              <button
                className="btn-salmon"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </>
          )}

          <button
            onClick={() => navigate('/')}
            style={{ fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif', padding: 0, textAlign: 'left' }}
          >
            ← Back to app
          </button>
        </div>
      </div>
    </div>
  )
}
