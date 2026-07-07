import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { checkImageModeration } from '../utils/moderation'
import InitialsAvatar from './InitialsAvatar'

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(Math.max(diff / 60, 1))}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

async function fetchProfiles(userIds) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return {}
  const { data } = await supabase.from('profiles').select('id, username, avatar_url, first_name').in('id', unique)
  return Object.fromEntries((data || []).map(p => [p.id, p]))
}

function extractYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m?.[1] || null
}

function extractVimeoId(url) {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m?.[1] || null
}

function extractInstagramId(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/)
  return m?.[1] || null
}

function isImageUrl(url) {
  if (!url) return false
  if (url.includes('/image/upload/')) return true
  return /\.(jpg|jpeg|png|gif|webp|heic)(\?|$)/i.test(url)
}

function getEmbedUrl(clip) {
  if (clip.type !== 'link') return null
  const ytId = extractYouTubeId(clip.url)
  if (ytId) return `https://www.youtube.com/embed/${ytId}?autoplay=1&playsinline=1`
  const vimeoId = extractVimeoId(clip.url)
  if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}?autoplay=1`
  const igId = extractInstagramId(clip.url)
  if (igId) return `https://www.instagram.com/p/${igId}/embed/`
  return null
}

function getThumbnail(clip) {
  if (clip.thumbnail_url) return clip.thumbnail_url
  if (isImageUrl(clip.url)) return clip.url
  if (clip.type === 'link') {
    const ytId = extractYouTubeId(clip.url)
    if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
  }
  return null
}

function SmallAvatar({ profile }) {
  const [imgError, setImgError] = useState(false)
  if (profile?.avatar_url && !imgError) {
    return <img src={profile.avatar_url} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #EAD8C8' }} onError={() => setImgError(true)} />
  }
  return <InitialsAvatar profile={profile} size={20} />
}

export default function ClipsSection({ spotId, user, onGoProfile, isAdmin = false }) {
  const [clips, setClips] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [modalClosing, setModalClosing] = useState(false)
  const [activeClip, setActiveClip] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [uploadMode, setUploadMode] = useState(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [showClipDeleteModal, setShowClipDeleteModal] = useState(false)
  const [clipDeleteModalClosing, setClipDeleteModalClosing] = useState(false)
  const [signInPrompt, setSignInPrompt] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [showVideoOverlay, setShowVideoOverlay] = useState(true)
  const photoFileRef = useRef(null)
  const lbTouchStartY = useRef(null)
  const lbTouchStartX = useRef(null)
  const videoRef = useRef(null)
  const overlayTimerRef = useRef(null)

  const loadClips = useCallback(async () => {
    let query = supabase.from('spot_clips').select('*').eq('spot_id', spotId)
    if (!isAdmin) {
      query = query.or('moderation_status.eq.approved,moderation_status.is.null')
    }
    const { data } = await query.order('created_at', { ascending: false })
    if (!data) return
    const profileMap = await fetchProfiles(data.map(c => c.user_id))
    setClips(data.map(c => ({ ...c, profile: profileMap[c.user_id] || null })))
  }, [spotId, isAdmin])

  useEffect(() => { loadClips() }, [loadClips])

  useEffect(() => {
    if (!activeClip || activeClip.type === 'link') return
    setVideoPlaying(false)
    setShowVideoOverlay(true)
    setVideoError(false)
    clearTimeout(overlayTimerRef.current)
  }, [activeClip])

  const scheduleOverlayHide = () => {
    clearTimeout(overlayTimerRef.current)
    overlayTimerRef.current = setTimeout(() => setShowVideoOverlay(false), 500)
  }

  const handleVideoTap = (e) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play().then(() => { setVideoPlaying(true); scheduleOverlayHide() }).catch(() => {})
    } else {
      setShowVideoOverlay(true)
      scheduleOverlayHide()
    }
  }

  const handleVideoPlay = () => { setVideoPlaying(true); scheduleOverlayHide() }
  const handleVideoPause = () => { setVideoPlaying(false); setShowVideoOverlay(true); clearTimeout(overlayTimerRef.current) }
  const handleVideoEnded = () => { setVideoPlaying(false); setShowVideoOverlay(true); clearTimeout(overlayTimerRef.current) }

  const handlePhotoUpload = async () => {
    if (!selectedPhotoFile || uploading) return
    setUploading(true); setUploadProgress(0); setUploadError('')
    const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !cu) { setUploadError('Sign in required.'); setUploading(false); return }
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
    const formData = new FormData()
    formData.append('file', selectedPhotoFile)
    formData.append('upload_preset', uploadPreset)
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.onload = async () => {
      let data
      try { data = JSON.parse(xhr.responseText) } catch { setUploadError('Upload failed'); setUploading(false); return }
      if (xhr.status !== 200 || data.error) { setUploadError(data.error?.message || 'Upload failed'); setUploading(false); return }
      const thumbnailUrl = data.secure_url
      const modResult = await checkImageModeration(thumbnailUrl)
      if (modResult.autoReject) { setUploadError('Content flagged.'); setUploading(false); return }
      const clip_mod_status = modResult.safe ? 'approved' : 'pending'
      const { data: clip, error: insertErr } = await supabase
        .from('spot_clips')
        .insert({ spot_id: spotId, user_id: cu.id, type: 'upload', url: data.secure_url, thumbnail_url: thumbnailUrl, moderation_status: clip_mod_status })
        .select().single()
      if (insertErr) { setUploadError(insertErr.message); setUploading(false); return }
      setUploading(false)
      setSelectedPhotoFile(null)
      closeModal()
      if (clip_mod_status === 'approved' || isAdmin) {
        const profileMap = await fetchProfiles([cu.id])
        setClips(prev => [{ ...clip, profile: profileMap[cu.id] || null }, ...prev])
      }
    }
    xhr.onerror = () => { setUploadError('Network error.'); setUploading(false) }
    xhr.send(formData)
  }

  const handleLinkSubmit = async () => {
    const url = linkUrl.trim()
    if (!url || uploading) return
    setUploading(true); setUploadError('')
    const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !cu) { setUploadError('Sign in required.'); setUploading(false); return }

    let thumbnailUrl = null
    const ytId = extractYouTubeId(url)
    const vimeoId = extractVimeoId(url)
    const igId = extractInstagramId(url)
    if (ytId) thumbnailUrl = `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
    else if (vimeoId) {
      try {
        const res = await fetch(`https://vimeo.com/api/v2/video/${vimeoId}.json`)
        thumbnailUrl = (await res.json())?.[0]?.thumbnail_large || null
      } catch {}
    }
    // Instagram links: thumbnail_url stays null; placeholder renders client-side
    let clip_mod_status = 'approved'
    if (thumbnailUrl) {
      const modResult = await checkImageModeration(thumbnailUrl)
      if (modResult.autoReject) {
        setUploadError('This content was detected as explicit or harmful and cannot be uploaded.')
        setUploading(false)
        return
      }
      clip_mod_status = modResult.safe ? 'approved' : 'pending'
    }

    const { data: clip, error: insertErr } = await supabase
      .from('spot_clips')
      .insert({ spot_id: spotId, user_id: cu.id, type: 'link', url, thumbnail_url: thumbnailUrl, title: linkTitle.trim() || null, moderation_status: clip_mod_status })
      .select().single()

    if (insertErr) { setUploadError(insertErr.message); setUploading(false); return }
    setUploading(false)
    closeModal()
    if (clip_mod_status === 'approved' || isAdmin) {
      const profileMap = await fetchProfiles([cu.id])
      setClips(prev => [{ ...clip, profile: profileMap[cu.id] || null }, ...prev])
    } else {
      setUploadError('Your clip is under review and will appear once approved.')
    }
  }

  const closeClipDeleteModal = () => {
    setClipDeleteModalClosing(true)
    setTimeout(() => { setClipDeleteModalClosing(false); setShowClipDeleteModal(false) }, 180)
  }

  const handleDeleteClip = async () => {
    await supabase.from('spot_clips').delete().eq('id', activeClip.id)
    const newClips = clips.filter(c => c.id !== activeClip.id)
    setClips(newClips)
    closeClipDeleteModal()
    if (newClips.length === 0) {
      closeLightbox()
    } else {
      const newI = Math.min(activeIndex, newClips.length - 1)
      setActiveClip(newClips[newI])
      setActiveIndex(newI)
    }
  }

  const closeModal = () => {
    setModalClosing(true)
    setTimeout(() => {
      setModalClosing(false)
      setShowModal(false); setUploadMode(null); setSelectedPhotoFile(null)
      setLinkUrl(''); setLinkTitle(''); setUploadError(''); setUploading(false); setUploadProgress(0)
      if (photoFileRef.current) photoFileRef.current.value = ''
    }, 180)
  }

  const closeLightbox = () => {
    clearTimeout(overlayTimerRef.current)
    setActiveClip(null); setActiveIndex(0); setVideoError(false)
    setVideoPlaying(false); setShowVideoOverlay(true)
  }

  const goToClip = (index) => {
    if (clips.length === 0) return
    const i = ((index % clips.length) + clips.length) % clips.length
    clearTimeout(overlayTimerRef.current)
    setActiveClip(clips[i])
    setActiveIndex(i)
    setVideoError(false)
    setVideoPlaying(false)
    setShowVideoOverlay(true)
  }

  return (
    <div>
      <div className="divider" />
      <div className="section-label">Community Clips</div>

      {clips.length === 0 ? null : (
        <div style={{ position: 'relative', margin: '0 -14px 12px' }}>
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 36, background: 'linear-gradient(to right, transparent, #FDF8F0)', zIndex: 2, pointerEvents: 'none' }} />
          <div className="hide-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 14px 4px' }}>
            {clips.map(clip => {
              const thumb = getThumbnail(clip)
              const uname = clip.profile?.username || clip.profile?.first_name || 'Anonymous'
              return (
                <div key={clip.id} style={{ flexShrink: 0, width: 140, display: 'flex', flexDirection: 'column' }}>
                  <div
                    onClick={() => { const i = clips.indexOf(clip); setActiveClip(clip); setActiveIndex(i); setVideoError(false) }}
                    style={{ width: 140, height: 100, borderRadius: 8, overflow: 'hidden', background: (!thumb && extractInstagramId(clip.url)) ? 'linear-gradient(135deg, #833ab4 0%, #fd1d1d 50%, #fcb045 100%)' : '#2a352a', position: 'relative', cursor: 'pointer' }}
                  >
                    {thumb && <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    {!thumb && extractInstagramId(clip.url) && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                        <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                          <rect x="3" y="3" width="26" height="26" rx="7" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" fill="none" />
                          <circle cx="16" cy="16" r="6" stroke="rgba(255,255,255,0.95)" strokeWidth="2.2" fill="none" />
                          <circle cx="23" cy="9" r="1.6" fill="rgba(255,255,255,0.95)" />
                        </svg>
                        <span style={{ fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.88)', letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif', textAlign: 'center', lineHeight: 1.4 }}>View on<br />Instagram</span>
                      </div>
                    )}
                    {(thumb || !extractInstagramId(clip.url)) && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.5) 100%)' }} />}
                    {isAdmin && clip.moderation_status === 'pending' && (
                      <div style={{ position: 'absolute', top: 5, left: 5, background: 'rgba(255,175,0,0.9)', borderRadius: 4, padding: '2px 5px', fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#2a1e14', zIndex: 3 }}>PENDING</div>
                    )}
                    {!isImageUrl(clip.url) && !extractInstagramId(clip.url) && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', border: '2px solid rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="11" height="13" viewBox="0 0 11 13" fill="none"><path d="M1.5 1L9.5 6.5L1.5 12V1Z" fill="white" /></svg>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 2px 2px' }}>
                    <SmallAvatar profile={clip.profile} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#2a1e14', fontFamily: 'Barlow, sans-serif', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{uname}</span>
                    <span style={{ fontSize: 9, color: '#b0a090', fontWeight: 600, fontFamily: 'Barlow, sans-serif', flexShrink: 0 }}>{relativeTime(clip.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Upload button */}
      <div
        onClick={() => { if (!user) { onGoProfile ? onGoProfile() : setSignInPrompt(true); return } setSignInPrompt(false); setShowModal(true) }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px solid #d4785a', borderRadius: 6, padding: 11, cursor: 'pointer', marginBottom: signInPrompt ? 6 : 20 }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2V11M8 2L4.5 5.5M8 2L11.5 5.5" stroke="#d4785a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 14H14" stroke="#d4785a" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#d4785a', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>Post a Clip</span>
      </div>
      {signInPrompt && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center', marginBottom: 20 }}>Sign in to upload clips.</div>}

      {/* Upload Modal */}
      {(showModal || modalClosing) && createPortal(
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={modalClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div className="modal-title">Post a Clip</div>
            <div style={{ padding: '0 16px 28px' }}>
              {/* YouTube */}
              {(() => {
                const active = uploadMode === 'youtube'
                const ic = active ? '#fff' : '#d4785a'
                return (
                  <>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid #d4785a', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', marginBottom: 10, background: active ? '#d4785a' : 'transparent' }}
                      onClick={() => { if (!uploading) setUploadMode(active ? null : 'youtube') }}
                    >
                      <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
                        <rect x="0.75" y="0.75" width="18.5" height="12.5" rx="3.25" stroke={ic} strokeWidth="1.5" />
                        <path d="M8 4L13.5 7L8 10V4Z" fill={ic} />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 700, color: ic, fontFamily: 'Barlow, sans-serif' }}>YouTube</span>
                    </div>
                    {active && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                        <input className="form-input" placeholder="https://youtube.com/watch?v=…" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} autoFocus style={{ fontSize: 16 }} />
                        <input className="form-input" placeholder="Add a title (optional)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} style={{ fontSize: 16 }} />
                        {linkUrl.trim() && (
                          <button onClick={handleLinkSubmit} disabled={uploading} style={{ width: '100%', padding: 9, borderRadius: 6, background: '#d4785a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', letterSpacing: 0.5, opacity: uploading ? 0.6 : 1 }}>
                            {uploading ? 'Adding…' : 'Add Clip'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Instagram */}
              {(() => {
                const active = uploadMode === 'instagram'
                const ic = active ? '#fff' : '#d4785a'
                return (
                  <>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid #d4785a', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', marginBottom: 10, background: active ? '#d4785a' : 'transparent' }}
                      onClick={() => { if (!uploading) setUploadMode(active ? null : 'instagram') }}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <rect x="1" y="1" width="16" height="16" rx="5" stroke={ic} strokeWidth="1.5" fill="none" />
                        <circle cx="9" cy="9" r="4" stroke={ic} strokeWidth="1.5" fill="none" />
                        <circle cx="13.5" cy="4.5" r="1" fill={ic} />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 700, color: ic, fontFamily: 'Barlow, sans-serif' }}>Instagram</span>
                    </div>
                    {active && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                        <input className="form-input" placeholder="https://instagram.com/p/…" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} autoFocus style={{ fontSize: 16 }} />
                        <input className="form-input" placeholder="Add a title (optional)" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} style={{ fontSize: 16 }} />
                        {linkUrl.trim() && (
                          <button onClick={handleLinkSubmit} disabled={uploading} style={{ width: '100%', padding: 9, borderRadius: 6, background: '#d4785a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', letterSpacing: 0.5, opacity: uploading ? 0.6 : 1 }}>
                            {uploading ? 'Adding…' : 'Add Clip'}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )
              })()}

              {/* Upload Photo */}
              {(() => {
                const active = !!selectedPhotoFile
                const ic = active ? '#fff' : '#d4785a'
                return (
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1.5px solid #d4785a', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', marginBottom: 10, background: active ? '#d4785a' : 'transparent' }}
                    onClick={() => { if (!uploading) photoFileRef.current?.click() }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="1" y="4" width="16" height="12" rx="2" stroke={ic} strokeWidth="1.5" />
                      <circle cx="9" cy="10" r="3" stroke={ic} strokeWidth="1.5" />
                      <path d="M6 4V3a1 1 0 011-1h4a1 1 0 011 1v1" stroke={ic} strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: ic, fontFamily: 'Barlow, sans-serif' }}>Upload Photo</span>
                  </div>
                )
              })()}
              <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) { setSelectedPhotoFile(f); setUploadError('') } }} />
              {selectedPhotoFile && (
                <div style={{ margin: '4px 0 8px', padding: '10px 12px', background: '#F5EEE6', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{selectedPhotoFile.name}</div>
                  {uploading ? (
                    <div>
                      <div style={{ height: 4, borderRadius: 2, background: '#E8DDD0', overflow: 'hidden', marginBottom: 5 }}>
                        <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#d4785a', borderRadius: 2, transition: 'width 0.35s' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#d4785a', fontWeight: 700 }}>Uploading… {uploadProgress}%</div>
                    </div>
                  ) : (
                    <button onClick={handlePhotoUpload} style={{ width: '100%', padding: 9, borderRadius: 6, background: '#d4785a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', letterSpacing: 0.5 }}>Upload Photo</button>
                  )}
                </div>
              )}

              {uploadError && <div style={{ fontSize: 11, color: '#c0453a', fontWeight: 700, marginTop: 8 }}>{uploadError}</div>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Video Lightbox ─────────────────────────────── */}
      {activeClip && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          onClick={closeLightbox}
          onTouchStart={e => {
            lbTouchStartY.current = e.touches[0].clientY
            lbTouchStartX.current = e.touches[0].clientX
          }}
          onTouchEnd={e => {
            if (lbTouchStartY.current === null) return
            const deltaY = e.changedTouches[0].clientY - lbTouchStartY.current
            const deltaX = e.changedTouches[0].clientX - lbTouchStartX.current
            lbTouchStartY.current = null
            lbTouchStartX.current = null
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
              deltaX < 0 ? goToClip(activeIndex + 1) : goToClip(activeIndex - 1)
            } else if (deltaY > 80 && Math.abs(deltaY) > Math.abs(deltaX)) {
              closeLightbox()
            }
          }}
        >
          {/* X close button */}
          <div
            onClick={closeLightbox}
            style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', right: 20, width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100000 }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <line x1="4" y1="4" x2="16" y2="16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <line x1="16" y1="4" x2="4" y2="16" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          {/* Delete button (own clips only) */}
          {user?.id === activeClip.user_id && (
            <div
              onClick={e => { e.stopPropagation(); setShowClipDeleteModal(true) }}
              style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 20, width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 100000 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 5H13M6 5V3H10V5M5 5V13H11V5H5Z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
          )}

          {/* Video player */}
          <div style={{ width: '100%', maxWidth: 560, padding: '0 10px', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
            {(() => {
              if (isImageUrl(activeClip.url)) {
                return (
                  <img src={activeClip.url} alt="" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block', objectFit: 'contain' }} />
                )
              }
              const embedUrl = getEmbedUrl(activeClip)
              if (embedUrl) {
                const isIg = extractInstagramId(activeClip.url) !== null
                return (
                  <iframe
                    src={embedUrl}
                    style={{ width: isIg ? 'min(100%, 400px)' : '100%', aspectRatio: isIg ? '4/5' : '16/9', border: 'none', borderRadius: 8, display: 'block', margin: '0 auto' }}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                  />
                )
              }
              return videoError ? (
                <div style={{ width: '100%', aspectRatio: '16/9', background: '#1a1a1a', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>Video failed to load</span>
                </div>
              ) : (
                <div style={{ position: 'relative', width: '100%' }} onClick={handleVideoTap}>
                  <video
                    ref={videoRef}
                    key={activeClip.url}
                    autoPlay
                    playsInline
                    webkit-playsinline="true"
                    preload="metadata"
                    style={{ width: '100%', maxHeight: '70vh', borderRadius: 8, display: 'block', background: '#000' }}
                    onError={() => setVideoError(true)}
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onEnded={handleVideoEnded}
                  >
                    <source src={activeClip.url} type="video/mp4" />
                  </video>
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: showVideoOverlay ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: 'none', borderRadius: 8,
                  }}>
                    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', border: '2px solid rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {videoPlaying ? (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <rect x="3" y="2" width="4" height="14" rx="1.5" fill="white" />
                          <rect x="11" y="2" width="4" height="14" rx="1.5" fill="white" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                          <path d="M5 2.5L15.5 9L5 15.5V2.5Z" fill="white" />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Admin moderation banner for pending clips */}
          {isAdmin && activeClip.moderation_status === 'pending' && (
            <div
              style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)', left: 16, right: 16, background: 'rgba(255,175,0,0.93)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10001 }}
              onClick={e => e.stopPropagation()}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2a1e14' }}>⚠️ Pending Review</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <div
                  onClick={async () => {
                    await supabase.from('spot_clips').update({ moderation_status: 'approved' }).eq('id', activeClip.id)
                    setClips(prev => prev.map(c => c.id === activeClip.id ? { ...c, moderation_status: 'approved' } : c))
                    setActiveClip(prev => ({ ...prev, moderation_status: 'approved' }))
                  }}
                  style={{ padding: '5px 11px', borderRadius: 4, background: 'rgba(40,180,80,0.9)', cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#fff' }}
                >APPROVE</div>
                <div
                  onClick={async () => {
                    await supabase.from('spot_clips').update({ moderation_status: 'rejected' }).eq('id', activeClip.id)
                    setClips(prev => prev.filter(c => c.id !== activeClip.id))
                    closeLightbox()
                  }}
                  style={{ padding: '5px 11px', borderRadius: 4, background: 'rgba(192,69,58,0.9)', cursor: 'pointer', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#fff' }}
                >REJECT</div>
              </div>
            </div>
          )}

          {/* Bottom info */}
          <div
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
            onClick={e => e.stopPropagation()}
          >
            {clips.length > 1 && (
              <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 8 }}>
                {activeIndex + 1} / {clips.length}
              </div>
            )}
            {activeClip.title && <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 5 }}>{activeClip.title}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
                @{activeClip.profile?.username || activeClip.profile?.first_name || 'Anonymous'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>·</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{relativeTime(activeClip.created_at)}</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Clip delete confirm modal */}
      {(showClipDeleteModal || clipDeleteModalClosing) && createPortal(
        <div className="modal-overlay" onClick={closeClipDeleteModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={clipDeleteModalClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Clip</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Delete this clip? This cannot be undone.</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleDeleteClip} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Delete</button>
              <button onClick={closeClipDeleteModal} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
