import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(null)
  const [error, setError] = useState('')
  const [resetSent, setResetSent] = useState(false)

  const switchMode = (m) => {
    setMode(m)
    setEmail('')
    setPassword('')
    setShowPass(false)
    setFirstName('')
    setLastName('')
    setUsername('')
    setError('')
    setResetSent(false)
    setLoading(false)
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError('Please enter your email and password.'); return }
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (err) {
      if (err.message.includes('Invalid login credentials')) setError('Wrong email or password.')
      else if (err.message.includes('Email not confirmed')) setError('Please verify your email first.')
      else setError(err.message)
    }
  }

  const handleSignup = async () => {
    if (!firstName.trim()) { setError('First name is required.'); return }
    if (!username.trim()) { setError('Username is required.'); return }
    if (!email.trim()) { setError('Email is required.'); return }
    if (!password) { setError('Password is required.'); return }
    if (username.trim().length < 3) { setError('Username must be at least 3 characters.'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) { setError('Username can only contain letters, numbers, and underscores.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setError('')
    setLoading(true)

    const { data: existing } = await supabase.from('profiles').select('id').eq('username', username.trim()).maybeSingle()
    if (existing) { setError('That username is already taken.'); setLoading(false); return }

    const { data, error: signupErr } = await supabase.auth.signUp({ email: email.trim(), password })
    if (signupErr) {
      if (signupErr.message.includes('already registered')) setError('An account with this email already exists.')
      else setError(signupErr.message)
      setLoading(false)
      return
    }

    if (data?.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        username: username.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
      })
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Enter your email address above first.'); return }
    setError('')
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setResetSent(true)
  }

  const handleOAuth = async (provider) => {
    setError('')
    setOauthLoading(provider)
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (err) {
      setOauthLoading(null)
      setError(err.message)
    }
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

  const PasswordInput = ({ value, onChange, placeholder }) => (
    <div style={{ position: 'relative' }}>
      <input
        className="form-input"
        type={showPass ? 'text' : 'password'}
        placeholder={placeholder || 'Password'}
        value={value}
        onChange={onChange}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        style={{ paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setShowPass(v => !v)}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: '#9a8878', display: 'flex', alignItems: 'center',
        }}
        tabIndex={-1}
      >
        <EyeIcon visible={showPass} />
      </button>
    </div>
  )

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#FDF8F0',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 24px',
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)',
      paddingBottom: 40,
    }}>
      {/* Stacked logo */}
      <img
        src="/sesh-wars_logo_stacked_salmon.png"
        alt="Seshwars"
        style={{ display: 'block', margin: '0 auto', maxWidth: 240, width: '100%', height: 'auto', marginBottom: 40 }}
        onError={e => { console.error('[AuthScreen] logo failed to load:', e.currentTarget.src) }}
      />

      {/* Mode tabs */}
      <div style={{
        display: 'flex',
        width: '100%',
        maxWidth: 400,
        marginBottom: 28,
        borderBottom: '1px solid #EAD8C8',
      }}>
        {[{ key: 'login', label: 'LOG IN' }, { key: 'signup', label: 'SIGN UP' }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchMode(key)}
            style={{
              flex: 1,
              padding: '10px 0',
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontFamily: 'Barlow, sans-serif',
              fontWeight: mode === key ? 900 : 700,
              color: mode === key ? '#2a1e14' : '#9a8878',
              background: 'none',
              border: 'none',
              borderBottom: mode === key ? '2px solid #d4785a' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {mode === 'login' ? (
          <>
            <input
              className="form-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
            />
            <PasswordInput
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {error && <div style={{ color: '#d9534f', fontSize: 11, fontWeight: 700, marginTop: 4 }}>{error}</div>}
            <button
              className="btn-salmon"
              onClick={handleLogin}
              disabled={loading}
              style={{ marginTop: 2 }}
            >
              {loading ? 'Logging in…' : 'LOG IN'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              {resetSent ? (
                <span style={{ fontSize: 12, color: '#2a8a4a', fontWeight: 700 }}>Password reset email sent!</span>
              ) : (
                <span
                  onClick={handleForgotPassword}
                  style={{ fontSize: 12, color: '#d4785a', cursor: 'pointer', fontWeight: 600 }}
                >
                  Forgot password?
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                autoComplete="given-name"
                style={{ flex: 1 }}
              />
              <input
                className="form-input"
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                autoComplete="family-name"
                style={{ flex: 1 }}
              />
            </div>
            <input
              className="form-input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
            />
            <input
              className="form-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
            <PasswordInput
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 characters)"
            />
            {error && <div style={{ color: '#d9534f', fontSize: 11, fontWeight: 700, marginTop: 4 }}>{error}</div>}
            <button
              className="btn-salmon"
              onClick={handleSignup}
              disabled={loading}
              style={{ marginTop: 2 }}
            >
              {loading ? 'Creating account…' : 'CREATE ACCOUNT'}
            </button>
          </>
        )}
      </div>

      {/* OR divider */}
      <div style={{
        width: '100%', maxWidth: 400,
        display: 'flex', alignItems: 'center', gap: 12,
        marginTop: 24, marginBottom: 16,
      }}>
        <div style={{ flex: 1, height: 1, background: '#C8CAD4' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#C8CAD4', letterSpacing: 1 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: '#C8CAD4' }} />
      </div>

      {/* Google button */}
      <button
        onClick={() => handleOAuth('google')}
        disabled={oauthLoading !== null}
        style={{
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '12px 16px',
          background: '#FFFFFF',
          border: '1px solid #C8CAD4',
          borderRadius: 6,
          cursor: oauthLoading !== null ? 'not-allowed' : 'pointer',
          fontFamily: 'Barlow, sans-serif',
          fontSize: 13,
          fontWeight: 700,
          color: '#2a1e14',
          marginBottom: 10,
          opacity: oauthLoading !== null ? 0.7 : 1,
        }}
      >
        {oauthLoading === 'google' ? (
          <span>Connecting…</span>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </>
        )}
      </button>

      {/* Apple button — hidden until Apple Sign-In is fully configured
           TODO on re-enable: replace the SVG icon above with a proper Apple logo SVG (current glyph renders broken)
      <button
        onClick={() => handleOAuth('apple')}
        disabled={oauthLoading !== null}
        style={{
          width: '100%',
          maxWidth: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '12px 16px',
          background: '#000000',
          border: '1px solid #000',
          borderRadius: 6,
          cursor: oauthLoading !== null ? 'not-allowed' : 'pointer',
          fontFamily: 'Barlow, sans-serif',
          fontSize: 13,
          fontWeight: 700,
          color: '#FFFFFF',
          opacity: oauthLoading !== null ? 0.7 : 1,
        }}
      >
        {oauthLoading === 'apple' ? (
          <span>Connecting…</span>
        ) : (
          <>
            <svg width="17" height="20" viewBox="0 0 814 1000" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 405.6 1 274.4 1 144.8 1 64.4 56 1 140.4 1c74.9 0 125.3 50 167.7 50 40.5 0 97.5-52.4 179.2-52.4 14.2 0 116.5 1.3 181.3 89.4zm-234-181.5c32.9-40.8 57.8-97.5 57.8-154.2 0-7.8-.6-15.6-2-22.4-54.8 2-118.8 36.9-157.3 83.2-31.3 37.5-60.8 94.2-60.8 151.8 0 8.5 1.3 16.9 2 19.5 3.2.6 8.5 1.3 13.8 1.3 49.4 0 109.4-33.5 146.5-79.2z" />
            </svg>
            Continue with Apple
          </>
        )}
      </button>
      */}

      {/* Terms */}
      <p style={{ fontSize: 11, color: '#b0a090', textAlign: 'center', marginTop: 28, lineHeight: 1.6 }}>
        By continuing you agree to our{' '}
        <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Terms of Service</span>.
      </p>
    </div>
  )
}
