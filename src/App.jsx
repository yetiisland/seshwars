import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { loadProfile, clearProfile, useProfileStore } from './lib/profileStore'
import { isAdminUser } from './lib/admin'
import AuthScreen from './pages/AuthScreen'
import { useSpots, useSavedSpots } from './hooks/useSpots'
import { useGeolocation, haversineDistance } from './hooks/useGeolocation'
import TabBar from './components/TabBar'
import Logo from './components/Logo'
import { PlusIcon, MapFoldedIcon, BookmarkIcon } from './components/Icons'
import SaveToListModal from './components/SaveToListModal'
import ListView from './pages/ListView'
import MapView from './pages/MapView'
import SavedView from './pages/SavedView'
import ProfileView from './pages/ProfileView'
import AddSpot from './pages/AddSpot'
import SearchPage from './pages/SearchPage'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Module-level auth cache — survives App unmount/remount so there's no loading flash
// when navigating back from a spot page.
let _cachedUser = null
let _authReady = false
const SEARCH_RADIUS_MILES = 100 / 1.60934

const TABS = [
  { id: 'spots', label: 'Spots', Icon: MapFoldedIcon },
  { id: 'saved', label: 'Saved', Icon: BookmarkIcon },
  { id: 'profile', label: 'Profile', Icon: null },
]

function normalizeTab(t) {
  if (t === 'list' || t === 'map') return 'spots'
  if (t === 'spots' || t === 'saved' || t === 'profile') return t
  return 'spots'
}

const IS_STANDALONE = window.navigator.standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches

function SafeAreaTop() {
  // In standalone PWA mode the status bar sits above the content — only need
  // to fill env(safe-area-inset-top) so the background colour shows through.
  // In browser mode the browser renders its own chrome above the page so this
  // component isn't needed (content already starts below the address bar).
  if (IS_STANDALONE) {
    return (
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: 'env(safe-area-inset-top)',
        background: '#FDF8F0', zIndex: 300, pointerEvents: 'none', flexShrink: 0,
      }} />
    )
  }
  return null
}

function AuthPromptModal({ onClose, onGoProfile }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ padding: '0 20px 8px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Save Spots</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Create an account to save spots and sync them across devices.
          </div>
        </div>
        <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn-salmon" onClick={onGoProfile}>Create Account / Sign In</button>
        </div>
        <div className="modal-cancel" onClick={onClose}>Not now</div>
      </div>
    </div>
  )
}

function LocationChip({ location, onClear }) {
  return (
    <div style={{ padding: '6px 16px', flexShrink: 0 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', borderRadius: 6, padding: '5px 10px 5px 8px' }}>
        <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
          <path d="M5 0C2.25 0 0 2.25 0 5C0 7.75 5 12 5 12C5 12 10 7.75 10 5C10 2.25 7.75 0 5 0Z" fill="#d4785a" />
          <circle cx="5" cy="5" r="2" fill="#fff" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#d4785a', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Near {location.name}
        </span>
        <div onClick={onClear} style={{ marginLeft: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" fill="rgba(212,120,90,0.15)" />
            <line x1="4" y1="4" x2="8" y2="8" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="8" y1="4" x2="4" y2="8" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function SearchBtn({ onClick }) {
  return (
    <div onClick={onClick} style={{ width: 34, height: 34, borderRadius: 6, background: '#FDF8F0', border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
        <circle cx="6" cy="6" r="4" stroke="#d4785a" strokeWidth="1.3" />
        <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function DesktopSearchBar({ spots, searchLocation, onSelect, onClear }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const skipRef = useRef(false)
  const wrapperRef = useRef(null)

  useEffect(() => {
    skipRef.current = true
    setQuery(searchLocation ? searchLocation.name : '')
    setSuggestions([])
    setOpen(false)
  }, [searchLocation])

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return }
    clearTimeout(timer.current)
    if (!query.trim()) { setSuggestions([]); setLoading(false); setOpen(false); return }
    setLoading(true)
    setOpen(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,region,postcode&country=US&access_token=${MAPBOX_TOKEN}&limit=5`
        )
        const data = await res.json()
        setSuggestions((data.features || []).map(f => ({
          id: f.id,
          name: f.text,
          placeName: f.place_name,
          longitude: f.geometry.coordinates[0],
          latitude: f.geometry.coordinates[1],
        })))
      } catch { setSuggestions([]) }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query])

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (item) => {
    skipRef.current = true
    setQuery(item.name)
    setOpen(false)
    setSuggestions([])
    onSelect({ name: item.name, placeName: item.placeName, longitude: item.longitude, latitude: item.latitude })
  }

  const handleClear = () => {
    skipRef.current = true
    setQuery('')
    setOpen(false)
    setSuggestions([])
    onClear()
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', maxWidth: 400, width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 10, pointerEvents: 'none', display: 'flex' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4" stroke="#d4785a" strokeWidth="1.3" />
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </div>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          placeholder="Search by city or area..."
          style={{
            width: '100%', background: '#FFFFFF', border: '1px solid #C8CAD4',
            borderRadius: 6, padding: '7px 30px 7px 28px',
            fontSize: 12, color: 'var(--text-primary)', fontFamily: 'Barlow, sans-serif',
            outline: 'none',
          }}
        />
        {query && (
          <div onClick={handleClear} style={{ position: 'absolute', right: 8, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" fill="#C8CAD4" />
              <line x1="5" y1="5" x2="11" y2="11" stroke="#6a6c7a" strokeWidth="1.3" strokeLinecap="round" />
              <line x1="11" y1="5" x2="5" y2="11" stroke="#6a6c7a" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>
      {open && (suggestions.length > 0 || loading) && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 2000, overflow: 'hidden',
        }}>
          {loading && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Searching…</div>
          )}
          {suggestions.map((item, i) => (
            <div
              key={item.id || i}
              onClick={() => handleSelect(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', cursor: 'pointer',
                borderTop: i > 0 ? '1px solid #ECEDF2' : 'none',
                background: 'transparent',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FDF8F0' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="12" height="16" viewBox="0 0 20 24" fill="none">
                <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill={i === 0 ? '#d4785a' : 'none'} stroke="#d4785a" strokeWidth="1.8" />
                <circle cx="10" cy="10" r="4" fill={i === 0 ? '#fff' : 'none'} stroke={i === 0 ? 'none' : '#d4785a'} strokeWidth="1.8" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{item.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.placeName?.split(', ').slice(1).join(', ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)
const _FILTER_TYPES = new Set(['Street', 'DIY', 'Skatepark', 'Skate Shop'])
const _FILTER_BUSTS = new Set(['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only'])
function matchesFilters(s, filters) {
  if (filters.includes('All') || filters.length === 0) return true
  const selTypes = filters.filter(f => _FILTER_TYPES.has(f))
  const selBusts = filters.filter(f => _FILTER_BUSTS.has(f))
  const selFeats = filters.filter(f => !_FILTER_TYPES.has(f) && !_FILTER_BUSTS.has(f) && f !== 'All')
  if (selTypes.length > 0 && !selTypes.some(t => normalizeType(s.type) === normalizeType(t))) return false
  if (selFeats.length > 0 && !selFeats.some(f => (s.features || []).map(x => x.toLowerCase()).includes(f.toLowerCase()))) return false
  if (selBusts.length > 0 && !selBusts.includes(s.bust_rating)) return false
  return true
}

export default function App() {
  const navigate = useNavigate()
  const [tab, setTab] = useState(() => normalizeTab(sessionStorage.getItem('activeTab') || 'spots'))
  const [spotsView, setSpotsView] = useState(() => sessionStorage.getItem('spotsView') || 'list')
  const [user, setUser] = useState(_cachedUser)
  const [authLoaded, setAuthLoaded] = useState(_authReady)
  const profile = useProfileStore()
  const profileAvatar = profile?.avatar_url || null
  const profileInitials = profile?.initials || ''
  const [showAdd, setShowAdd] = useState(false)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchLocation, setSearchLocation] = useState(null)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  const [filters, setFilters] = useState(['All'])
  const [distanceRadius, setDistanceRadius] = useState(null)
  const { spots, loading, refetch } = useSpots()
  const { saved, refetchSaved } = useSavedSpots(user?.id)
  const [saveModalSpot, setSaveModalSpot] = useState(null)
  const userLocation = useGeolocation()
  const isAdmin = isAdminUser(user)

  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 769)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const spotsWithDistance = useMemo(() => {
    const baseSpots = spots.map(s => {
      if (!s.latitude || !s.longitude) return s
      if (searchLocation) {
        const dist = haversineDistance(searchLocation.latitude, searchLocation.longitude, s.latitude, s.longitude)
        return { ...s, distance: parseFloat(dist.toFixed(1)) }
      }
      if (!userLocation) return s
      const dist = haversineDistance(userLocation.latitude, userLocation.longitude, s.latitude, s.longitude)
      return { ...s, distance: parseFloat(dist.toFixed(1)) }
    })
    if (searchLocation) {
      return baseSpots
        .filter(s => s.latitude && s.longitude && s.distance <= SEARCH_RADIUS_MILES)
        .sort((a, b) => a.distance - b.distance)
    }
    if (userLocation) {
      return [...baseSpots].sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0
        if (a.distance == null) return 1
        if (b.distance == null) return -1
        return a.distance - b.distance
      })
    }
    return baseSpots
  }, [spots, userLocation, searchLocation])

  const visibleSpots = useMemo(() => {
    if (isAdmin) return spotsWithDistance
    return spotsWithDistance.filter(s => {
      const status = s.moderation_status
      const passesModeration = !status || status === 'approved' ||
        (status === 'pending' && user?.id && s.added_by === user.id)
      if (!passesModeration) return false
      // Only public spots appear in list/map/search — private and unlisted are link-only
      const vis = s.visibility || 'public'
      return vis === 'public'
    })
  }, [spotsWithDistance, isAdmin, user])

  const filteredByDistance = useMemo(() => {
    if (!distanceRadius || (!userLocation && !searchLocation)) return visibleSpots
    return visibleSpots.filter(s => s.distance != null && s.distance <= distanceRadius)
  }, [visibleSpots, distanceRadius, userLocation, searchLocation])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      const u = session?.user ?? null
      _cachedUser = u
      _authReady = true
      setUser(u)
      setAuthLoaded(true)
      if (u) loadProfile(u)
      else clearProfile()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      const u = session?.user ?? null
      _cachedUser = u
      _authReady = true
      setUser(u)
      setAuthLoaded(true)
      if (event === 'SIGNED_IN' && session?.user) {
        const u = session.user
        const provider = u.app_metadata?.provider

        const isConfirmRedirect = window.location.hash.includes('access_token') && window.location.hash.includes('type=signup')
        const isNewSignup = sessionStorage.getItem('seshwars:newSignup') === '1'

        if (isConfirmRedirect) {
          window.history.replaceState(null, '', window.location.pathname + '#/')
          showToast('Email confirmed — welcome to Seshwars! 🤙')
          const { data: profile } = await supabase.from('profiles').select('id').eq('id', u.id).maybeSingle()
          if (!profile) {
            const meta = u.user_metadata || {}
            if (meta.username) {
              await supabase.from('profiles').upsert({
                id: u.id,
                username: meta.username,
                first_name: meta.first_name || '',
                last_name: meta.last_name || null,
              }, { onConflict: 'id' }).catch(() => {})
            }
          }
        } else if (isNewSignup) {
          sessionStorage.removeItem('seshwars:newSignup')
          setTab('spots')
          sessionStorage.setItem('activeTab', 'spots')
          // Profile is created by AuthScreen's own upsert — no creation here to avoid race
        } else if (provider && provider !== 'email') {
          const { data: profile } = await supabase.from('profiles').select('id').eq('id', u.id).maybeSingle()
          if (!profile) {
            const meta = u.user_metadata || {}
            const fullName = (meta.full_name || meta.name || '').trim()
            const parts = fullName.split(' ')
            const firstName = meta.given_name || parts[0] || ''
            const lastName = meta.family_name || parts.slice(1).join(' ') || ''
            const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'skater'
            const uname = base + '_' + Math.floor(Math.random() * 9000 + 1000)
            await supabase.from('profiles').insert({ id: u.id, username: uname, first_name: firstName, last_name: lastName || null }).catch(() => {})
          }
        }
      }
      if (event === 'SIGNED_IN' && u) loadProfile(u)
      if (event === 'SIGNED_OUT') { _cachedUser = null; clearProfile() }
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (user && showAuth) setShowAuth(false)
  }, [user, showAuth])

  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener('seshwars:spots-changed', handler)
    return () => window.removeEventListener('seshwars:spots-changed', handler)
  }, [refetch])

  const openSearch = () => setShowSearch(s => !s)
  const closeSearch = () => setShowSearch(false)
  const handleSelectLocation = (entry) => { setSearchLocation(entry); closeSearch() }
  const handleClearSearch = () => setSearchLocation(null)
  const handleSavePress = (spot) => { if (!user) { setShowAuth(true); return } setSaveModalSpot(spot) }
  const handleAddSuccess = () => { setShowAdd(false); refetch() }
  const openAdd = () => { if (!user) { setShowAuth(true); return } setShowAdd(true); closeSearch() }

  const handleSpotClick = (spot) => {
    const id = spot.slug || spot.id
    sessionStorage.setItem('activeTab', tab)
    sessionStorage.setItem('spotsView', spotsView)
    navigate(`/spots/${id}`, { state: { spot, prevTab: tab } })
  }

  const handleTabChange = (t) => {
    const normalized = normalizeTab(t)
    if (!user && (normalized === 'saved' || normalized === 'profile')) {
      setShowAuth(true)
      return
    }
    setTab(normalized)
    sessionStorage.setItem('activeTab', normalized)
    closeSearch()
  }

  const handleSpotsViewChange = (v) => {
    setSpotsView(v)
    sessionStorage.setItem('spotsView', v)
  }

  const goToProfile = () => {
    setShowAuthPrompt(false)
    setSaveModalSpot(null)
    closeSearch()
    if (!user) { setShowAuth(true); return }
    setTab('profile')
  }

  if (!authLoaded) return <div className="loading" />

  const effectiveTab = user ? tab : (tab === 'saved' || tab === 'profile' ? 'spots' : tab)

  // Desktop layout
  if (isDesktop) {
    return (
      <>
        {/* Fixed top nav */}
        <div className="desktop-top-nav">
          <div className="desktop-nav-inner">
            <div className="desktop-nav-left">
              <Logo />
            </div>
            <div className="desktop-nav-center">
              <DesktopSearchBar spots={spots} searchLocation={searchLocation} onSelect={handleSelectLocation} onClear={handleClearSearch} />
            </div>
            <div className="desktop-nav-right">
              <button className="btn-drop-spot" onClick={openAdd}>
                <PlusIcon color="#fff" />
                <span>DROP A SPOT</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content area — map is full-width exception; everything else constrained to 1200px */}
        <div className={`desktop-content${effectiveTab === 'spots' && spotsView === 'map' ? '' : ' desktop-content-constrained'}`}>
          {effectiveTab === 'spots' && spotsView === 'list' && (
            <ListView
              spots={filteredByDistance}
              loading={loading}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
              onAddSpot={openAdd}
              onSearch={openSearch}
              searchLocation={searchLocation}
              onClearSearch={handleClearSearch}
              showNav={false}
              filters={filters}
              onFiltersChange={setFilters}
              distance={distanceRadius}
              onDistanceChange={setDistanceRadius}
            />
          )}
          {effectiveTab === 'spots' && spotsView === 'map' && (
            <MapView
              spots={filteredByDistance}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
              onAddSpot={openAdd}
              userLocation={userLocation}
              searchLocation={searchLocation}
              showNav={false}
              filters={filters}
              onFiltersChange={setFilters}
              distance={distanceRadius}
              onDistanceChange={setDistanceRadius}
            />
          )}
          {effectiveTab === 'saved' && (
            <SavedView
              spots={visibleSpots}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
              onAddSpot={openAdd}
              onSearch={openSearch}
              showNav={false}
              user={user}
            />
          )}
          {effectiveTab === 'profile' && (
            <ProfileView
              user={user}
              spots={spots}
              onAddSpot={openAdd}
              onSearch={openSearch}
              showNav={false}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
            />
          )}
        </div>

        {/* Spots view toggle pill for desktop */}
        {effectiveTab === 'spots' && (
          <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', zIndex: 1001 }}>
            <div style={{ display: 'flex', background: '#d4785a', borderRadius: 50, padding: '4px 5px', gap: 3, boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
              <div onClick={() => handleSpotsViewChange('list')} style={{ padding: '6px 18px', borderRadius: 50, background: spotsView === 'list' ? '#fff' : 'transparent', color: spotsView === 'list' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>LIST</div>
              <div onClick={() => handleSpotsViewChange('map')} style={{ padding: '6px 18px', borderRadius: 50, background: spotsView === 'map' ? '#fff' : 'transparent', color: spotsView === 'map' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>MAP</div>
            </div>
          </div>
        )}

        {/* Floating bottom nav pill */}
        <div className="desktop-float-nav">
          {TABS.map(({ id, Icon }) => (
            <div
              key={id}
              className={`tab-item ${effectiveTab === id ? 'active' : ''}`}
              onClick={() => handleTabChange(id)}
              style={{ flex: 1 }}
            >
              {id === 'profile' ? (
                <div style={{ width: 33, height: 33, borderRadius: '50%', background: profileAvatar ? 'transparent' : '#d4785a', border: tab === 'profile' ? '2.5px solid #fff' : '2.5px solid rgba(255,255,255,0.3)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {profileAvatar ? <img src={profileAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{profileInitials}</span>}
                </div>
              ) : (
                <Icon color="#ffffff" size={36} filled={tab === id} />
              )}
            </div>
          ))}
        </div>

        {/* Add spot overlay */}
        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }} onClick={() => setShowAdd(false)}>
            <div style={{ background: '#FDF8F0', borderRadius: 12, overflow: 'hidden', width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative' }} onClick={e => e.stopPropagation()}>
              <AddSpot onClose={() => setShowAdd(false)} onSuccess={handleAddSuccess} user={user} onGoProfile={goToProfile} />
            </div>
          </div>
        )}

        {saveModalSpot && (
          <SaveToListModal
            spot={saveModalSpot}
            user={user}
            onClose={() => { setSaveModalSpot(null); refetchSaved() }}
          />
        )}

        {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}

      </>
    )
  }

  // Mobile layout — TabBar is position:absolute; AddSpot overlays content area
  return (
    <>
      <SafeAreaTop />
      {showAdd ? (
        <AddSpot onClose={() => setShowAdd(false)} onSuccess={handleAddSuccess} user={user} onGoProfile={goToProfile} />
      ) : (
        <>
          {effectiveTab === 'spots' && spotsView === 'list' && (
            <ListView
              spots={filteredByDistance}
              loading={loading}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
              onAddSpot={openAdd}
              onSearch={openSearch}
              searchLocation={searchLocation}
              onClearSearch={handleClearSearch}
              filters={filters}
              onFiltersChange={setFilters}
              distance={distanceRadius}
              onDistanceChange={setDistanceRadius}
            />
          )}
          {effectiveTab === 'spots' && spotsView === 'map' && (
            <MapView
              spots={filteredByDistance}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
              onAddSpot={openAdd}
              userLocation={userLocation}
              searchLocation={searchLocation}
              onSearch={openSearch}
              filters={filters}
              onFiltersChange={setFilters}
              distance={distanceRadius}
              onDistanceChange={setDistanceRadius}
            />
          )}
          {effectiveTab === 'saved' && (
            <SavedView
              spots={visibleSpots}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
              onAddSpot={openAdd}
              onSearch={openSearch}
              user={user}
            />
          )}
          {effectiveTab === 'profile' && (
            <ProfileView
              user={user}
              spots={spots}
              onAddSpot={openAdd}
              onSearch={openSearch}
              saved={saved}
              onSavePress={handleSavePress}
              onSpotClick={handleSpotClick}
            />
          )}
        </>
      )}

      {/* Spots view toggle pill — above tab bar, only when on spots tab */}
      {effectiveTab === 'spots' && !showAdd && (
        <div style={{ position: 'absolute', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 70px)', left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 1001, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', background: '#d4785a', borderRadius: 50, padding: '4px 5px', gap: 3, boxShadow: '0 3px 14px rgba(0,0,0,0.28)', pointerEvents: 'all' }}>
            <div onClick={() => handleSpotsViewChange('list')} style={{ padding: '6px 18px', borderRadius: 50, background: spotsView === 'list' ? '#fff' : 'transparent', color: spotsView === 'list' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>LIST</div>
            <div onClick={() => handleSpotsViewChange('map')} style={{ padding: '6px 18px', borderRadius: 50, background: spotsView === 'map' ? '#fff' : 'transparent', color: spotsView === 'map' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>MAP</div>
          </div>
        </div>
      )}

      {!showAdd && <TabBar active={effectiveTab} onChange={handleTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} />}

      {toast && (
        <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 16, right: 16, zIndex: 2001, background: '#2a1e14', color: '#fff', padding: '12px 16px', borderRadius: 10, fontSize: 12, fontWeight: 700, textAlign: 'center', fontFamily: 'Barlow, sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', letterSpacing: 0.3 }}>
          {toast}
        </div>
      )}

      {showSearch && <SearchPage spots={spots} onSelect={handleSelectLocation} onClose={closeSearch} />}
      {showAuthPrompt && <AuthPromptModal onClose={() => setShowAuthPrompt(false)} onGoProfile={goToProfile} />}
      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
      {saveModalSpot && (
        <SaveToListModal
          spot={saveModalSpot}
          user={user}
          onClose={() => { setSaveModalSpot(null); refetchSaved() }}
        />
      )}

    </>
  )
}
