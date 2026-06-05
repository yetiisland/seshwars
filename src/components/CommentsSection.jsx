import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getProfiles } from '../utils/profileCache'

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

function Avatar({ profile, size = 32 }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #EAD8C8' }}
      />
    )
  }
  const initial = (profile?.username || profile?.first_name || '?')[0].toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#3D4454',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, border: '1px solid #2e3344',
    }}>
      <span style={{ fontSize: size * 0.38, fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>{initial}</span>
    </div>
  )
}

export default function CommentsSection({ spotId, user, onGoProfile }) {
  const [comments, setComments] = useState([])
  const [profiles, setProfiles] = useState({})
  const [myProfile, setMyProfile] = useState(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState(null)
  const channelRef = useRef(null)

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('spot_comments')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: true })
    if (error || !data) return
    setComments(data)
    const userIds = [...new Set(data.map(c => c.user_id).filter(Boolean))]
    if (userIds.length === 0) return
    const profileMap = await getProfiles(userIds)
    setProfiles(profileMap)
  }, [spotId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('profiles')
      .select('id, username, first_name, avatar_url')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setMyProfile(data) })
  }, [user?.id])

  useEffect(() => {
    channelRef.current = supabase
      .channel(`spot-comments-${spotId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'spot_comments', filter: `spot_id=eq.${spotId}` }, payload => {
        const newComment = payload.new
        setComments(prev => {
          if (prev.some(c => c.id === newComment.id)) return prev
          return [...prev, newComment]
        })
        supabase
          .from('profiles')
          .select('id, username, first_name, avatar_url')
          .eq('id', newComment.user_id)
          .single()
          .then(({ data }) => {
            if (data) setProfiles(prev => ({ ...prev, [data.id]: data }))
          })
      })
      .subscribe()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [spotId])

  const handleSubmit = async () => {
    const content = text.trim()
    if (!content || !user || submitting) return
    setSubmitting(true)
    const { data: { user: currentUser }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !currentUser) { setSubmitting(false); return }
    const { data, error } = await supabase
      .from('spot_comments')
      .insert({ spot_id: spotId, user_id: currentUser.id, content })
      .select()
      .single()
    setSubmitting(false)
    if (!error && data) {
      setText('')
      setComments(prev => prev.some(c => c.id === data.id) ? prev : [...prev, data])
      if (myProfile) setProfiles(prev => ({ ...prev, [currentUser.id]: myProfile }))
    }
  }

  const handleDelete = async (id) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id)
      return
    }
    await supabase.from('spot_comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
    setDeleteConfirmId(null)
  }

  return (
    <div>
      <div className="divider" />
      <div className="section-label">Comments ({comments.length})</div>

      {/* Input row */}
      {user ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              style={{
                width: '100%', resize: 'none', border: '1px solid #E8DDD0', borderRadius: 6,
                padding: '8px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif',
                color: 'var(--text-primary)', background: '#FAF5EE', outline: 'none',
                lineHeight: 1.5, boxSizing: 'border-box',
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
            />
            {text.trim().length > 0 && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  alignSelf: 'flex-end', padding: '6px 14px', borderRadius: 6,
                  background: '#d4785a', color: '#fff', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, fontFamily: 'Barlow, sans-serif',
                  letterSpacing: 0.5, opacity: submitting ? 0.6 : 1,
                }}
              >
                Post
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => onGoProfile?.()}
          style={{ fontSize: 11, color: '#d4785a', fontWeight: 700, marginBottom: 14, cursor: onGoProfile ? 'pointer' : 'default', textDecoration: onGoProfile ? 'underline' : 'none' }}
        >
          Sign in to leave a comment.
        </div>
      )}

      {/* Comment list */}
      {comments.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 14 }}>No comments yet. Be the first!</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
          {comments.map(comment => {
            const profile = profiles[comment.user_id]
            const isOwn = user?.id === comment.user_id
            const confirming = deleteConfirmId === comment.id
            return (
              <div key={comment.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Avatar profile={profile} size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                      @{profile?.username || profile?.first_name || 'Anonymous'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                      {relativeTime(comment.created_at)}
                    </span>
                    {isOwn && (
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
                        {confirming && (
                          <span
                            onClick={() => setDeleteConfirmId(null)}
                            style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', padding: '6px 8px' }}
                          >
                            Cancel
                          </span>
                        )}
                        <div
                          onClick={() => handleDelete(comment.id)}
                          style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6, background: confirming ? 'rgba(192,69,58,0.1)' : 'transparent' }}
                        >
                          {confirming ? (
                            <span style={{ fontSize: 10, color: '#c0453a', fontWeight: 700, padding: '0 4px' }}>Delete</span>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <line x1="2" y1="2" x2="12" y2="12" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                              <line x1="12" y1="2" x2="2" y2="12" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{comment.content}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
