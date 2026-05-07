import { useState, useRef, useEffect } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl'
import { supabase } from '../lib/supabase'
import { CloseIcon } from '../components/Icons'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const TYPES = ['Street', 'DIY', 'Park']
const FEATURES = ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Flat Bar']
const BUST_OPTIONS = ['Bust', 'No Bust', 'Weekends Only', 'Weekdays Only']
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

export default function AddSpot({ onClose, onSuccess, user }) {
  const [form, setForm] = useState({
    title: '', type: '', features: [], bust_rating: '', description: '', address: '',
    latitude: null, longitude: null,
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const geocodeTimer = useRef(null)
  const geoInputFocused = useRef(false)

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
      if (address) { setGeoQuery(address); setForm(p => ({ ...p, address })) }
    }, null, { enableHighAccuracy: true })
  }, [])

  // Geocoding search debounce
  useEffect(() => {
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
    setUploading(true)
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
    setPhotos(prev => [...prev, ...urls])
    setUploading(false)
  }

  const handleSubmit = async () => {
    if (!form.title) { setError('Spot name is required'); return }
    if (!form.type) { setError('Please select a type'); return }
    setError('')
    setUploading(true)
    const { error } = await supabase.from('spots').insert({
      title: form.title,
      type: form.type,
      features: form.features,
      bust_rating: form.bust_rating || null,
      description: form.description,
      address: form.address,
      latitude: form.latitude,
      longitude: form.longitude,
      photos,
      added_by: user?.email?.split('@')[0] || 'anon',
    })
    setUploading(false)
    if (error) { setError(error.message); return }
    onSuccess()
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

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Features</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FEATURES.map(f => (
              <div key={f} className={`chip ${form.features.includes(f) ? 'active' : ''}`} onClick={() => toggleFeature(f)}>{f}</div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Bust Rating</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {BUST_OPTIONS.map(b => (
              <div key={b} className={`chip ${form.bust_rating === b ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, bust_rating: p.bust_rating === b ? '' : b }))}>{b}</div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Description</div>
          <textarea className="form-input" placeholder="What makes this spot sick? Security? Best time to skate?" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
        </div>

        <div className="divider" />

        <div style={{ marginBottom: 14 }}>
          <div className="section-label">Photos</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {photos.map(url => (
              <div key={url} style={{ width: 64, height: 64, borderRadius: 4, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1px solid #EAD8C8' }}>
                <img src={url} alt="spot" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div onClick={() => setPhotos(prev => prev.filter(p => p !== url))} style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /><line x1="7" y1="1" x2="1" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </div>
              </div>
            ))}
            <div onClick={() => fileRef.current?.click()} style={{ width: 64, height: 64, borderRadius: 4, background: '#ECEDF2', border: '1px solid #C8CAD4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6a6c7a" strokeWidth="1.2" /><line x1="8" y1="5" x2="8" y2="11" stroke="#6a6c7a" strokeWidth="1.2" strokeLinecap="round" /><line x1="5" y1="8" x2="11" y2="8" stroke="#6a6c7a" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{uploading ? '...' : 'Add'}</span>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handlePhotos} />
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
          <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #EAD8C8', height: 200 }}>
            <Map
              {...mapCenter}
              onMove={e => setMapCenter(e.viewState)}
              mapStyle="mapbox://styles/mapbox/light-v11"
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

        {error && <div style={{ fontSize: 11, color: '#e07070', marginBottom: 10, fontWeight: 700 }}>{error}</div>}

        <button className="btn-salmon" onClick={handleSubmit} disabled={uploading}>
          {uploading ? 'Saving...' : 'Drop This Spot'}
        </button>

        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </div>
  )
}
