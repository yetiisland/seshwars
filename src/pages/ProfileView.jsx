import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import SpotCard from '../components/SpotCard'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

export default function ProfileView({ user, spots, onAddSpot, showNav = true, onSearch, saved, onSavePress, onSpotClick }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showMySpots, setShowMySpots] = useState(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769)
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 769)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const [profile, setProfile] = useState({ username: '', first_name: '', last_name: '', avatar_url: '' })
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const avatarRef = useRef()

  const identifier = user?.email?.split('@')[0] || ''
  const mySpots = spots.filter(s => s.added_by === identifier || s.added_by === user?.id)

  useEffect(() => {
    if (!user?.id) return
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setProfile({ username: data.username || '', first_name: data.first_name || '', last_name: data.last_name || '', avatar_url: data.avatar_url || '' })
        else {
          const defaultUsername = identifier
          supabase.from('profiles').insert({ id: user.id, username: defaultUsername })
          setProfile(p => ({ ...p, username: defaultUsername }))
        }
      })
  }, [user?.id])

  const handleAuth = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message) }
      else {
        setMessage('Check your email to confirm your account!')
        if (data?.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            username: email.split('@')[0],
            first_name: firstName,
            last_name: lastName,
          })
        }
      }
    }
    setLoading(false)
  }

  const handleSaveProfile = async () => {
    if (!user?.id) return
    setSaving(true)
    await supabase.from('profiles').upsert({
      id: user.id,
      username: profile.username,
      first_name: profile.first_name,
      last_name: profile.last_name,
    })
    setSaving(false)
    setEditMode(false)
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    const ext = file.name.split('.').pop()
    const path = `${user.id}.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) return
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').upsert({ id: user.id, avatar_url: publicUrl })
    setProfile(p => ({ ...p, avatar_url: publicUrl }))
  }

  const handleRemoveAvatar = async () => {
    if (!user?.id) return
    await supabase.from('profiles').upsert({ id: user.id, avatar_url: null })
    setProfile(p => ({ ...p, avatar_url: null }))
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleSendFeedback = async () => {
    if (!feedbackText.trim() || feedbackSending) return
    setFeedbackSending(true)
    const senderEmail = user?.email || 'Anonymous'
    try {
      await supabase.functions.invoke('send-feedback', {
        body: { feedback: feedbackText.trim(), senderEmail },
      })
    } catch {}
    setFeedbackSending(false)
    setFeedbackSent(true)
    setFeedbackText('')
    setTimeout(() => {
      setShowFeedbackSheet(false)
      setFeedbackSent(false)
    }, 1800)
  }

  if (!user) {
    return (
      <>
        {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
        <div className="scroll-area">
          <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480, margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {mode === 'login' ? 'Sign In' : 'Join the Crew'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {mode === 'login' ? 'Sign in to save spots and drop new ones.' : 'Create an account to start adding spots.'}
            </div>
            {mode === 'signup' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
                <input className="form-input" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            )}
            <input className="form-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input className="form-input" type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
            {error && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{error}</div>}
            {message && <div style={{ fontSize: 11, color: '#d4785a', fontWeight: 700 }}>{message}</div>}
            <button className="btn-salmon" onClick={handleAuth} disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}>
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </div>
          </div>
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </>
    )
  }

  const displayName = profile.first_name && profile.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile.username || identifier

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <div className="scroll-area">
        <div style={{ padding: '24px 14px 0', maxWidth: 480, margin: '0 auto', width: '100%' }}>

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => avatarRef.current?.click()}
                style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECEDF2', border: '2px solid #C8CAD4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#6a6c7a' }}>
                    {(profile.first_name?.[0] || identifier[0] || '?').toUpperCase()}
                  </span>
                )}
              </div>
              {profile.avatar_url && (
                <div onClick={handleRemoveAvatar} style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /><line x1="7" y1="1" x2="1" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </div>
              )}
              <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>@{profile.username || identifier}</div>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{user.email}</div>
            </div>
          </div>

          {/* Edit button below name */}
          <div style={{ marginBottom: 20 }}>
            <div
              onClick={() => setEditMode(e => !e)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                border: '1px solid rgba(212,120,90,0.5)', borderRadius: 6,
                padding: '5px 12px', cursor: 'pointer',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M9.5 2L12 4.5L5 11.5H2.5V9L9.5 2Z" stroke="#d4785a" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--salmon)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {editMode ? 'Cancel' : 'Edit Profile'}
              </span>
            </div>
          </div>

          {/* Edit fields */}
          {editMode && (
            <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="section-label" style={{ marginBottom: 4 }}>First Name</div>
                  <input className="form-input" placeholder="First name" value={profile.first_name} onChange={e => setProfile(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="section-label" style={{ marginBottom: 4 }}>Last Name</div>
                  <input className="form-input" placeholder="Last name" value={profile.last_name} onChange={e => setProfile(p => ({ ...p, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <div className="section-label" style={{ marginBottom: 4 }}>Username</div>
                <input className="form-input" placeholder="Username" value={profile.username} onChange={e => setProfile(p => ({ ...p, username: e.target.value }))} />
              </div>
              <button className="btn-salmon" onClick={handleSaveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
            </div>
          )}

          {/* Stats — clickable My Spots box */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div
              onClick={() => setShowMySpots(true)}
              style={{ flex: 1, background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="22" viewBox="0 0 20 24" fill="none">
                  <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                  <circle cx="10" cy="10" r="4" fill="#fff" />
                </svg>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--salmon)' }}>{mySpots.length}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Spots Added</div>
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <div className="divider" />

          {/* Support section */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', textAlign: 'center', marginBottom: 14, letterSpacing: 0.3 }}>
              Help Keep This App Running 🤘
            </div>

            <button
              onClick={() => setShowFeedbackSheet(true)}
              style={{ width: '100%', padding: '13px 16px', borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', marginBottom: 6 }}
            >
              Send Feedback
            </button>

            <button
              onClick={() => window.open('https://venmo.com/taylorselgas', '_blank')}
              style={{ width: '100%', padding: '13px 16px', borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
            >
              Donate
            </button>
          </div>

          {/* Feedback bottom sheet */}
          {showFeedbackSheet && (
            <div className="modal-overlay" onClick={() => setShowFeedbackSheet(false)}>
              <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ paddingLeft: 20, paddingRight: 20 }}>
                <div className="modal-handle" />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div className="modal-title">Send Feedback</div>
                  <div
                    onClick={() => setShowFeedbackSheet(false)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                {feedbackSent ? (
                  <div style={{ fontSize: 13, color: '#4a9a5a', fontWeight: 700, textAlign: 'center', padding: '20px 0' }}>
                    Thanks! Your feedback was sent.
                  </div>
                ) : (
                  <>
                    <textarea
                      className="form-input"
                      placeholder="Share your feedback, ideas, or report a bug..."
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      style={{ marginBottom: 12, minHeight: 100, resize: 'none' }}
                      autoFocus
                    />
                    <button
                      onClick={handleSendFeedback}
                      disabled={feedbackSending || !feedbackText.trim()}
                      style={{ width: '100%', padding: '13px 16px', borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: (!feedbackText.trim() || feedbackSending) ? 0.5 : 1 }}
                    >
                      {feedbackSending ? 'Sending...' : 'Send'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div onClick={handleSignOut} style={{ padding: '12px 0', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer' }}>
            Sign Out
          </div>
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>

      {/* My Spots overlay — scoped to content area (does not cover TabBar) */}
      {showMySpots && (
        <div style={{ position: 'absolute', inset: 0, background: '#FDF8F0', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px',
            background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
          }}>
            <div onClick={() => setShowMySpots(false)} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              My Spots
            </div>
            <div style={{ width: 36 }} />
          </div>
          <div className="scroll-area" style={{ paddingTop: 14 }}>
            {mySpots.length === 0 ? (
              <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                No spots added yet
              </div>
            ) : (
              mySpots.map(spot => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  saved={saved?.has(spot.id) ?? false}
                  onSavePress={onSavePress}
                  onClick={s => { setShowMySpots(false); onSpotClick?.(s) }}
                />
              ))
            )}
            <div style={{ height: BOTTOM_PAD }} />
          </div>
        </div>
      )}
      </div>{/* end content wrapper */}

    </>
  )
}
