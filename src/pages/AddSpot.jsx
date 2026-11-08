import { useState, useRef, useEffect } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl'
import { supabase } from '../lib/supabase'
import { CloseIcon } from '../components/Icons'
import { slugify } from '../utils/slugify'
import DraggablePhotos from '../components/DraggablePhotos'
import LoadingOverlay from '../components/LoadingOverlay'
import SpotFormFields from '../components/SpotFormFields'
import SpotSaveErrorModal from '../components/SpotSaveErrorModal'
import { compressImage } from '../utils/compressImage'
import { checkPhotosSafe } from '../utils/moderation'
import TermsOfService from './TermsOfService'
import { useAddressConfirmation } from '../hooks/useAddressConfirmation'
import { mergeSpotIntoCache } from '../hooks/useSpots'
import { LAYERS } from '../lib/layers'
import { validateSpotForm, friendlySaveErrorMessage } from '../lib/spotSaveValidation'
import useBlurOnScroll from '../hooks/useBlurOnScroll'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const DRAFT_KEY = 'seshwars_spot_draft'
const MAX_PHOTO_BYTES = 25 * 1024 * 1024

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Visible to everyone on the map and list' },
  { value: 'unlisted', label: 'Unlisted', desc: 'Only people with the link can see it' },
  { value: 'private', label: 'Private', desc: 'Only you can see it' },
]

export default function AddSpot({ onClose, onSuccess, user, onGoProfile, userLocation, locationPermission }) {
  const [form, setForm] = useState({
    title: '', type: '', features: [], bust_rating: '', lighting: '', is_multi_spot: 'No', description: '', visibility: 'public',
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadingText, setUploadingText] = useState('Compressing...')
  const [saveProblems, setSaveProblems] = useState([])
  const [fieldErrors, setFieldErrors] = useState({})
  const fieldRefs = useRef({})
  const locationSectionRef = useRef(null)
  const addressInputRef = useRef(null)
  const addressScrollDismiss = useBlurOnScroll(addressInputRef)
  const [photoError, setPhotoError] = useState('')
  const [spotPending, setSpotPending] = useState(false)
  const [spotRejected, setSpotRejected] = useState(false)
  const [showTos, setShowTos] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [photoUploadProgress, setPhotoUploadProgress] = useState({ current: 0, total: 0 })

  const [mapCenter, setMapCenter] = useState({ longitude: -104.9903, latitude: 39.7392, zoom: 13 })
  // Suggestion-select recenters itself via handleSelectSuggestion below;
  // coordinate entry resolves inside the hook with no equivalent call site,
  // so it recenters here instead — same zoom, same "the user hasn't already
  // navigated there" reasoning. Pin drag/tap deliberately don't recenter.
  const addr = useAddressConfirmation((lat, lng, source) => {
    if (source === 'coordinates') setMapCenter({ longitude: lng, latitude: lat, zoom: 16 })
  })
  // Reflects the app's one shared permission state (App.jsx's own
  // useGeolocation() instance) — this is a read of existing state, not a
  // permission check AddSpot performs itself.
  const locationBlocked = locationPermission === 'denied'
  const fileRef = useRef()
  const draftTimer = useRef(null)
  // Auto-locate's own "done" flag for this open of the form. STICKY: once
  // true it never goes back to false, from any of two triggers, whichever
  // comes first:
  //  - auto-locate itself successfully applies a location (set directly
  //    in the geolocation callbacks below), or
  //  - the user provides their own input — a pin, a confirmed address, or
  //    any typed address text, reflected live by addr.status leaving
  //    'empty' (checked every render, not just once at mount, since the
  //    geolocation callbacks below can resolve long after the render that
  //    started them: a backgrounded tab throttles pending permission
  //    queries and position fetches until it regains visibility again).
  // The sticky "only ever moves true" direction matters because the user
  // can later CLEAR their typed address (addr.status returns to 'empty')
  // without that reopening the window for a late-arriving auto-locate
  // result to overwrite their now-deliberately-empty field. The default
  // map center is never consulted here — it is not a pin and is never
  // treated as user input.
  const autoLocateDoneRef = useRef(false)
  if (addr.status !== 'empty') autoLocateDoneRef.current = true

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (raw) {
        const { form: f, photos: p, mapCenter: mc, address, latitude, longitude, confirmed } = JSON.parse(raw)
        if (f) setForm(prev => ({ ...prev, ...f }))
        if (p?.length) setPhotos(p)
        if (mc) setMapCenter(mc)
        if (address || latitude != null) {
          addr.hydrate({ address, latitude, longitude, confirmed })
        }
      }
    } catch {}
    // addr is stable across renders (its own methods are memoized), and this
    // must only run once on mount — including it would make eslint's
    // exhaustive-deps happy at the cost of re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-locate — the shared userLocation prop (App.jsx's one
  // useGeolocation() instance, already running for the whole app; it's
  // what spot cards use for distances) is this form's only location
  // source. No geolocation call, permission check, or request of its own:
  // AddSpot only ever reads userLocation/locationPermission, never
  // queries or requests anything itself, so native and web behave
  // identically here — whatever the shared hook has already resolved (or
  // resolves later) is exactly what this form sees.
  //
  // Applies immediately if userLocation is already available when this
  // effect first runs (on open), or the first time it becomes available
  // afterward — either way, only while autoLocateDoneRef is still false,
  // i.e. the user hasn't placed a pin, confirmed an address, or typed any
  // address text in the meantime. Re-runs on every userLocation update
  // (watchPosition delivers a new fix continuously), but applies at most
  // once per open: the first successful application marks autoLocateDoneRef
  // true, so every later run (including every later userLocation update)
  // no-ops immediately.
  //
  // If the shared location is denied or simply never arrives, this leaves
  // the form empty with no error — the "Location is blocked" hint below
  // reflects the shared locationPermission as-is, not a check this form
  // performs.
  useEffect(() => {
    if (!userLocation || autoLocateDoneRef.current) return
    autoLocateDoneRef.current = true
    setMapCenter({ longitude: userLocation.longitude, latitude: userLocation.latitude, zoom: 15 })
    addr.handlePinMove(userLocation.latitude, userLocation.longitude)
    // addr is stable across renders (its own methods are memoized) —
    // intentionally omitted so eslint doesn't demand it be re-added, which
    // would change nothing since it never changes identity in a way that
    // should re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation])

  // Persist draft to sessionStorage, debounced 300 ms; photos are already-uploaded URLs so safe to store
  useEffect(() => {
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
          form, photos, mapCenter,
          address: addr.addressText, latitude: addr.latitude, longitude: addr.longitude,
          confirmed: addr.status === 'confirmed',
        }))
      } catch {}
    }, 300)
    return () => clearTimeout(draftTimer.current)
  }, [form, photos, mapCenter, addr.addressText, addr.latitude, addr.longitude, addr.status])

  const handleClose = () => {
    sessionStorage.removeItem(DRAFT_KEY)
    onClose()
  }

  // Scrolls to the first field still carrying a problem, in the same
  // order the popup listed them (title, type, location) — the field's own
  // inline error line (set alongside saveProblems in handleSubmit) stays
  // visible after this; only the popup itself closes.
  const closeSaveProblems = () => {
    setSaveProblems([])
    requestAnimationFrame(() => {
      if (fieldErrors.title) { fieldRefs.current.title?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
      if (fieldErrors.type) { fieldRefs.current.type?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
      if (fieldErrors.location) { locationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
    })
  }

  const handleSelectSuggestion = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    addr.selectSuggestion(feature)
    setMapCenter({ longitude: lng, latitude: lat, zoom: 16 })
  }

  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setPhotoError('')
    setUploadingPhotos(true)
    setPhotoUploadProgress({ current: 0, total: files.length })
    const urls = []
    const errors = []
    for (let i = 0; i < files.length; i++) {
      setPhotoUploadProgress({ current: i + 1, total: files.length })
      const file = files[i]
      if (file.size > MAX_PHOTO_BYTES) {
        errors.push(`${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max size is 25MB.`)
        continue
      }
      let compressed
      try {
        compressed = await compressImage(file, 1200)
      } catch (err) {
        errors.push(err.message || `${file.name} could not be processed.`)
        continue
      }
      const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { error } = await supabase.storage.from('spot-photos').upload(path, compressed, { contentType: 'image/jpeg' })
      if (error) {
        errors.push(`${file.name} failed to upload.`)
      } else {
        const { data: { publicUrl } } = supabase.storage.from('spot-photos').getPublicUrl(path)
        urls.push(publicUrl)
      }
    }
    if (errors.length) setPhotoError(errors.join(' '))
    setPhotos(prev => [...prev, ...urls])
    setUploadingPhotos(false)
    setPhotoUploadProgress({ current: 0, total: 0 })
  }

  const handleSubmit = async () => {
    // CORE RULE: the pin is the single source of truth for the address —
    // only a CONFIRMED location (one the hook itself derived from the pin)
    // may be saved. validateSpotForm checks all three required fields at
    // once (not one-at-a-time) so the popup can list every problem found,
    // not just the first.
    const errors = validateSpotForm(form, addr.status)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setSaveProblems(Object.values(errors))
      return
    }
    setFieldErrors({})
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
    const { data, error } = await supabase.from('spots').insert({
      title: form.title,
      slug: slugify(form.title, Math.random().toString(36).slice(2, 6)),
      type: form.type,
      features: form.features,
      bust_rating: form.bust_rating || null,
      lighting: form.lighting || null,
      is_multi_spot: form.is_multi_spot === 'Yes',
      description: form.description,
      address: addr.addressText,
      latitude: addr.latitude,
      longitude: addr.longitude,
      photos,
      added_by: user?.id || 'anon',
      moderation_status,
      visibility: form.visibility,
    }).select().single()
    setUploading(false)
    if (error || !data) {
      console.error('[AddSpot] handleSubmit insert failed:', error)
      setSaveProblems([friendlySaveErrorMessage(error)])
      return
    }
    sessionStorage.removeItem(DRAFT_KEY)
    mergeSpotIntoCache(data)
    if (moderation_status === 'pending') {
      setSpotPending(true)
    } else {
      onSuccess()
    }
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, background: '#FDF8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)', borderBottom: '1px solid #E8DDD0', flexShrink: 0, background: '#FDF8F0' }}>
          <div style={{ width: 28 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Add a Spot</div>
          <div onClick={handleClose} style={{ width: 28, height: 28, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon />
          </div>
        </div>
        <div className="scroll-area" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 14, textAlign: 'center' }}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="#d4785a" strokeWidth="2" fill="none" />
            <path d="M20 12C17.2 12 15 14.2 15 17C15 20.5 20 28 20 28C20 28 25 20.5 25 17C25 14.2 22.8 12 20 12Z" fill="#d4785a" />
            <circle cx="20" cy="17" r="2.5" fill="#fff" />
          </svg>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1 }}>Sign In to Drop a Spot</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            You need an account to add spots to the map. It only takes a minute.
          </div>
          <button className="btn-salmon" onClick={() => { handleClose(); onGoProfile?.() }} style={{ marginTop: 8 }}>
            Go to Profile to Sign In
          </button>
        </div>
      </div>
    )
  }


  if (spotRejected) {
    return (
      <div className="scroll-area" style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', background: '#FDF8F0', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16, textAlign: 'center' }}>
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
      <div className="scroll-area" style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', background: '#FDF8F0', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 16, textAlign: 'center' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, background: '#FDF8F0', position: 'relative' }}>
      <div className="scroll-area">
        <div style={{ position: 'sticky', top: 0, zIndex: LAYERS.STICKY_HEADER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)', borderBottom: '1px solid #E8DDD0', background: '#FDF8F0' }}>
          <div style={{ width: 28 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Add a Spot</div>
          <div onClick={handleClose} style={{ width: 28, height: 28, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <CloseIcon />
          </div>
        </div>

        <div style={{ padding: '16px 14px' }}>

        <SpotFormFields form={form} setForm={setForm} fieldErrors={fieldErrors} fieldRefs={fieldRefs} />

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

        <div ref={locationSectionRef} style={{ marginBottom: 14 }}>
          <div className="section-label">Location</div>
          {fieldErrors.location && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 8 }}>{fieldErrors.location}</div>}
          {locationBlocked && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1.5, marginBottom: 8 }}>
              Location is blocked, so this can't be auto-filled. Search for the address below, or re-enable location for this app in your browser or device settings.
            </div>
          )}
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <input
              ref={addressInputRef}
              className="form-input"
              placeholder="Search address, place, or coordinates..."
              value={addr.addressText}
              onChange={e => addr.handleTextChange(e.target.value)}
              style={addr.status === 'confirmed' ? { paddingRight: 36 } : undefined}
            />
            {addr.status === 'confirmed' && (
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, pointerEvents: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7L6 11L12 3" stroke="#4a9a5a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            {addr.showDropdown && addr.geoResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: LAYERS.PAGE_CONTENT, background: '#FFFFFF', border: '1px solid #C8CAD4', borderRadius: 4, marginTop: 2, overflow: 'hidden' }} {...addressScrollDismiss}>
                {addr.geoResults.map(r => (
                  <div key={r.id} onPointerDown={e => { e.preventDefault(); handleSelectSuggestion(r) }} style={{ padding: '9px 12px', fontSize: 11, color: 'var(--text-primary)', borderBottom: '1px solid #ECEDF2', cursor: 'pointer', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700 }}>{r.text}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{r.place_name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {addr.rangeError ? (
            <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 8 }}>{addr.rangeError}</div>
          ) : addr.status === 'unconfirmed' && !addr.showDropdown ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>Pick a location from the list below.</div>
          ) : (
            <div style={{ marginBottom: 8 }} />
          )}
          <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #EAD8C8', height: 280 }}>
            <Map
              {...mapCenter}
              onMove={e => setMapCenter(e.viewState)}
              onLoad={e => {
                e.target.scrollZoom.disable()
                // Mapbox GL JS v3+ defaults to 'globe' and auto-switches by
                // zoom level — force mercator permanently, and re-apply on
                // any future style reload (a style's own projection can
                // override the constructor option).
                e.target.setProjection('mercator')
                e.target.on('style.load', () => e.target.setProjection('mercator'))
              }}
              projection="mercator"
              mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
              mapboxAccessToken={MAPBOX_TOKEN}
              style={{ width: '100%', height: '100%' }}
              onClick={e => { const { lng, lat } = e.lngLat; addr.handlePinMove(lat, lng) }}
              cursor="crosshair"
            >
              <NavigationControl position="top-right" showCompass={false} />
              {addr.latitude != null && addr.longitude != null && (
                <Marker longitude={addr.longitude} latitude={addr.latitude} anchor="bottom" draggable onDragEnd={e => { const { lng, lat } = e.lngLat; addr.handlePinMove(lat, lng) }}>
                  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.4))' }}>
                    <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                    <circle cx="10" cy="10" r="4" fill="#fff" />
                  </svg>
                </Marker>
              )}
            </Map>
          </div>
          {addr.status === 'confirmed'
            ? <div style={{ fontSize: 10, color: 'var(--salmon)', marginTop: 5, fontWeight: 700 }}>{addr.latitude.toFixed(5)}, {addr.longitude.toFixed(5)}</div>
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
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 6, cursor: 'pointer',
                    background: isActive ? 'rgba(212,120,90,0.06)' : '#F5F0EA',
                    border: `1.5px solid ${isActive ? '#d4785a' : '#E0D5C8'}`,
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isActive ? '#d4785a' : '#b0a090'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent',
                  }}>
                    {isActive && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#d4785a' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#d4785a' : '#2a1e14' }}>{opt.label}</div>
                    <div style={{ fontSize: 10, color: '#9a8878', marginTop: 1 }}>{opt.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Respect The Spot note */}
        <div style={{ background: '#F5F0EA', border: '1px solid #E8DDD0', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Respect The Spot
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Help us keep spots clean, don't intentionally damage property and respectfully leave if requested by owner, security, or officer. Sesh Wars is not responsible for any illegal activities.{' '}
            <span onClick={() => setShowTos(true)} style={{ color: '#d4785a', cursor: 'pointer', textDecoration: 'underline' }}>Terms of Service</span>
          </div>
        </div>

        <button className="btn-salmon" onClick={handleSubmit} disabled={uploading} style={{ marginTop: 4 }}>
          Drop This Spot
        </button>
        </div>

        <div style={{ height: 'calc(12px + env(safe-area-inset-bottom))' }} />
      </div>

      {/* Photo upload progress overlay */}
      {uploadingPhotos && (
        <LoadingOverlay
          title="Uploading Your Photos"
          subtitle={photoUploadProgress.current < photoUploadProgress.total
            ? `${photoUploadProgress.current} of ${photoUploadProgress.total}`
            : 'Almost done…'}
          current={photoUploadProgress.current}
          total={photoUploadProgress.total}
        />
      )}

      {/* Submit progress overlay — same component/treatment as the photo
          upload overlay above, instead of the "checking content" state only
          changing the disabled submit button's own label. Two steps
          (checking, saving) drive the same determinate ring the photo
          overlay uses. */}
      {uploading && (
        <LoadingOverlay
          title="Submitting Your Spot"
          subtitle={uploadingText}
          current={uploadingText === 'Saving...' ? 2 : 1}
          total={2}
        />
      )}
        {showTos && <TermsOfService onClose={() => setShowTos(false)} />}
      <SpotSaveErrorModal problems={saveProblems} onClose={closeSaveProblems} />
    </div>
  )
}
