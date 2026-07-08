import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { loadProfile, useProfileStore } from '../lib/profileStore'
import { isAdminUser } from '../lib/admin'
import { useSavedSpots, useHiddenSpots } from '../hooks/useSpots'
import TabBar from '../components/TabBar'
import SpotDetail from './SpotDetail'
import SaveToListModal from '../components/SaveToListModal'
import AuthScreen from './AuthScreen'

export default function SpotPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [spot, setSpot] = useState(location.state?.spot || null)
  const [loading, setLoading] = useState(!location.state?.spot)
  const [user, setUser] = useState(null)
  const [authLoaded, setAuthLoaded] = useState(!!location.state?.spot)
  const [saveModalSpot, setSaveModalSpot] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const profile = useProfileStore()
  const profileAvatar = profile?.avatar_url || null
  const profileInitials = profile?.initials || ''

  const spotDetailRef = useRef(null)
  const rawTab = location.state?.prevTab || sessionStorage.getItem('activeTab') || 'spots'
  const prevTab = (rawTab === 'list' || rawTab === 'map') ? 'spots' : rawTab
  const { saved, refetchSaved } = useSavedSpots(user?.id)
  const { hiddenIds, refetchHidden } = useHiddenSpots(user?.id)

  const handleUnhide = async () => {
    if (!user?.id || !spot) return
    await supabase.from('hidden_spots').delete().eq('user_id', user.id).eq('spot_id', spot.id)
    refetchHidden()
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setAuthLoaded(true)
      if (session?.user) loadProfile(session.user)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (location.state?.spot) return
    async function fetchSpot() {
      let { data } = await supabase.from('spots').select('*').eq('slug', slug).single()
      if (!data) {
        const res = await supabase.from('spots').select('*').eq('id', slug).single()
        data = res.data
      }
      setSpot(data)
      setLoading(false)
    }
    fetchSpot()
  }, [slug, location.state?.spot])

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  const handleTabChange = (t) => {
    sessionStorage.setItem('activeTab', t)
    navigate('/')
  }

  const goToProfile = () => {
    if (!user) { setShowAuth(true); return }
    sessionStorage.setItem('activeTab', 'profile')
    navigate('/')
  }

  if (loading || !authLoaded) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#9a8878', fontWeight: 700 }}>
          Loading...
        </div>
        <TabBar active={prevTab} onChange={handleTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} />
      </div>
    )
  }

  if (!spot) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14', fontFamily: 'Barlow, sans-serif' }}>This spot is no longer available.</div>
          <button onClick={() => navigate('/')} style={{ fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
            ← Back to map
          </button>
        </div>
        <TabBar active={prevTab} onChange={handleTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} />
      </div>
    )
  }

  const isOwner = !!user && (user.id === spot.added_by || user.email?.split('@')[0] === spot.added_by)
  const isAdmin = isAdminUser(user)

  if (spot.visibility === 'private' && !isOwner && !isAdmin) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px', textAlign: 'center' }}>
          <svg width="36" height="42" viewBox="0 0 14 16" fill="none">
            <rect x="3" y="7" width="8" height="8" rx="1.5" stroke="#b0906a" strokeWidth="1.4"/>
            <path d="M4.5 7V5a2.5 2.5 0 015 0v2" stroke="#b0906a" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14', fontFamily: 'Barlow, sans-serif' }}>This spot is private.</div>
          <div style={{ fontSize: 11, color: '#9a8878', fontFamily: 'Barlow, sans-serif', fontWeight: 600 }}>Only the owner can view this spot.</div>
          <button onClick={() => navigate('/')} style={{ fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif', marginTop: 4 }}>
            ← Back to map
          </button>
        </div>
        <TabBar active={prevTab} onChange={handleTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} />
      </div>
    )
  }

  return (
    <div className="desktop-page-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0', overflow: 'hidden' }}>
      {/* Cream navbar with back button + spot title */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 14px 10px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        background: '#FDF8F0',
        borderBottom: '1px solid rgba(212,120,90,0.12)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div
          onClick={handleBack}
          style={{ width: 32, height: 32, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {spot.title}
        </div>
        {(isOwner || isAdmin) ? (
          <div
            onClick={() => spotDetailRef.current?.handleEditClick()}
            style={{ width: 32, height: 32, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 2L12 4.5L5 11.5H2.5V9L9.5 2Z" stroke="#d4785a" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div style={{ width: 32 }} />
        )}
      </div>

      {/* Spot detail content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <SpotDetail
          ref={spotDetailRef}
          spot={spot}
          saved={saved.has(spot.id)}
          onSavePress={(s) => { if (!user) { setShowAuth(true); return } setSaveModalSpot(s) }}
          onBack={handleBack}
          onEditSuccess={handleBack}
          user={user}
          onGoProfile={goToProfile}
          isHidden={hiddenIds.has(spot.id)}
          onUnhidePress={handleUnhide}
        />
      </div>

      <TabBar active={prevTab} onChange={handleTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} />

      {saveModalSpot && (
        <SaveToListModal
          spot={saveModalSpot}
          user={user}
          onClose={() => { setSaveModalSpot(null); refetchSaved() }}
        />
      )}
      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
    </div>
  )
}
