import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
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

function Avatar({ profile, size = 32 }) {
  const initial = (profile?.username || profile?.first_name || 'A')[0].toUpperCase()
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #EAD8C8' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#3D4454', border: '1px solid #2e3344', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>{initial}</span>
    </div>
  )
}

function StarRow({ value, onChange, size = 28 }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <div key={s} onClick={() => onChange(s)} style={{ cursor: 'pointer', padding: '2px 0' }}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            {s <= value
              ? <path d="M12 2L14.5 9.5H22.5L16.1 13.9L18.5 21.5L12 17.2L5.5 21.5L7.9 13.9L1.5 9.5H9.5Z" fill="#d4785a" />
              : <path d="M12 2L14.5 9.5H22.5L16.1 13.9L18.5 21.5L12 17.2L5.5 21.5L7.9 13.9L1.5 9.5H9.5Z" fill="none" stroke="#C8CAD4" strokeWidth="1.5" strokeLinejoin="round" />
            }
          </svg>
        </div>
      ))}
    </div>
  )
}

function StarMini({ rating }) {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width="12" height="12" viewBox="0 0 24 24" fill="none">
          {s <= Math.round(rating)
            ? <path d="M12 2L14.5 9.5H22.5L16.1 13.9L18.5 21.5L12 17.2L5.5 21.5L7.9 13.9L1.5 9.5H9.5Z" fill="#d4785a" />
            : <path d="M12 2L14.5 9.5H22.5L16.1 13.9L18.5 21.5L12 17.2L5.5 21.5L7.9 13.9L1.5 9.5H9.5Z" fill="none" stroke="#C8CAD4" strokeWidth="1.5" strokeLinejoin="round" />
          }
        </svg>
      ))}
    </div>
  )
}

export default function ReviewsSection({ spotId, user, sectionRef, onStatsChange }) {
  const [reviews, setReviews] = useState([])
  const [myRating, setMyRating] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [myReviewId, setMyReviewId] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteModalClosing, setDeleteModalClosing] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const closeDeleteModal = () => {
    setDeleteModalClosing(true)
    setTimeout(() => { setDeleteModalClosing(false); setShowDeleteModal(false); setPendingDeleteId(null) }, 180)
  }

  const loadReviews = useCallback(async () => {
    const { data } = await supabase
      .from('spot_reviews')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false })
    if (!data) return
    const profileMap = await fetchProfiles(data.map(r => r.user_id))
    const withProfiles = data.map(r => ({ ...r, profile: profileMap[r.user_id] || null }))
    setReviews(withProfiles)

    if (user?.id) {
      const own = withProfiles.find(r => r.user_id === user.id)
      if (own) { setMyReviewId(own.id); setMyRating(own.rating) }
      else { setMyReviewId(null) }
    }

    if (onStatsChange) {
      if (data.length > 0) {
        const avg = data.reduce((a, r) => a + r.rating, 0) / data.length
        onStatsChange(parseFloat(avg.toFixed(1)), data.length)
      } else {
        onStatsChange(null, 0)
      }
    }
  }, [spotId, user?.id, onStatsChange])

  useEffect(() => { loadReviews() }, [loadReviews])

  const handleSubmit = async () => {
    if (!myRating || submitting) return
    const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !cu) return
    setSubmitting(true)
    const profileMap = await fetchProfiles([cu.id])
    const { data, error } = await supabase
      .from('spot_reviews')
      .upsert({ spot_id: spotId, user_id: cu.id, rating: myRating, comment: null }, { onConflict: 'spot_id,user_id' })
      .select().single()
    setSubmitting(false)
    if (!error && data) {
      const withProfile = { ...data, profile: profileMap[cu.id] || null }
      setMyReviewId(data.id)
      setReviews(prev => [withProfile, ...prev.filter(r => r.user_id !== cu.id)])
      if (onStatsChange) {
        const all = [withProfile, ...reviews.filter(r => r.user_id !== cu.id)]
        const avg = all.reduce((a, r) => a + r.rating, 0) / all.length
        onStatsChange(parseFloat(avg.toFixed(1)), all.length)
      }
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    await supabase.from('spot_reviews').delete().eq('id', pendingDeleteId)
    const next = reviews.filter(r => r.id !== pendingDeleteId)
    setReviews(next)
    if (myReviewId === pendingDeleteId) { setMyReviewId(null); setMyRating(0) }
    if (onStatsChange) {
      if (next.length > 0) {
        const avg = next.reduce((a, r) => a + r.rating, 0) / next.length
        onStatsChange(parseFloat(avg.toFixed(1)), next.length)
      } else {
        onStatsChange(null, 0)
      }
    }
    closeDeleteModal()
  }

  return (
    <div ref={sectionRef}>
      <div className="divider" />
      <div className="section-label">Rate The Spot</div>

      {user ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 10 }}>
            <StarRow value={myRating} onChange={setMyRating} size={28} />
          </div>
          {myRating > 0 && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ width: '100%', padding: '10px', borderRadius: 6, background: '#d4785a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif', letterSpacing: 1, textTransform: 'uppercase', transition: 'background 0.15s' }}
            >
              {submitting ? 'Saving…' : myReviewId ? 'Update Rating' : 'Post Rating'}
            </button>
          )}
        </div>
      ) : null}

      {reviews.length === 0 ? null : (
        <div className="hide-scroll" style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 0 12px', margin: '0 -14px', paddingLeft: 14, paddingRight: 14 }}>
          {reviews.map(review => {
            const name = review.profile?.username || review.profile?.first_name || 'Anonymous'
            const isOwn = user?.id === review.user_id
            return (
              <div key={review.id} style={{ flexShrink: 0, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 160, maxWidth: 220 }}>
                <Avatar profile={review.profile} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <StarMini rating={review.rating} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#2a1e14', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Barlow, sans-serif' }}>@{name}</div>
                  <div style={{ fontSize: 9, color: '#b0a090', marginTop: 2, fontWeight: 600 }}>{relativeTime(review.created_at)}</div>
                </div>
                {isOwn && (
                  <span onClick={() => { setPendingDeleteId(review.id); setShowDeleteModal(true) }} style={{ fontSize: 13, color: '#C8CAD4', fontWeight: 700, cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start' }}>
                    ×
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(showDeleteModal || deleteModalClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteModalClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Rating</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Remove your rating? This cannot be undone.</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleDelete} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Delete</button>
              <button onClick={closeDeleteModal} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
