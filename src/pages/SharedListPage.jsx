import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createPortal } from 'react-dom'
import SpotCard from '../components/SpotCard'
import MapView from './MapView'
import AuthScreen from './AuthScreen'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

export default function SharedListPage() {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const [list, setList] = useState(null)
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [user, setUser] = useState(null)
  const [showAuth, setShowAuth] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) setShowAuth(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function load() {
      const { data: listData, error: listError } = await supabase
        .from('spot_lists')
        .select('*')
        .eq('share_token', shareToken)
        .maybeSingle()

      if (listError || !listData) { setNotFound(true); setLoading(false); return }
      setList(listData)

      const savedQuery = listData.is_favorites
        ? supabase.from('saved_spots').select('spot_id').eq('user_id', listData.user_id).is('list_id', null)
        : supabase.from('saved_spots').select('spot_id').eq('list_id', listData.id)
      const { data: items } = await savedQuery

      const ids = (items || []).map(i => i.spot_id)
      if (ids.length === 0) { setLoading(false); return }

      const [spotsRes, reviewsRes] = await Promise.all([
        supabase.from('spots').select('*').in('id', ids),
        supabase.from('spot_reviews').select('spot_id, rating').in('spot_id', ids),
      ])

      if (spotsRes.data) {
        const rMap = {}
        for (const r of (reviewsRes.data || [])) {
          if (!rMap[r.spot_id]) rMap[r.spot_id] = { sum: 0, count: 0 }
          rMap[r.spot_id].sum += r.rating
          rMap[r.spot_id].count++
        }
        const merged = spotsRes.data.map(s => ({
          ...s,
          avg_rating: rMap[s.id] ? parseFloat((rMap[s.id].sum / rMap[s.id].count).toFixed(1)) : null,
          rating_count: rMap[s.id]?.count || 0,
        }))
        const visible = merged.filter(s => {
          const vis = s.visibility || 'public'
          const mod = s.moderation_status
          return (!mod || mod === 'approved') && (vis === 'public' || vis === 'unlisted')
        })
        setSpots(visible)
      }
      setLoading(false)
    }
    load()
  }, [shareToken])

  const showToastMsg = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  const handleSaveList = async () => {
    if (!user) { setShowAuth(true); return }
    if (saving || spots.length === 0 || !list) return
    setSaving(true)
    try {
      const baseName = list.name
      const { data: existing } = await supabase
        .from('spot_lists').select('id').eq('user_id', user.id).eq('name', baseName).maybeSingle()
      const finalName = existing ? `${baseName} (from friend)` : baseName

      const { data: newList, error } = await supabase
        .from('spot_lists').insert({ user_id: user.id, name: finalName }).select('id').single()
      if (error || !newList) throw new Error('Failed to create list')

      await supabase.from('saved_spots').insert(spots.map(s => ({ user_id: user.id, spot_id: s.id, list_id: newList.id })))
      showToastMsg('Saved to your lists!')
    } catch {
      showToastMsg('Something went wrong. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSpotClick = (spot) => navigate(`/spots/${spot.slug || spot.id}`)

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDF8F0', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#9a8878', fontWeight: 700 }}>
        Loading...
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FDF8F0', gap: 12, padding: '0 32px', textAlign: 'center', fontFamily: 'Barlow, sans-serif' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14' }}>This list isn't available.</div>
        <div style={{ fontSize: 11, color: '#9a8878', fontWeight: 600 }}>The link may be invalid or the list was deleted.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
          ← Open Sesh Wars
        </button>
      </div>
    )
  }

  return (
    <div className="desktop-page-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div
          onClick={() => navigate('/')}
          style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px' }}>
          {list?.name}
        </div>
        <div
          onClick={handleSaveList}
          style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: saving ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: saving ? 0.6 : 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <line x1="7" y1="1" x2="7" y2="13" stroke="#d4785a" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="1" y1="7" x2="13" y2="7" stroke="#d4785a" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'map' ? (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {spots.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No spots in this list.</div>
          ) : (
            <MapView spots={spots} saved={new Set()} onSavePress={() => {}} onSpotClick={handleSpotClick} showNav={false} showFilterChips={false} fitOnMount={true} />
          )}
        </div>
      ) : (
        <div className="scroll-area" style={{ paddingTop: 8 }}>
          {spots.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: '#9a8878', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
              No spots in this list yet.
            </div>
          ) : (
            spots.map(spot => (
              <SpotCard key={spot.id} spot={spot} saved={false} onSavePress={() => {}} onClick={handleSpotClick} />
            ))
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      )}

      {/* LIST/MAP toggle pill */}
      {createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 16px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', background: '#d4785a', borderRadius: 50, padding: 3, pointerEvents: 'auto', boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
          <div onClick={() => setViewMode('list')} style={{ padding: '6px 18px', borderRadius: 50, background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>LIST</div>
          <div onClick={() => setViewMode('map')} style={{ padding: '6px 18px', borderRadius: 50, background: viewMode === 'map' ? '#fff' : 'transparent', color: viewMode === 'map' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>MAP</div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 80px)', left: '50%', transform: 'translateX(-50%)', background: '#2a1e14', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {toast}
        </div>,
        document.body
      )}

      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} />}
    </div>
  )
}
