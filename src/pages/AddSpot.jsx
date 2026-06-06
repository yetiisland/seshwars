import { useState, useRef, useEffect } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl'
import { supabase } from '../lib/supabase'
import { CloseIcon } from '../components/Icons'
import { slugify } from '../utils/slugify'
import DraggablePhotos from '../components/DraggablePhotos'
import { compressImage } from '../utils/compressImage'
import { checkPhotosSafe } from '../utils/moderation'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const TYPES = ['Street', 'DIY', 'Skatepark', 'Skate Shop']
const FEATURES = ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Flat Bar']
const BUST_OPTIONS = ['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only']
const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Visible to everyone on the map and list' },
  { value: 'unlisted', label: 'Unlisted', desc: 'Only people with the link can see it' },
  { value: 'private', label: 'Private', desc: 'Only you can see it' },
]

function bustChipActiveStyle(rating) {
  if (rating === 'No Bust') return { background: '#4a7a3a', borderColor: '#3d6830', color: '#ffffff' }
  if (rating === 'Bust') return { background: '#c0453a', borderColor: '#a83830', color: '#ffffff' }
  if (rating === 'Medium Bust' || rating === 'Weekends Only' || rating === 'Weekdays Only') return { background: '#c8a020', borderColor: '#b08818', color: '#ffffff' }
  return {}
}
const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

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

export default function AddSpot({ onClose, onSuccess, user, onGoProfile }) {
  const [form, setForm] = useState({
    title: '', type: '', features: [], bust_rating: '', description: '', address: '',
    latitude: null, longitude: null, visibility: 'public',
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadingText, setUploadingText] = useState('Compressing...')
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [spotPending, setSpotPending] = useState(false)
  const [spotRejected, setSpotRejected] = useState(false)

  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const geocodeTimer = useRef(null)
  const geoInputFocused = useRef(false)
  const skipGeoRef = useRef(false)

  const [mapCenter, setMapCenter] = useState({ longitude: -104.9903, latitude: 39.7392, zoom: 13 })
  const fileRef = useRef()

  // Auto-locate on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords
      setForm(p => ({ ...p, latitude: lat, longitude: lng }))
      setMapCenter({ longitude: lng, latitude: lat, zoom: 15 })
      const address = await reverseGeocode(lng, lat)
      if (address) {
        skipGeoRef.current = true
        setGeoQuery(address)
        setForm(p => ({ ...p, address }))
      }
    }, null, { enableHighAccuracy: true })
  }, [])

  // Geocoding search debounce
  useEffect(() => {
    if (skipGeoRef.current) { skipGeoRef.current = false; return }
    if (!geoQuery.trim()) { setGeoResults([]); setShowDropdown(false); return }
    clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(geoQuery)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
        )
        const data = await res.json()
        setGeoResults(data.features || [])
        if (geoInputFocused.current) setShowDropdown(true)
      } catch {
        setGeoResults([])
      }
    }, 300)
    return () => clearTimeout(geocodeTimer.current)
  }, [geoQuery])

  const selectGeoResult = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    setForm(p => ({ ...p, address: feature.place_name, latitude: lat, longitude: lng }))
    setMapCenter({ longitude: lng, latitude: lat, zoom: 16 })
    skipGeoRef.current = true
    setGeoQuery(feature.place_name)
    setShowDropdown(false)
  }

  const toggleFeature = (f) => {
    setForm(prev => ({
      ...prev,
      features: prev.features.includes(f) ? prev.features.filter(x => x !== f) : [...prev.features, f]
    }))
  }

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setPhotoError('')
    const urls = []
    let hadError = false
    for (const file of files) {
      setUploading(true)
      setUploadingText('Compressing...')
      const compressed = await compressImage(file)
      setUploadingText('Uploading...')
      const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { error } = await supabase.storage.from('spot-photos').upload(path, compressed, { contentType: 'image/jpeg' })
      if (error) {
        hadError = true
      } else {
        const { data: { publicUrl } } = supabase.storage.from('spot-photos').getPublicUrl(path)
        urls.push(publicUrl)
      }
    }
    if (hadError) setPhotoError('Some photos failed to upload. Make sure you are signed in.')
    setPhotos(prev => [...prev, ...urls])
    setUploading(false)
  }

  const handleSubmit = async () => {
    if (!form.title) { setError('Spot name is required'); return }
    if (!form.type) { setError('Please select a type'); return }
    setError('')
    setUploading(true)
    setUploadingText('Checking content...')
    const { safe: allSafe, autoReject } = await checkPhotosSafe(photos)
    if (autoReject) {
      setUploading(false)
      setSpotRejected(true)
      return
    }
    const moderation_status = allSafe ? 'approved' : 'pending'
    setUploadingText('Saving...')
    const { error } = await supabase.from('spots').insert({
      title: form.title,
      slug: slugify(form.title, Math.random().toString(36).slice(2, 6)),
      type: form.type,
      features: form.features,
      bust_rating: form.bust_rating || null,
      description: form.description,
      address: form.address,
      latitude: form.latitude,
      longitude: form.longitude,
      photos,
      added_by: user?.id || 'anon',
      moderation_status,
      visibility: form.visibility,
    })
    setUploading(false)
    if (error) { setError(error.message); return }
    if (moderation_status === 'pending') {
      setSpotPending(true)
    } else {
      onSuccess()
    }
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FDF8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)', borderBottom: '1px solid #E8DDD0', flexShrink: 0, background: '#FDF8F0' }}>
          <div style={{ width: 28 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Add a Spot</div>
          <div onClick={onClose} style={{ width: 28, height: 28, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon />
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 14, textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="#d4785a" strokeWidth="2" fill="none" />
            <path d="M20 12C17.2 12 15 14.2 15 17C15 20.5 20 28 20 28C20 28 25 20.5 25 17C25 14.2 22.8 12 20 12Z" fill="#d4785a" />
            <circle cx="20" cy="17" r="2.5" fill="#fff" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Sign In to Drop a Spot</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            You need an account to add spots to the map. It only takes a minute.
          </div>
          <button className="btn-salmon" onClick={() => { onClose(); onGoProfile?.() }} style={{ marginTop: 8 }}>
            Go to Profile to Sign In
          </button>
        </div>
      </div>
    )
  }

  if (spotRejected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FDF8F0', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16, textAlign: 'center' }}>
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="20" stroke="#c0453a" strokeWidth="2" fill="rgba(192,69,58,0.08)" />
          <line x1="14" y1="14" x2="30" y2="30" stroke="#c0453a" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="30" y1="14" x2="14" y2="30" stroke="#c0453a" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Content Removed</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 300 }}>
          One of your photos was detected as explicit or harmful and cannot be uploaded. Remove it and try again.
        </div>
        <button className="btn-salmon" onClick={() => { setSpotRejected(false); setPhotos([]) }} style={{ marginTop: 8 }}>Try Again</button>
      </div>
    )
  }

  if (spotPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FDF8F0', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16, textAlign: 'center' }}>
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <path d="M22 10L40 38H4L22 10Z" stroke="#c8a020" strokeWidth="2" strokeLinejoin="round" fill="rgba(200,160,32,0.1)" />
          <line x1="22" y1="18" x2="22" y2="26" stroke="#c8a020" strokeWidth="2" strokeLinecap="round" />
          <circle cx="22" cy="30" r="1.2" fill="#c8a020" />
        </svg>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Spot Submitted</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 300 }}>
          Your spot was submitted and is being reviewed before going live. You'll see it on your profile once approved.
        </div>
        <button className="btn-salmon" onClick={onSuccess} style={{ marginTop: 8 }}>Got It</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FDF8F0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)', borderBottom: '1px solid #E8DDD0', flexShrink: 0, background: '#FDF8F0' }}>
        <div style={{ width: 28 }} />
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Add a Spot</div>
        <div onClick={onClose} style={{ width: 28, height: 28, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <CloseIcon />
        </div>
      </div>

      <div className="scroll-area" style={{ padding: '16px 14px' }}>

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Spot Name</div>
          <input className="form-input" placeholder="e.g. Civic Center Ledges" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Type</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TYPES.map(t => (
              <div key={t} className={`chip ${form.type === t ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, type: t }))}>{t}</div>
            ))}
          </div>
        </div>

        {(form.type === 'Street' || form.type === 'DIY') && (
          <div style={{ marginBottom: 14 }}>
            <div className="section-label">Features</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {FEATURES.map(f => (
                <div key={f} className={`chip ${form.features.includes(f) ? 'active' : ''}`} onClick={() => toggleFeature(f)}>{f}</div>
              ))}
            </div>
          </div>
        )}

        {(form.type === 'Street' || form.type === 'DIY') && (
          <div style={{ marginBottom: 14 }}>
            <div className="section-label">Bust Rating</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BUST_OPTIONS.map(b => {
                const isActive = form.bust_rating === b
                return (
                  <div key={b}
                    className={`chip ${isActive ? 'active' : ''}`}
                    style={isActive ? bustChipActiveStyle(b) : undefined}
                    onClick={() => setForm(p => ({ ...p, bust_rating: p.bust_rating === b ? '' : b }))}
                  >{b}</div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Description</div>
          <textarea className="form-input" placeholder="What makes this spot sick? Security? Best time to skate?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        </div>

        <div className="divider" />

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Photos</div>
          <DraggablePhotos
            photos={photos}
            setPhotos={setPhotos}
            onAdd={() => fileRef.current?.click()}
            uploading={uploading}
            uploadingText={uploadingText}
          />
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
          {photoError && <div style={{ fontSize: 10, color: '#e07070', marginTop: 6, fontWeight: 700 }}>{photoError}</div>}
        </div>

        <div className="divider" />

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Location</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input
              className="form-input"
              placeholder="Search address or place..."
              value={geoQuery}
              onChange={e => { setGeoQuery(e.target.value); setForm(p => ({ ...p, address: e.target.value })) }}
              onFocus={() => { geoInputFocused.current = true; if (geoResults.length > 0) setShowDropdown(true) }}
              onBlur={() => { geoInputFocused.current = false; setTimeout(() => setShowDropdown(false), 150) }}
            />
            {showDropdown && geoResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#FFFFFF', border: '1px solid #C8CAD4', borderRadius: 4, marginTop: 2, overflow: 'hidden' }}>
                {geoResults.map(r => (
                  <div key={r.id} onMouseDown={() => selectGeoResult(r)} style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-primary)', borderBottom: '1px solid #ECEDF2', cursor: 'pointer', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700 }}>{r.text}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{r.place_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #EAD8C8', height: 280 }}>
            <Map
              {...mapCenter}
              onMove={e => setMapCenter(e.viewState)}
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              onClick={e => { const { lng, lat } = e.lngLat; setForm(p => ({ ...p, latitude: lat, longitude: lng })) }}
              cursor="crosshair"
            >
              <NavigationControl position="top-right" showCompass={false} />
              {form.latitude && form.longitude && (
                <Marker longitude={form.longitude} latitude={form.latitude} anchor="bottom" draggable onDragEnd={e => { const { lng, lat } = e.lngLat; setForm(p => ({ ...p, latitude: lat, longitude: lng })) }}>
                  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.4))' }}>
                    <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                    <circle cx="10" cy="10" r="4" fill="#fff" />
                  </svg>
                </Marker>
              )}
            </Map>
          </div>
          {form.latitude
            ? <div style={{ fontSize: 10, color: 'var(--salmon)', marginTop: 5, fontWeight: 700 }}>{form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</div>
            : <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>Tap the map or search to pin a location</div>
          }
        </div>

        <div className="divider" />

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Visibility</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {VISIBILITY_OPTIONS.map(opt => {
              const isActive = form.visibility === opt.value
              return (
                <div
                  key={opt.value}
                  onClick={() => setForm(p => ({ ...p, visibility: opt.value }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 6, cursor: 'pointer', background: isActive ? '#3D4454' : '#F5F0EA', border: `1px solid ${isActive ? '#3D4454' : '#E0D5C8'}` }}
                >
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${isActive ? '#fff' : '#b0a090'}`, background: isActive ? '#fff' : 'transparent', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#fff' : '#2a1e14' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.65)' : '#9a8878', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {error && <div style={{ fontSize: 11, color: '#e07070', marginBottom: 10, fontWeight: 700 }}>{error}</div>}

        <button className="btn-salmon" onClick={handleSubmit} disabled={uploading}>
          {uploading ? uploadingText : 'Drop This Spot'}
        </button>

        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </div>
  )
}
