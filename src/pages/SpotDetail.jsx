import { useState, useRef, useEffect } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl'
import { supabase } from '../lib/supabase'
import { BackIcon, ShareIcon, StarFilledIcon, StarIcon, PencilIcon } from '../components/Icons'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const TYPES = ['Street', 'DIY', 'Park']
const FEATURES = ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Flat Bar']
const BUST_OPTIONS = ['Bust', 'No Bust', 'Weekends Only', 'Weekdays Only']
const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

function DetailPinSVG() {
  return (
    <svg width="24" height="29" viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))', overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
      <circle cx="10" cy="10" r="4" fill="#fff" />
    </svg>
  )
}

async function reverseGeocode(lng, lat) {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    )
    const data = await res.json()
    return data.features?.[0]?.place_name || ''
  } catch {
    return ''
  }
}

export default function SpotDetail({ spot, saved, onToggleSave, onBack, onEditSuccess, onSearch }) {
  const [showMapsModal, setShowMapsModal] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const [dragX, setDragX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [lbDragX, setLbDragX] = useState(0)
  const [lbTransitioning, setLbTransitioning] = useState(false)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const dragging = useRef(false)
  const lbTouchStartX = useRef(null)
  const lbTouchStartY = useRef(null)
  const lbDragging = useRef(false)

  const [showEditAuth, setShowEditAuth] = useState(false)
  const [editPassword, setEditPassword] = useState('')
  const [authError, setAuthError] = useState('')

  const [showEditForm, setShowEditForm] = useState(false)
  const [editForm, setEditForm] = useState(null)
  const [editPhotos, setEditPhotos] = useState([])
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [editUploading, setEditUploading] = useState(false)
  const editFileRef = useRef()

  const [editGeoQuery, setEditGeoQuery] = useState('')
  const [editGeoResults, setEditGeoResults] = useState([])
  const [editShowDropdown, setEditShowDropdown] = useState(false)
  const editGeoTimer = useRef(null)
  const editInputFocused = useRef(false)
  const [editMapCenter, setEditMapCenter] = useState({ longitude: -104.9903, latitude: 39.7392, zoom: 13 })

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const photos = spot.photos || []
  const btnTop = 'calc(env(safe-area-inset-top, 0px) + 10px)'

  useEffect(() => {
    if (!editGeoQuery.trim()) { setEditGeoResults([]); setEditShowDropdown(false); return }
    clearTimeout(editGeoTimer.current)
    editGeoTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(editGeoQuery)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
        )
        const data = await res.json()
        setEditGeoResults(data.features || [])
        if (editInputFocused.current) setEditShowDropdown(true)
      } catch { setEditGeoResults([]) }
    }, 300)
    return () => clearTimeout(editGeoTimer.current)
  }, [editGeoQuery])

  // ── Hero photo swipe ──────────────────────────────────────────
  const onPhotoTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    dragging.current = false
    setTransitioning(false)
    setDragX(0)
  }
  const onPhotoTouchMove = (e) => {
    if (touchStartX.current === null || photos.length <= 1) return
    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current
    if (!dragging.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) dragging.current = true
      else if (Math.abs(dy) > Math.abs(dx) + 4) { touchStartX.current = null; return }
    }
    if (dragging.current) setDragX(dx)
  }
  const onPhotoTouchEnd = () => {
    if (touchStartX.current === null) return
    const THRESH = 55
    let newIdx = photoIndex
    if (dragX < -THRESH && photoIndex < photos.length - 1) newIdx++
    else if (dragX > THRESH && photoIndex > 0) newIdx--
    const wasTap = !dragging.current && Math.abs(dragX) < 8
    if (wasTap && photos.length > 0) { setLightboxIndex(photoIndex); setLightboxOpen(true) }
    setTransitioning(true)
    setPhotoIndex(newIdx)
    setDragX(0)
    touchStartX.current = null
    dragging.current = false
  }

  // ── Lightbox swipe ────────────────────────────────────────────
  const onLbTouchStart = (e) => {
    lbTouchStartX.current = e.touches[0].clientX
    lbTouchStartY.current = e.touches[0].clientY
    lbDragging.current = false
    setLbTransitioning(false)
    setLbDragX(0)
  }
  const onLbTouchMove = (e) => {
    if (lbTouchStartX.current === null) return
    const dx = e.touches[0].clientX - lbTouchStartX.current
    const dy = e.touches[0].clientY - lbTouchStartY.current
    if (!lbDragging.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) lbDragging.current = true
      else if (Math.abs(dy) > Math.abs(dx) + 4) { lbTouchStartX.current = null; return }
    }
    if (lbDragging.current && photos.length > 1) setLbDragX(dx)
  }
  const onLbTouchEnd = (e) => {
    if (lbTouchStartX.current === null) return
    const dy = lbTouchStartY.current - e.changedTouches[0].clientY
    if (lbDragging.current) {
      let newIdx = lightboxIndex
      if (lbDragX < -55 && lightboxIndex < photos.length - 1) newIdx++
      else if (lbDragX > 55 && lightboxIndex > 0) newIdx--
      setLbTransitioning(true)
      setLightboxIndex(newIdx)
      setLbDragX(0)
    } else if (dy > 70) {
      setLightboxOpen(false)
    }
    lbTouchStartX.current = null
    lbDragging.current = false
  }

  // ── Edit auth ─────────────────────────────────────────────────
  const handleEditAuth = () => {
    if (editPassword === 'maxeffort') {
      setEditForm({
        title: spot.title || '',
        type: spot.type || '',
        features: [...(spot.features || [])],
        bust_rating: spot.bust_rating || '',
        description: spot.description || '',
        address: spot.address || '',
        latitude: spot.latitude,
        longitude: spot.longitude,
      })
      setEditPhotos([...(spot.photos || [])])
      setEditGeoQuery(spot.address || '')
      setEditMapCenter({
        longitude: spot.longitude || -104.9903,
        latitude: spot.latitude || 39.7392,
        zoom: spot.latitude ? 15 : 13,
      })
      setShowEditAuth(false)
      setEditPassword('')
      setAuthError('')
      setShowEditForm(true)
    } else {
      setAuthError('Access denied')
    }
  }

  // ── Edit location helpers ─────────────────────────────────────
  const selectEditGeoResult = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    setEditForm(p => ({ ...p, address: feature.place_name, latitude: lat, longitude: lng }))
    setEditMapCenter({ longitude: lng, latitude: lat, zoom: 16 })
    setEditGeoQuery(feature.place_name)
    setEditShowDropdown(false)
  }

  // ── Edit save ─────────────────────────────────────────────────
  const handleEditPhotos = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setEditUploading(true)
    const urls = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('spot-photos').upload(path, file)
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('spot-photos').getPublicUrl(path)
        urls.push(publicUrl)
      }
    }
    setEditPhotos(p => [...p, ...urls])
    setEditUploading(false)
  }

  const handleEditSave = async () => {
    if (!editForm.title) { setEditError('Spot name is required'); return }
    if (!editForm.type) { setEditError('Please select a type'); return }
    setEditSaving(true)
    setEditError('')
    const { error } = await supabase.from('spots').update({
      title: editForm.title,
      type: editForm.type,
      features: editForm.features,
      bust_rating: editForm.bust_rating || null,
      description: editForm.description,
      address: editForm.address,
      latitude: editForm.latitude,
      longitude: editForm.longitude,
      photos: editPhotos,
    }).eq('id', spot.id)
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    setShowEditForm(false)
    onEditSuccess?.()
  }

  const toggleEditFeature = (f) => {
    setEditForm(p => ({
      ...p,
      features: p.features.includes(f) ? p.features.filter(x => x !== f) : [...p.features, f],
    }))
  }

  // ── Delete ────────────────────────────────────────────────────
  const handleDeleteSpot = async () => {
    console.log('Deleting spot:', spot.id, spot.title)
    setDeleting(true)
    const { error } = await supabase.from('spots').delete().eq('id', spot.id)
    console.log('Delete response:', { error })
    setDeleting(false)
    if (error) {
      console.error('Delete failed:', error.message, error)
      return
    }
    console.log('Delete successful')
    setShowDeleteConfirm(false)
    setShowEditForm(false)
    onEditSuccess?.()
  }

  // ── Maps ──────────────────────────────────────────────────────
  const openMaps = (provider) => {
    const { latitude, longitude, title } = spot
    if (provider === 'google') window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank')
    else window.open(`http://maps.apple.com/?ll=${latitude},${longitude}&q=${encodeURIComponent(title)}`, '_blank')
    setShowMapsModal(false)
  }
  const handleShare = async () => {
    if (navigator.share) await navigator.share({ title: spot.title, text: spot.description, url: window.location.href })
  }

  const hasCoords = spot.latitude && spot.longitude

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="scroll-area">

        {/* ── Hero Photo (4:3) ──────────────────────────────── */}
        <div
          style={{ width: '100%', aspectRatio: '4 / 3', background: '#F0E8DE', position: 'relative', overflow: 'hidden', cursor: photos.length ? 'pointer' : 'default' }}
          onTouchStart={onPhotoTouchStart}
          onTouchMove={onPhotoTouchMove}
          onTouchEnd={onPhotoTouchEnd}
        >
          {photos.length > 0 ? (
            photos.map((photo, i) => (
              <div key={i} style={{
                position: 'absolute', inset: 0,
                transform: `translateX(calc(${(i - photoIndex) * 100}% + ${dragX}px))`,
                transition: transitioning ? 'transform 0.28s cubic-bezier(0.25,0.1,0.25,1)' : 'none',
                willChange: 'transform',
              }}>
                <img src={photo} alt={spot.title} style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none', display: 'block' }} draggable={false} />
              </div>
            ))
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0E8DE' }}>
              <svg width="180" height="120" viewBox="0 0 180 120" fill="none">
                <rect x="4" y="80" width="172" height="34" rx="2" fill="#ddd0bc" />
                <rect x="12" y="52" width="156" height="34" rx="2" fill="#e0cebc" />
                <rect x="22" y="28" width="136" height="30" rx="2" fill="#e8d8c8" />
              </svg>
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 40%, rgba(20,28,20,0.85) 100%)', pointerEvents: 'none' }} />
          <div onClick={e => { e.stopPropagation(); onBack() }} onTouchStart={e => e.stopPropagation()}
            style={{ position: 'absolute', top: btnTop, left: 14, zIndex: 100, width: 32, height: 32, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <BackIcon />
          </div>
          <div onClick={e => { e.stopPropagation(); onToggleSave(spot.id) }} onTouchStart={e => e.stopPropagation()}
            style={{ position: 'absolute', top: btnTop, right: 14, zIndex: 100, width: 32, height: 32, borderRadius: 6, background: saved ? '#3D4454' : 'rgba(0,0,0,0.35)', border: saved ? '1px solid #2e3344' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            {saved ? <StarFilledIcon /> : <StarIcon color="#fff" />}
          </div>
          <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
            <div className="spot-badge">{spot.type}</div>
            {spot.bust_rating && (
              <div style={{ background: '#3D4454', color: '#FFFFFF', border: '1px solid #2e3344', fontSize: 9, padding: '3px 7px', borderRadius: 6, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                {spot.bust_rating}
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 10, display: 'flex', gap: 5 }}>
              {photos.map((_, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setPhotoIndex(i) }}
                  style={{ width: i === photoIndex ? 7 : 5, height: i === photoIndex ? 7 : 5, borderRadius: '50%', background: i === photoIndex ? '#d4785a' : '#fff', opacity: i === photoIndex ? 1 : 0.5, cursor: 'pointer', transition: 'all 0.15s' }} />
              ))}
            </div>
          )}
        </div>

        {/* ── Content ───────────────────────────────────────── */}
        <div style={{ padding: '16px 14px 0', background: '#FDF8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, paddingRight: 8, lineHeight: 1.3 }}>{spot.title}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="star-btn" onClick={() => setShowEditAuth(true)} title="Edit"><PencilIcon /></div>
              <div className="star-btn" onClick={handleShare} title="Share"><ShareIcon /></div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {spot.distance != null && <span className="dist-text">{spot.distance} mi away</span>}
            {spot.distance != null && <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-dim)' }} />}
            {spot.added_by && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>Added by @{spot.added_by}</span>}
          </div>
          <div className="tags-wrap" style={{ marginBottom: 14 }}>
            {(spot.features || []).map(f => <span key={f} className="tag">{f}</span>)}
          </div>
          <div className="divider" />
          <div className="section-label">About this spot</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            {spot.description || 'No description added.'}
          </div>
          <div className="divider" />
          <div className="section-label">Location</div>
          <div style={{ width: '100%', height: 130, borderRadius: 6, overflow: 'hidden', marginBottom: 6, background: '#ECEDF2', position: 'relative' }}>
            {hasCoords ? (
              <Map longitude={spot.longitude} latitude={spot.latitude} zoom={14}
                mapStyle="mapbox://styles/mapbox/light-v11" mapboxAccessToken={MAPBOX_TOKEN}
                style={{ width: '100%', height: '100%' }} interactive={false} attributionControl={false}>
                <Marker longitude={spot.longitude} latitude={spot.latitude} anchor="bottom">
                  <DetailPinSVG />
                </Marker>
              </Map>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>No coordinates</span>
              </div>
            )}
          </div>
          {spot.address && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 14 }}>{spot.address}</div>}
          <div onClick={() => setShowMapsModal(true)} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginBottom: 24 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>Get Directions</span>
          </div>
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>

      {/* ── Maps modal ────────────────────────────────────── */}
      {showMapsModal && (
        <div className="modal-overlay" onClick={() => setShowMapsModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Open with</div>
            <div className="modal-row" onClick={() => openMaps('google')}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#1a73e8" /><path d="M10 3C7.2 3 5 5.2 5 8C5 11.5 10 17 10 17s5-5.5 5-9c0-2.8-2.2-5-5-5z" fill="#fff" /><circle cx="10" cy="8" r="2" fill="#1a73e8" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Google Maps</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>maps.google.com</div>
              </div>
            </div>
            <div className="modal-row" onClick={() => openMaps('apple')}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#1c1c1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="4" fill="#1c1c1e" /><path d="M10 3C7.2 3 5 5.2 5 8C5 11.5 10 17 10 17s5-5.5 5-9c0-2.8-2.2-5-5-5z" fill="#fff" /><circle cx="10" cy="8" r="2" fill="#1c1c1e" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Apple Maps</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>maps.apple.com</div>
              </div>
            </div>
            <div className="modal-cancel" onClick={() => setShowMapsModal(false)}>Cancel</div>
          </div>
        </div>
      )}

      {/* ── Edit password modal ───────────────────────────── */}
      {showEditAuth && (
        <div className="modal-overlay" onClick={() => { setShowEditAuth(false); setEditPassword(''); setAuthError('') }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Edit Spot</div>
            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="form-input" type="password" placeholder="Enter password to edit" value={editPassword}
                onChange={e => { setEditPassword(e.target.value); setAuthError('') }}
                onKeyDown={e => e.key === 'Enter' && handleEditAuth()} autoFocus />
              {authError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{authError}</div>}
              <button className="btn-salmon" onClick={handleEditAuth}>Unlock</button>
            </div>
            <div className="modal-cancel" onClick={() => { setShowEditAuth(false); setEditPassword(''); setAuthError('') }}>Cancel</div>
          </div>
        </div>
      )}

      {/* ── Edit form overlay ─────────────────────────────── */}
      {showEditForm && editForm && (
        <div style={{ position: 'absolute', inset: 0, background: '#FDF8F0', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top) + 10px) 16px 12px', background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0 }}>
            <div style={{ width: 28 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 1.5, textTransform: 'uppercase' }}>Edit Spot</div>
            <div onClick={() => setShowEditForm(false)} style={{ width: 28, height: 28, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /><line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
          </div>

          <div className="scroll-area" style={{ padding: '16px 14px' }}>
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Spot Name</div>
              <input className="form-input" value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Type</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <div key={t} className={`chip ${editForm.type === t ? 'active' : ''}`} onClick={() => setEditForm(p => ({ ...p, type: t }))}>{t}</div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Features</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FEATURES.map(f => (
                  <div key={f} className={`chip ${editForm.features.includes(f) ? 'active' : ''}`} onClick={() => toggleEditFeature(f)}>{f}</div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Bust Rating</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {BUST_OPTIONS.map(b => (
                  <div key={b} className={`chip ${editForm.bust_rating === b ? 'active' : ''}`} onClick={() => setEditForm(p => ({ ...p, bust_rating: p.bust_rating === b ? '' : b }))}>{b}</div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Description</div>
              <textarea className="form-input" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="divider" />
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Photos</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {editPhotos.map(url => (
                  <div key={url} style={{ width: 64, height: 64, borderRadius: 4, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1px solid #EAD8C8' }}>
                    <img src={url} alt="spot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div onClick={() => setEditPhotos(p => p.filter(x => x !== url))} style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /><line x1="7" y1="1" x2="1" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </div>
                  </div>
                ))}
                <div onClick={() => editFileRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 4, background: '#ECEDF2', border: '1px solid #C8CAD4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6a6c7a" strokeWidth="1.2" /><line x1="8" y1="5" x2="8" y2="11" stroke="#6a6c7a" strokeWidth="1.2" strokeLinecap="round" /><line x1="5" y1="8" x2="11" y2="8" stroke="#6a6c7a" strokeWidth="1.2" strokeLinecap="round" /></svg>
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{editUploading ? '...' : 'Add'}</span>
                </div>
              </div>
              <input ref={editFileRef} type="file" accept="image/*" multiple hidden onChange={handleEditPhotos} />
            </div>
            <div className="divider" />
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Location</div>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input
                  className="form-input"
                  placeholder="Search address or place..."
                  value={editGeoQuery}
                  onChange={e => { setEditGeoQuery(e.target.value); setEditForm(p => ({ ...p, address: e.target.value })) }}
                  onFocus={() => { editInputFocused.current = true; if (editGeoResults.length > 0) setEditShowDropdown(true) }}
                  onBlur={() => { editInputFocused.current = false; setTimeout(() => setEditShowDropdown(false), 150) }}
                />
                {editShowDropdown && editGeoResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#FFFFFF', border: '1px solid #C8CAD4', borderRadius: 4, marginTop: 2, overflow: 'hidden' }}>
                    {editGeoResults.map(r => (
                      <div key={r.id} onMouseDown={() => selectEditGeoResult(r)} style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-primary)', borderBottom: '1px solid #ECEDF2', cursor: 'pointer', lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 700 }}>{r.text}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{r.place_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #EAD8C8', height: 200 }}>
                <Map
                  {...editMapCenter}
                  onMove={e => setEditMapCenter(e.viewState)}
                  mapStyle="mapbox://styles/mapbox/light-v11"
                  mapboxAccessToken={MAPBOX_TOKEN}
                  style={{ width: '100%', height: '100%' }}
                  onClick={e => { const { lng, lat } = e.lngLat; setEditForm(p => ({ ...p, latitude: lat, longitude: lng })) }}
                  cursor="crosshair"
                >
                  <NavigationControl position="top-right" showCompass={false} />
                  {editForm.latitude && editForm.longitude && (
                    <Marker longitude={editForm.longitude} latitude={editForm.latitude} anchor="bottom" draggable onDragEnd={e => { const { lng, lat } = e.lngLat; setEditForm(p => ({ ...p, latitude: lat, longitude: lng })) }}>
                      <svg width="20" height="24" viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.4))' }}>
                        <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                        <circle cx="10" cy="10" r="4" fill="#fff" />
                      </svg>
                    </Marker>
                  )}
                </Map>
              </div>
              {editForm.latitude
                ? <div style={{ fontSize: 10, color: 'var(--salmon)', marginTop: 5, fontWeight: 700 }}>{editForm.latitude.toFixed(5)}, {editForm.longitude.toFixed(5)}</div>
                : <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>Tap the map or search to pin a location</div>
              }
            </div>
            {editError && <div style={{ fontSize: 11, color: '#e07070', marginBottom: 10, fontWeight: 700 }}>{editError}</div>}
            <button className="btn-salmon" onClick={handleEditSave} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
            <div style={{ marginTop: 10 }}>
              <button onClick={() => setShowDeleteConfirm(true)} style={{ width: '100%', padding: 11, borderRadius: 6, background: 'transparent', border: '1px solid rgba(212,120,90,0.45)', color: '#d4785a', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                Delete Spot
              </button>
            </div>
            <div style={{ height: BOTTOM_PAD }} />
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ──────────────────────────── */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title">Delete Spot</div>
            <div style={{ padding: '0 20px 8px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
              Are you sure you want to delete this spot? This cannot be undone.
            </div>
            <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleDeleteSpot} disabled={deleting}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
            <div className="modal-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</div>
          </div>
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────── */}
      {lightboxOpen && photos.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
          onTouchStart={onLbTouchStart} onTouchMove={onLbTouchMove} onTouchEnd={onLbTouchEnd}>
          <div onClick={() => setLightboxOpen(false)} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 16, width: 34, height: 34, borderRadius: 6, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><line x1="12" y1="2" x2="2" y2="12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </div>
          {photos.length > 1 && (
            <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: 1 }}>
              {lightboxIndex + 1} / {photos.length}
            </div>
          )}
          <div style={{ position: 'relative', width: '100%', height: '80%', overflow: 'hidden' }}>
            {photos.map((photo, i) => (
              <div key={i} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateX(calc(${(i - lightboxIndex) * 100}% + ${lbDragX}px))`, transition: lbTransitioning ? 'transform 0.28s cubic-bezier(0.25,0.1,0.25,1)' : 'none', willChange: 'transform' }}>
                <img src={photo} alt={spot.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none', display: 'block' }} draggable={false} />
              </div>
            ))}
          </div>
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 48, display: 'flex', gap: 6 }}>
              {photos.map((_, i) => (
                <div key={i} onClick={() => { setLbTransitioning(true); setLightboxIndex(i) }}
                  style={{ width: i === lightboxIndex ? 8 : 6, height: i === lightboxIndex ? 8 : 6, borderRadius: '50%', background: i === lightboxIndex ? '#d4785a' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.15s' }} />
              ))}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 22, fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Swipe down to close</div>
        </div>
      )}
    </div>
  )
}
