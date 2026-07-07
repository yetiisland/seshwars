import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import Map, { Marker, NavigationControl } from 'react-map-gl'
import { supabase } from '../lib/supabase'
import { ShareIcon, BookmarkIcon, PencilIcon } from '../components/Icons'
import DraggablePhotos from '../components/DraggablePhotos'
import ClipsSection from '../components/ClipsSection'
import ReviewsSection from '../components/ReviewsSection'
import ReportSection from '../components/ReportSection'
import CommentsSection from '../components/CommentsSection'
import { slugify } from '../utils/slugify'
import { compressImage } from '../utils/compressImage'
import { checkImageModeration } from '../utils/moderation'
import TermsOfService from './TermsOfService'
import { isAdminUser } from '../lib/admin'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const TYPES = ['Street', 'DIY', 'Skatepark', 'Skate Shop']
const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)
const FEATURES = ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Flat Bar', 'Bump']
const BUST_OPTIONS = ['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only']
const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', desc: 'Visible to everyone on the map and list' },
  { value: 'unlisted', label: 'Unlisted', desc: 'Only people with the link can see it' },
  { value: 'private', label: 'Private', desc: 'Only you can see it' },
]
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

function bustBadgeStyle(rating) {
  if (rating === 'No Bust') return { background: '#4a7a3a', color: '#ffffff', border: '1px solid #3d6830' }
  if (rating === 'Bust') return { background: '#c0453a', color: '#ffffff', border: '1px solid #a83830' }
  if (rating === 'Medium Bust' || rating === 'Weekends Only' || rating === 'Weekdays Only') return { background: '#c8a020', color: '#ffffff', border: '1px solid #b08818' }
  return { background: '#3D4454', color: '#FFFFFF', border: '1px solid #2e3344' }
}

function bustChipActiveStyle(rating) {
  if (rating === 'No Bust') return { background: '#4a7a3a', borderColor: '#3d6830', color: '#ffffff' }
  if (rating === 'Bust') return { background: '#c0453a', borderColor: '#a83830', color: '#ffffff' }
  if (rating === 'Medium Bust' || rating === 'Weekends Only' || rating === 'Weekdays Only') return { background: '#c8a020', borderColor: '#b08818', color: '#ffffff' }
  return {}
}

const SpotDetail = forwardRef(function SpotDetail({ spot, saved, onSavePress, onBack, onEditSuccess, onSearch, user, onGoProfile }, ref) {
  // ── Photo / hero state ────────────────────────────────────────
  const [photoIndex, setPhotoIndex] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const touchStartX = useRef(null)
  const touchStartY = useRef(null)
  const dragging = useRef(false)

  // ── Lightbox ──────────────────────────────────────────────────
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lbDragX, setLbDragX] = useState(0)
  const [lbTransitioning, setLbTransitioning] = useState(false)
  const [lbScale, setLbScaleState] = useState(1)
  const [lbPanX, setLbPanX] = useState(0)
  const [lbPanY, setLbPanY] = useState(0)

  const lbScaleRef = useRef(1)
  const lbTouchStartX = useRef(null)
  const lbTouchStartY = useRef(null)
  const lbDragging = useRef(false)
  const lbPinchActive = useRef(false)
  const lbPinchStartDist = useRef(null)
  const lbPinchStartScale = useRef(1)
  const lbPanStartX = useRef(null)
  const lbPanStartY = useRef(null)
  const lbLastTapTime = useRef(0)
  const lbLastTapPos = useRef({ x: 0, y: 0 })

  const setLbScale = (v) => { lbScaleRef.current = v; setLbScaleState(v) }
  const resetLbZoom = () => { setLbScale(1); setLbPanX(0); setLbPanY(0) }

  // ── Publisher avatar ──────────────────────────────────────────
  // Always start empty and fill from profiles table so we show the CURRENT username/avatar,
  // not whatever snapshot was stored in added_by at creation time.
  const [publisherAvatar, setPublisherAvatar] = useState(null)
  const [publisherInitial, setPublisherInitial] = useState('')
  const [publisherUsername, setPublisherUsername] = useState('')

  // ── Edit state ────────────────────────────────────────────────
  const [showMapsModal, setShowMapsModal] = useState(false)
  const [showTos, setShowTos] = useState(false)
  const [showMapFullscreen, setShowMapFullscreen] = useState(false)
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
  const [showHideModal, setShowHideModal] = useState(false)
  const [hideModalClosing, setHideModalClosing] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [liveReport, setLiveReport] = useState(null)
  const [fsMapSatellite, setFsMapSatellite] = useState(false)
  const [avgRating, setAvgRating] = useState(spot.avg_rating ?? null)
  const [reviewCount, setReviewCount] = useState(spot.rating_count ?? 0)
  const handleStatsChange = (avg, count) => { setAvgRating(avg); setReviewCount(count) }
  const [modStatus, setModStatus] = useState(spot.moderation_status || 'approved')
  const scrollAreaRef = useRef()

  const photos = spot.photos || []
  const isAdmin = isAdminUser(user)
  const isOwner = !!user && (
    user.id === spot.added_by ||
    user.email?.split('@')[0] === spot.added_by
  )
  const hasCoords = spot.latitude && spot.longitude

  // ── Data fetching ─────────────────────────────────────────────
  useEffect(() => {
    if (!spot.id) return

    // Publisher profile — added_by may be a UUID (new spots) or username (legacy)
    if (spot.added_by) {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(spot.added_by)
      const query = isUUID
        ? supabase.from('profiles').select('avatar_url, first_name, username').eq('id', spot.added_by).maybeSingle()
        : supabase.from('profiles').select('avatar_url, first_name, username').eq('username', spot.added_by).maybeSingle()
      query.then(({ data }) => {
        if (data) {
          if (data.avatar_url) setPublisherAvatar(data.avatar_url)
          if (data.first_name) setPublisherInitial(data.first_name[0].toUpperCase())
          if (data.username) setPublisherUsername(data.username)
          else if (data.first_name) setPublisherUsername(data.first_name)
        } else if (isOwner && user?.id) {
          // Legacy spot: added_by stored old username that no longer matches — fall back to current user profile
          supabase.from('profiles').select('avatar_url, first_name, username').eq('id', user.id).maybeSingle()
            .then(({ data: d }) => {
              if (d?.avatar_url) setPublisherAvatar(d.avatar_url)
              if (d?.first_name) setPublisherInitial(d.first_name[0].toUpperCase())
              if (d?.username) setPublisherUsername(d.username)
              else if (d?.first_name) setPublisherUsername(d.first_name)
            })
        }
      })
    }
  }, [spot.id, user?.id])


  // ── Edit geocode ──────────────────────────────────────────────
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
    if (wasTap && photos.length > 0) {
      setLightboxIndex(photoIndex)
      resetLbZoom()
      setLightboxOpen(true)
    }
    setTransitioning(true)
    setPhotoIndex(newIdx)
    setDragX(0)
    touchStartX.current = null
    dragging.current = false
  }

  // ── Lightbox touch (swipe + pinch zoom) ───────────────────────
  const onLbTouchStart = (e) => {
    const touches = Array.from(e.touches)

    if (touches.length === 2) {
      lbPinchActive.current = true
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      lbPinchStartDist.current = Math.sqrt(dx * dx + dy * dy)
      lbPinchStartScale.current = lbScaleRef.current
      lbTouchStartX.current = null
      return
    }

    lbPinchActive.current = false
    const touch = touches[0]

    // Double-tap to reset zoom
    const now = Date.now()
    if (
      now - lbLastTapTime.current < 300 &&
      Math.abs(touch.clientX - lbLastTapPos.current.x) < 40 &&
      Math.abs(touch.clientY - lbLastTapPos.current.y) < 40
    ) {
      resetLbZoom()
      lbLastTapTime.current = 0
      return
    }
    lbLastTapTime.current = now
    lbLastTapPos.current = { x: touch.clientX, y: touch.clientY }

    if (lbScaleRef.current > 1) {
      // Pan mode
      lbPanStartX.current = touch.clientX
      lbPanStartY.current = touch.clientY
      lbTouchStartX.current = null
    } else {
      // Swipe mode
      lbTouchStartX.current = touch.clientX
      lbTouchStartY.current = touch.clientY
      lbDragging.current = false
      setLbTransitioning(false)
      setLbDragX(0)
    }
  }

  const onLbTouchMove = (e) => {
    const touches = Array.from(e.touches)

    if (lbPinchActive.current && touches.length === 2) {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const newScale = Math.min(4, Math.max(1, lbPinchStartScale.current * (dist / lbPinchStartDist.current)))
      setLbScale(newScale)
      if (newScale <= 1) { setLbPanX(0); setLbPanY(0) }
      return
    }

    if (touches.length !== 1) return
    const touch = touches[0]

    if (lbScaleRef.current > 1 && lbPanStartX.current !== null) {
      // Pan the zoomed image (delta approach)
      const dx = touch.clientX - lbPanStartX.current
      const dy = touch.clientY - lbPanStartY.current
      lbPanStartX.current = touch.clientX
      lbPanStartY.current = touch.clientY
      setLbPanX(prev => prev + dx)
      setLbPanY(prev => prev + dy)
      return
    }

    if (lbTouchStartX.current === null) return
    const dx = touch.clientX - lbTouchStartX.current
    const dy = touch.clientY - lbTouchStartY.current
    if (!lbDragging.current) {
      if (Math.abs(dx) > Math.abs(dy) + 4) lbDragging.current = true
      else if (Math.abs(dy) > Math.abs(dx) + 4) { lbTouchStartX.current = null; return }
    }
    if (lbDragging.current && photos.length > 1) setLbDragX(dx)
  }

  const onLbTouchEnd = (e) => {
    lbPinchActive.current = false
    lbPinchStartDist.current = null
    lbPanStartX.current = null
    lbPanStartY.current = null

    if (lbScaleRef.current > 1) {
      lbTouchStartX.current = null
      return
    }

    if (lbTouchStartX.current === null) return
    const dy = lbTouchStartY.current - e.changedTouches[0].clientY
    if (lbDragging.current) {
      let newIdx = lightboxIndex
      if (lbDragX < -55 && lightboxIndex < photos.length - 1) newIdx++
      else if (lbDragX > 55 && lightboxIndex > 0) newIdx--
      setLbTransitioning(true)
      setLightboxIndex(newIdx)
      setLbDragX(0)
      resetLbZoom()
    } else if (dy > 70) {
      setLightboxOpen(false)
      resetLbZoom()
    }
    lbTouchStartX.current = null
    lbDragging.current = false
  }

  // ── Edit helpers ──────────────────────────────────────────────
  const openEditForm = () => {
    setEditForm({
      title: spot.title || '',
      type: spot.type || '',
      features: [...(spot.features || [])],
      bust_rating: spot.bust_rating || '',
      description: spot.description || '',
      address: spot.address || '',
      latitude: spot.latitude,
      longitude: spot.longitude,
      visibility: spot.visibility || 'public',
    })
    setEditPhotos([...(spot.photos || [])])
    setEditGeoQuery(spot.address || '')
    setEditMapCenter({
      longitude: spot.longitude || -104.9903,
      latitude: spot.latitude || 39.7392,
      zoom: spot.latitude ? 15 : 13,
    })
    setShowEditForm(true)
  }

  const handleEditAuth = () => {
    if (editPassword === 'maxeffort') {
      openEditForm()
      setShowEditAuth(false)
      setEditPassword('')
      setAuthError('')
    } else {
      setAuthError('Access denied')
    }
  }

  const handleEditClick = () => {
    if (isAdmin || isOwner) openEditForm()
    else { setDeleteError(''); setShowEditAuth(true) }
  }

  useImperativeHandle(ref, () => ({ handleEditClick }))

  const selectEditGeoResult = (feature) => {
    const [lng, lat] = feature.geometry.coordinates
    setEditForm(p => ({ ...p, address: feature.place_name, latitude: lat, longitude: lng }))
    setEditMapCenter({ longitude: lng, latitude: lat, zoom: 16 })
    setEditGeoQuery(feature.place_name)
    setEditShowDropdown(false)
  }

  const handleEditPhotos = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setEditUploading(true)
    const urls = []
    for (const file of files) {
      const compressed = await compressImage(file, 1400)
      const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
      const { error } = await supabase.storage.from('spot-photos').upload(path, compressed, { contentType: 'image/jpeg' })
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
    const originalPhotos = spot.photos || []
    const newPhotos = editPhotos.filter(url => !originalPhotos.includes(url))
    let newModerationStatus = spot.moderation_status || 'approved'
    if (newPhotos.length > 0) {
      const results = await Promise.all(newPhotos.map(url => checkImageModeration(url)))
      const allSafe = results.every(r => r.safe)
      if (!allSafe) newModerationStatus = 'pending'
    }
    const payload = {
      title: editForm.title,
      slug: spot.slug || slugify(editForm.title, Math.random().toString(36).slice(2, 6)),
      type: editForm.type,
      features: editForm.features,
      bust_rating: editForm.bust_rating || null,
      description: editForm.description,
      address: editForm.address,
      latitude: editForm.latitude ? parseFloat(editForm.latitude) : null,
      longitude: editForm.longitude ? parseFloat(editForm.longitude) : null,
      photos: editPhotos,
      moderation_status: newModerationStatus,
      visibility: editForm.visibility || 'public',
    }
    const { data, error } = await supabase.from('spots').update(payload).eq('id', spot.id).select()
    setEditSaving(false)
    if (error) { setEditError(error.message); return }
    if (!data || data.length === 0) {
      setEditError('Update failed — you may not have permission to edit this spot.')
      return
    }
    setModStatus(newModerationStatus)
    setShowEditForm(false)
    onEditSuccess?.()
  }

  const toggleEditFeature = (f) => {
    setEditForm(p => ({
      ...p,
      features: p.features.includes(f) ? p.features.filter(x => x !== f) : [...p.features, f],
    }))
  }

  const handleReported = (reportType, customText) => {
    setLiveReport({ most_recent_report: reportType, most_recent_report_custom: customText || null })
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0
  }

  const handleAdminApprove = async () => {
    await supabase.from('spots').update({ moderation_status: 'approved' }).eq('id', spot.id)
    setModStatus('approved')
  }

  const handleAdminReject = async () => {
    const photoPaths = (spot.photos || []).map(url => {
      const match = url.match(/\/spot-photos\/(.+)$/)
      return match ? match[1] : null
    }).filter(Boolean)
    if (photoPaths.length > 0) {
      await supabase.storage.from('spot-photos').remove(photoPaths)
    }
    await Promise.all([
      supabase.from('spot_clips').delete().eq('spot_id', spot.id),
      supabase.from('spot_comments').delete().eq('spot_id', spot.id),
      supabase.from('spot_reviews').delete().eq('spot_id', spot.id),
      supabase.from('spot_reports').delete().eq('spot_id', spot.id),
      supabase.from('saved_spots').delete().eq('spot_id', spot.id),
    ])
    await supabase.from('spots').delete().eq('id', spot.id)
    window.dispatchEvent(new Event('seshwars:spots-changed'))
    onEditSuccess?.()
  }

  const handleDeleteSpot = async () => {
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.from('spots').delete().eq('id', spot.id)
    setDeleting(false)
    if (error) { setDeleteError(error.message); return }
    setShowDeleteConfirm(false)
    setShowEditForm(false)
    window.dispatchEvent(new Event('seshwars:spots-changed'))
    onEditSuccess?.()
  }

  const openMaps = (provider) => {
    const { latitude, longitude, title } = spot
    if (provider === 'google') window.open(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`, '_blank')
    else window.open(`http://maps.apple.com/?ll=${latitude},${longitude}&q=${encodeURIComponent(title)}`, '_blank')
    setShowMapsModal(false)
  }

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/api/spot/${spot.slug || spot.id}`
    const text = `Check out this spot: ${spot.title}`
    if (navigator.share) await navigator.share({ title: spot.title, text, url: shareUrl })
    else navigator.clipboard?.writeText(shareUrl)
  }

  const closeHideModal = () => {
    setHideModalClosing(true)
    setTimeout(() => { setHideModalClosing(false); setShowHideModal(false) }, 180)
  }

  const confirmHide = async () => {
    closeHideModal()
    if (!user?.id) return
    await supabase.from('hidden_spots').insert({ user_id: user.id, spot_id: spot.id }).catch(() => {})
    onBack?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
      <div className="scroll-area" ref={scrollAreaRef}>

        {/* ── Hero Photo (4:3) ───────────────────────────────── */}
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

          {/* Gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 40%, rgba(20,28,20,0.85) 100%)', pointerEvents: 'none' }} />

          {/* Top-left: type + bust badges */}
          <div style={{ position: 'absolute', top: 10, left: 12, zIndex: 10, display: 'flex', gap: 4, alignItems: 'center' }}>
            <div className="spot-badge">{normalizeType(spot.type)}</div>
            {spot.bust_rating && (
              <div style={{ ...bustBadgeStyle(spot.bust_rating), fontSize: 9, padding: '3px 7px', borderRadius: 6, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                {spot.bust_rating}
              </div>
            )}
          </div>

          {/* Top-right: bookmark */}
          <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 10 }}>
            <div
              onClick={e => { e.stopPropagation(); onSavePress?.(spot) }}
              onTouchStart={e => e.stopPropagation()}
              style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <BookmarkIcon color="#d4785a" size={16} filled={saved} />
            </div>
          </div>

          {/* Photo dots — bottom right */}
          {photos.length > 1 && (
            <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 10, display: 'flex', gap: 5 }}>
              {photos.map((_, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setPhotoIndex(i) }}
                  style={{ width: i === photoIndex ? 7 : 5, height: i === photoIndex ? 7 : 5, borderRadius: '50%', background: i === photoIndex ? '#d4785a' : '#fff', opacity: i === photoIndex ? 1 : 0.5, cursor: 'pointer', transition: 'all 0.15s' }} />
              ))}
            </div>
          )}
          {/* Caution indicator — bottom left */}
          {liveReport?.most_recent_report
            ? liveReport.most_recent_report !== 'Skateable Again'
            : (spot.most_recent_report && spot.most_recent_report !== 'Skateable Again')
          ? (
            <div style={{ position: 'absolute', bottom: 14, left: 12, zIndex: 10, background: '#f5c518', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 'calc(100% - 24px)' }}>
              <svg width="9" height="8" viewBox="0 0 18 16" fill="none">
                <path d="M9 1L17 15H1L9 1Z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <line x1="9" y1="5.5" x2="9" y2="10" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="9" cy="12.5" r="0.9" fill="#000" />
              </svg>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(() => {
                  const r = liveReport?.most_recent_report ?? spot.most_recent_report
                  const rc = liveReport?.most_recent_report_custom ?? spot.most_recent_report_custom
                  return r === 'Other' ? (rc || 'Spot Reported') : r
                })()}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Content ───────────────────────────────────────── */}
        <div style={{ padding: '16px 14px 0', background: '#FDF8F0' }}>

          {/* Title row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3, paddingRight: 8 }}>{spot.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {avgRating != null && reviewCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L14.5 9.5H22.5L16.1 13.9L18.5 21.5L12 17.2L5.5 21.5L7.9 13.9L1.5 9.5H9.5Z" fill="#3D4454" />
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#3D4454' }}>{avgRating.toFixed(1)}</span>
                </div>
              )}
              {avgRating != null && reviewCount > 0 && spot.distance != null && (
                <span style={{ color: '#b0a090', fontSize: 10 }}>·</span>
              )}
              {spot.distance != null && <span className="dist-text">{spot.distance} mi</span>}
              {user && (
                <div
                  onClick={() => setShowHideModal(true)}
                  style={{ width: 34, height: 34, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 2 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="#d4785a" strokeWidth="1.8" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="#d4785a" strokeWidth="1.8" />
                  </svg>
                </div>
              )}
              <div
                onClick={handleShare}
                style={{ width: 34, height: 34, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 2 }}
              >
                <ShareIcon color="#d4785a" />
              </div>
            </div>
          </div>

          {/* Feature chips — above publisher */}
          {(spot.features || []).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginBottom: 8 }}>
              {(spot.features || []).map(f => <span key={f} className="tag">{f}</span>)}
            </div>
          )}

          {/* Publisher row */}
          {(publisherAvatar || publisherUsername || spot.added_by === null) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>Added by:</span>
              {spot.added_by === null ? (
                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>Anonymous</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid #EAD8C8', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ECEDF2', flexShrink: 0 }}>
                    {publisherAvatar ? (
                      <img src={publisherAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 9, fontWeight: 900, color: '#6a6c7a' }}>{publisherInitial}</span>
                    )}
                  </div>
                  {publisherUsername && <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 700 }}>@{publisherUsername}</span>}
                </div>
              )}
            </div>
          )}

          {/* Moderation banners */}
          {modStatus === 'pending' && isAdmin && (
            <div style={{ background: '#fff3cd', border: '1px solid #c8a020', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <svg width="14" height="12" viewBox="0 0 18 16" fill="none"><path d="M9 1L17 15H1L9 1Z" stroke="#c8a020" strokeWidth="1.5" strokeLinejoin="round" fill="none" /><line x1="9" y1="5.5" x2="9" y2="10" stroke="#c8a020" strokeWidth="1.8" strokeLinecap="round" /><circle cx="9" cy="12.5" r="0.9" fill="#c8a020" /></svg>
                <span style={{ fontSize: 11, fontWeight: 900, color: '#7a5c00', letterSpacing: 0.5, textTransform: 'uppercase' }}>Flagged — Pending Review</span>
              </div>
              <div style={{ fontSize: 11, color: '#7a5c00', marginBottom: 10, lineHeight: 1.5 }}>This spot was auto-flagged for possible nudity or gore and is hidden from the public feed.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAdminApprove} style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#4a7a3a', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>Approve</button>
                <button onClick={handleAdminReject} style={{ flex: 1, padding: '8px 0', borderRadius: 6, background: '#c0453a', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>Reject</button>
              </div>
            </div>
          )}
          {modStatus === 'rejected' && isAdmin && (
            <div style={{ background: '#fdecea', border: '1px solid #c0453a', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#c0453a' }}>⊘ Rejected — not visible to public</span>
            </div>
          )}
          {modStatus === 'pending' && !isAdmin && isOwner && (
            <div style={{ background: '#fff3cd', border: '1px solid #c8a020', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="12" height="11" viewBox="0 0 18 16" fill="none"><path d="M9 1L17 15H1L9 1Z" stroke="#c8a020" strokeWidth="1.5" strokeLinejoin="round" fill="none" /><line x1="9" y1="5.5" x2="9" y2="10" stroke="#c8a020" strokeWidth="1.8" strokeLinecap="round" /><circle cx="9" cy="12.5" r="0.9" fill="#c8a020" /></svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5c00' }}>Under Review — your spot is hidden until approved</span>
            </div>
          )}

          {(isOwner || isAdmin) && spot.visibility && spot.visibility !== 'public' && (
            <div style={{ background: spot.visibility === 'private' ? '#f5ece8' : '#f0ede5', border: `1px solid ${spot.visibility === 'private' ? '#ddc0b0' : '#d8cdb8'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
              {spot.visibility === 'private' ? (
                <svg width="11" height="13" viewBox="0 0 14 16" fill="none"><rect x="3" y="7" width="8" height="8" rx="1.5" stroke="#9a5838" strokeWidth="1.4"/><path d="M4.5 7V5a2.5 2.5 0 015 0v2" stroke="#9a5838" strokeWidth="1.4" strokeLinecap="round"/></svg>
              ) : (
                <svg width="13" height="10" viewBox="0 0 18 12" fill="none"><path d="M9 1C5 1 1.73 3.89 1 6c.73 2.11 4 5 8 5s7.27-2.89 8-5c-.73-2.11-4-5-8-5z" stroke="#8a7848" strokeWidth="1.4" fill="none"/><circle cx="9" cy="6" r="2.5" stroke="#8a7848" strokeWidth="1.4"/></svg>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, color: spot.visibility === 'private' ? '#7a4028' : '#6a5828' }}>
                {spot.visibility === 'private' ? 'Private — only you can see this spot' : 'Unlisted — only visible via direct link'}
              </span>
            </div>
          )}

          <div className="divider" />

          {/* About */}
          <div className="section-label">About this spot</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
            {spot.description || 'No description added.'}
          </div>

          <div className="divider" />

          {/* Location */}
          <div className="section-label">Location</div>
          <div style={{ width: '100%', height: 180, borderRadius: 6, overflow: 'hidden', marginBottom: 6, background: '#ECEDF2', position: 'relative' }}>
            {hasCoords ? (
              <>
                <Map
                  initialViewState={{ longitude: spot.longitude, latitude: spot.latitude, zoom: 15 }}
                  mapStyle="mapbox://styles/mapbox/streets-v12"
                  mapboxAccessToken={MAPBOX_TOKEN}
                  style={{ width: '100%', height: '100%' }}
                  attributionControl={false}
                  scrollZoom={true}
                  touchZoomRotate={true}
                >
                  <Marker longitude={spot.longitude} latitude={spot.latitude} anchor="bottom">
                    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}>
                      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                      <circle cx="10" cy="10" r="4" fill="#fff" />
                    </svg>
                  </Marker>
                </Map>
                <div
                  onClick={() => setShowMapFullscreen(true)}
                  style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 5V1H5M9 1H13V5M13 9V13H9M5 13H1V9" stroke="#2a1e14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </>
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>No coordinates</span>
              </div>
            )}
          </div>
          {spot.address && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 14 }}>{spot.address}</div>}

          {hasCoords && (
            <div style={{ marginBottom: 16 }}>
              <div
                onClick={() => setShowMapsModal(true)}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>Get Directions</span>
              </div>
            </div>
          )}
          <ReportSection spotId={spot.id} spot={spot} user={user} onGoProfile={onGoProfile} onReported={handleReported} />
          {/* Report Skateable Again — visible when there's an active caution report */}
          {(() => {
            const activeReport = liveReport?.most_recent_report ?? spot.most_recent_report
            if (!activeReport || activeReport === 'Skateable Again') return null
            return (
              <div
                onClick={async () => {
                  if (!user) { onGoProfile?.(); return }
                  const { data: { user: cu } } = await supabase.auth.getUser()
                  if (!cu) return
                  await supabase.from('spot_reports').insert({ spot_id: spot.id, user_id: cu.id, report_type: 'Skateable Again', custom_text: null })
                  handleReported('Skateable Again', null)
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px solid #4a7a3a', borderRadius: 6, padding: 13, cursor: 'pointer', marginBottom: 20, background: 'transparent' }}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7L6 11L12 3" stroke="#4a7a3a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#4a7a3a', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
                  Report Skateable Again
                </span>
              </div>
            )
          })()}
          <ClipsSection spotId={spot.id} user={user} onGoProfile={onGoProfile} isAdmin={isAdmin} />
          <ReviewsSection spotId={spot.id} user={user} onStatsChange={handleStatsChange} />
          <CommentsSection spotId={spot.id} user={user} onGoProfile={onGoProfile} />
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>


      {/* ── Fullscreen map ───────────────────────────────── */}
      {showMapFullscreen && hasCoords && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000' }}>
          <Map
            initialViewState={{ longitude: spot.longitude, latitude: spot.latitude, zoom: 15 }}
            mapStyle={fsMapSatellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12'}
            mapboxAccessToken={MAPBOX_TOKEN}
            style={{ width: '100%', height: '100%' }}
            scrollZoom={true}
            touchZoomRotate={true}
          >
            <Marker longitude={spot.longitude} latitude={spot.latitude} anchor="bottom">
              <svg width="24" height="29" viewBox="0 0 20 24" fill="none" style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.5))' }}>
                <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                <circle cx="10" cy="10" r="4" fill="#fff" />
              </svg>
            </Marker>
          </Map>
          {/* Satellite/street eye toggle — bottom-right */}
          <div
            onClick={() => setFsMapSatellite(s => !s)}
            style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)', right: 10, width: 38, height: 38, borderRadius: 6, background: fsMapSatellite ? '#FDF8F0' : '#d4785a', border: fsMapSatellite ? '2px solid #d4785a' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100000, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
          >
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
              <path d="M1 10C1 10 4 4 10 4C16 4 19 10 19 10C19 10 16 16 10 16C4 16 1 10 1 10Z"
                stroke={fsMapSatellite ? '#d4785a' : '#fff'} strokeWidth="1.5" strokeLinejoin="round"
                fill={fsMapSatellite ? 'rgba(212,120,90,0.12)' : 'rgba(255,255,255,0.18)'} />
              <circle cx="10" cy="10" r="3"
                stroke={fsMapSatellite ? '#d4785a' : '#fff'} strokeWidth="1.5"
                fill={fsMapSatellite ? '#d4785a' : '#fff'} />
            </svg>
          </div>
          {/* X close button */}
          <div
            onClick={() => setShowMapFullscreen(false)}
            style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100000, boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="3" y1="3" x2="15" y2="15" stroke="#2a1e14" strokeWidth="2" strokeLinecap="round"/>
              <line x1="15" y1="3" x2="3" y2="15" stroke="#2a1e14" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>,
        document.body
      )}

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
            <div style={{ margin: '12px 16px 20px', padding: '10px 12px', background: '#F5F0EA', border: '1px solid #E8DDD0', borderRadius: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Respect The Spot</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Help us keep spots clean, don't intentionally damage property and respectfully leave if requested by owner, security, or officer. Sesh Wars is not responsible for any illegal activities.{' '}<span onClick={() => { setShowMapsModal(false); setShowTos(true) }} style={{ color: '#d4785a', cursor: 'pointer', textDecoration: 'underline' }}>Terms of Service</span></div>
            </div>
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
                onKeyDown={e => e.key === 'Enter' && handleEditAuth()} autoFocus autoComplete="off" />
              {authError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{authError}</div>}
              <button className="btn-salmon" onClick={handleEditAuth}>Unlock</button>
            </div>
            <div className="modal-cancel" onClick={() => { setShowEditAuth(false); setEditPassword(''); setAuthError('') }}>Cancel</div>
          </div>
        </div>
      )}

      {/* ── Edit form overlay ─────────────────────────────── */}
      {showEditForm && editForm && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)', borderBottom: '1px solid #E8DDD0', flexShrink: 0, background: '#FDF8F0' }}>
            <div style={{ width: 28 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Edit Spot</div>
            <div onClick={() => setShowEditForm(false)} style={{ width: 28, height: 28, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /><line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
          </div>

          <div className="scroll-area" style={{ padding: '16px 14px' }}>
            {/* Spot Name */}
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Spot Name</div>
              <input className="form-input" placeholder="e.g. Civic Center Ledges" value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
            </div>

            {/* Type */}
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Type</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <div key={t} className={`chip ${editForm.type === t ? 'active' : ''}`} onClick={() => setEditForm(p => ({ ...p, type: t }))}>{t}</div>
                ))}
              </div>
            </div>

            {/* Features — conditional */}
            {(editForm.type === 'Street' || editForm.type === 'DIY' || editForm.type === 'Skatepark') && (
              <div style={{ marginBottom: 14 }}>
                <div className="section-label">Features</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {FEATURES.map(f => (
                    <div key={f} className={`chip ${editForm.features.includes(f) ? 'active' : ''}`} onClick={() => toggleEditFeature(f)}>{f}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Bust Rating — conditional */}
            {(editForm.type === 'Street' || editForm.type === 'DIY') && (
              <div style={{ marginBottom: 14 }}>
                <div className="section-label">Bust Rating</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {BUST_OPTIONS.map(b => {
                    const isActive = editForm.bust_rating === b
                    return (
                      <div key={b}
                        className={`chip ${isActive ? 'active' : ''}`}
                        style={isActive ? bustChipActiveStyle(b) : undefined}
                        onClick={() => setEditForm(p => ({ ...p, bust_rating: p.bust_rating === b ? '' : b }))}
                      >{b}</div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Description</div>
              <textarea className="form-input" placeholder="What makes this spot sick? Security? Best time to skate?" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="divider" />

            {/* Photos */}
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Photos</div>
              <DraggablePhotos
                photos={editPhotos}
                setPhotos={setEditPhotos}
                onAdd={() => editFileRef.current?.click()}
                uploading={editUploading}
              />
              <input ref={editFileRef} type="file" accept="image/*" multiple hidden onChange={handleEditPhotos} />
            </div>

            <div className="divider" />

            {/* Location */}
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
              <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #EAD8C8', height: 280 }}>
                <Map
                  {...editMapCenter}
                  onMove={e => setEditMapCenter(e.viewState)}
                  mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
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

            <div className="divider" />

            {/* Visibility */}
            <div style={{ marginBottom: 14 }}>
              <div className="section-label">Visibility</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {VISIBILITY_OPTIONS.map(opt => {
                  const isActive = (editForm.visibility || 'public') === opt.value
                  return (
                    <div
                      key={opt.value}
                      onClick={() => setEditForm(p => ({ ...p, visibility: opt.value }))}
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

            {editError && <div style={{ fontSize: 11, color: '#e07070', marginBottom: 10, fontWeight: 700 }}>{editError}</div>}

            {/* Respect The Spot note */}
            <div style={{ background: '#F5F0EA', border: '1px solid #E8DDD0', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Respect The Spot
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Help us keep spots clean, don't intentionally damage property and respectfully leave if requested by owner, security, or officer.
              </div>
            </div>

            <button className="btn-salmon" onClick={handleEditSave} disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>

            <div style={{ marginTop: 10, marginBottom: 4 }}>
              <button onClick={() => setShowDeleteConfirm(true)} style={{ width: '100%', padding: 11, borderRadius: 6, background: 'transparent', border: '1px solid rgba(212,120,90,0.45)', color: '#d4785a', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                Delete Spot
              </button>
            </div>

            <div style={{ height: BOTTOM_PAD }} />
          </div>

          {/* Delete confirm modal — inside portal so it's above edit form */}
          {showDeleteConfirm && (
            <div className="modal-overlay" onClick={() => { if (!deleting) { setShowDeleteConfirm(false); setDeleteError('') } }}>
              <div className="modal-sheet" onClick={e => e.stopPropagation()}>
                <div className="modal-handle" />
                <div className="modal-title">Delete Spot</div>
                <div style={{ padding: '0 20px 8px', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
                  Are you sure you want to delete this spot? This cannot be undone.
                </div>
                {deleteError && (
                  <div style={{ padding: '0 20px 8px', fontSize: 11, color: '#e07070', textAlign: 'center', fontWeight: 700 }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={handleDeleteSpot} disabled={deleting}
                    style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleting ? 0.7 : 1 }}>
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
                <div className="modal-cancel" onClick={() => { if (!deleting) { setShowDeleteConfirm(false); setDeleteError('') } }}>Cancel</div>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* ── Lightbox with pinch zoom ──────────────────────── */}
      {lightboxOpen && photos.length > 0 && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', touchAction: 'none' }}
          onTouchStart={onLbTouchStart}
          onTouchMove={onLbTouchMove}
          onTouchEnd={onLbTouchEnd}
        >
          <div onClick={() => { setLightboxOpen(false); resetLbZoom() }} style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 16, width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100000 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="2" x2="12" y2="12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /><line x1="12" y1="2" x2="2" y2="12" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </div>
          {photos.length > 1 && (
            <div style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 18px)', left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 700, letterSpacing: 1 }}>
              {lightboxIndex + 1} / {photos.length}
            </div>
          )}

          {/* Photo strip — swipe handled when scale == 1 */}
          <div style={{ position: 'relative', width: '100%', height: '80%', overflow: 'hidden' }}>
            {photos.map((photo, i) => (
              <div key={i} style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: `translateX(calc(${(i - lightboxIndex) * 100}% + ${lbScale <= 1 ? lbDragX : 0}px))`,
                transition: lbTransitioning ? 'transform 0.28s cubic-bezier(0.25,0.1,0.25,1)' : 'none',
                willChange: 'transform',
              }}>
                <img
                  src={photo}
                  alt={spot.title}
                  style={{
                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
                    userSelect: 'none', pointerEvents: 'none', display: 'block',
                    transform: i === lightboxIndex
                      ? `scale(${lbScale}) translate(${lbPanX / lbScale}px, ${lbPanY / lbScale}px)`
                      : undefined,
                    transformOrigin: 'center center',
                    willChange: 'transform',
                  }}
                  draggable={false}
                />
              </div>
            ))}
          </div>

          {photos.length > 1 && lbScale <= 1 && (
            <div style={{ position: 'absolute', bottom: 48, display: 'flex', gap: 6 }}>
              {photos.map((_, i) => (
                <div key={i} onClick={() => { setLbTransitioning(true); setLightboxIndex(i); resetLbZoom() }}
                  style={{ width: i === lightboxIndex ? 8 : 6, height: i === lightboxIndex ? 8 : 6, borderRadius: '50%', background: i === lightboxIndex ? '#d4785a' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.15s' }} />
              ))}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 22, fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {lbScale > 1 ? 'Double-tap to reset · Pinch to zoom' : 'Swipe to view photos'}
          </div>
        </div>,
        document.body
      )}
      {showTos && createPortal(<TermsOfService onClose={() => setShowTos(false)} />, document.body)}
      {(showHideModal || hideModalClosing) && createPortal(
        <div className="modal-overlay" onClick={closeHideModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={hideModalClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Hide This Spot?
            </div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This spot won't show up in your feed anymore. You can unhide it anytime from your profile.
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmHide} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                Hide Spot
              </button>
              <button onClick={closeHideModal} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
})

export default SpotDetail
