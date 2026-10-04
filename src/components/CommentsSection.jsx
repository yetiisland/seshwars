import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { getProfiles } from '../utils/profileCache'
import InitialsAvatar from './InitialsAvatar'
import AddFriendButton from './AddFriendButton'

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

function Avatar({ profile, size = 32 }) {
  const [imgError, setImgError] = useState(false)
  if (profile?.avatar_url && !imgError) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #EAD8C8' }}
        onError={() => setImgError(true)}
      />
    )
  }
  return <InitialsAvatar profile={profile} size={size} />
}

// Small salmon text-link — copied verbatim from the "Sign in to leave a
// comment" link style further down this same file.
const inlineLinkStyle = { fontSize: 11, color: '#d4785a', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }

// "View N more replies" — copied verbatim from the search-results "Load
// More" control in FriendsView.jsx.
const viewMoreStyle = { padding: '8px 0 0', fontSize: 10, fontWeight: 700, color: '#d4785a', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }

// Inline suggestion dropdown — copied verbatim from the geocoder address
// dropdown in AddSpot.jsx.
const mentionDropdownStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#FFFFFF', border: '1px solid #C8CAD4', borderRadius: 4, marginTop: 2, overflow: 'hidden' }

export default function CommentsSection({ spotId, user, onGoProfile, scrollToCommentId }) {
  const [comments, setComments] = useState([])
  const [profiles, setProfiles] = useState({})
  const [myProfile, setMyProfile] = useState(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteModalClosing, setDeleteModalClosing] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [replyingTo, setReplyingTo] = useState(null) // { id, username } | null
  const [expandedThreads, setExpandedThreads] = useState(new Set())
  const [mentionQuery, setMentionQuery] = useState(null) // null = dropdown closed
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionResults, setMentionResults] = useState([])
  const [mentionProfiles, setMentionProfiles] = useState({}) // username -> profile | null
  const [viewingProfile, setViewingProfile] = useState(null)
  const [viewingProfileFriendship, setViewingProfileFriendship] = useState(null)
  const channelRef = useRef(null)
  const textareaRef = useRef(null)
  const commentRefs = useRef({})
  const hasScrolledRef = useRef(false)
  const mentionBlurTimer = useRef(null)

  const closeDeleteModal = () => {
    setDeleteModalClosing(true)
    setDeleteError('')
    setTimeout(() => { setDeleteModalClosing(false); setShowDeleteModal(false); setPendingDeleteId(null) }, 180)
  }

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

  // Reset per-spot UI state when navigating between spots (SpotPage can
  // reuse this component instance across a param-only route change).
  useEffect(() => {
    setExpandedThreads(new Set())
    setMentionProfiles({})
    setReplyingTo(null)
    setText('')
    hasScrolledRef.current = false
  }, [spotId])

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

  // Resolve every @username token across all loaded comments to a real
  // profile (id + avatar), so rendering can tell a real mention from
  // unmatched @text. Additive only — mentionProfiles isn't a dependency
  // here on purpose, this just fills in whatever's missing as comments load.
  useEffect(() => {
    const tokens = new Set()
    for (const c of comments) {
      const matches = (c.content || '').match(/@(\w+)/g) || []
      for (const m of matches) tokens.add(m.slice(1))
    }
    const unresolved = [...tokens].filter(u => !(u in mentionProfiles))
    if (unresolved.length === 0) return
    supabase.from('profiles').select('id, username, avatar_url').in('username', unresolved)
      .then(({ data }) => {
        const found = {}
        for (const u of unresolved) found[u] = null
        for (const p of data || []) found[p.username] = p
        setMentionProfiles(prev => ({ ...prev, ...found }))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments])

  // @mention suggestion search — debounced, same RPC/shape as the Friends
  // search but a 5-result typeahead instead of a paginated list.
  useEffect(() => {
    if (mentionQuery === null) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_profiles', { q: mentionQuery, p_limit: 5, p_offset: 0 })
      setMentionResults(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [mentionQuery])

  // Scroll to (and auto-expand, if it's a collapsed reply) the comment a
  // notification tap targeted, once it's present in the loaded list.
  useEffect(() => {
    if (!scrollToCommentId || hasScrolledRef.current) return
    const target = comments.find(c => c.id === scrollToCommentId)
    if (!target) return
    hasScrolledRef.current = true
    if (target.parent_id) {
      setExpandedThreads(prev => new Set(prev).add(target.parent_id))
    }
    requestAnimationFrame(() => {
      commentRefs.current[scrollToCommentId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [scrollToCommentId, comments])

  const handleTextChange = (e) => {
    const val = e.target.value
    const cursorPos = e.target.selectionStart
    setText(val)
    const upToCursor = val.slice(0, cursorPos)
    const atIndex = upToCursor.lastIndexOf('@')
    if (atIndex === -1 || /\s/.test(upToCursor.slice(atIndex + 1))) {
      setMentionQuery(null)
      return
    }
    setMentionStart(atIndex)
    setMentionQuery(upToCursor.slice(atIndex + 1))
  }

  const handleSelectMention = (profile) => {
    const cursorPos = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, mentionStart)
    const after = text.slice(cursorPos)
    const newText = `${before}@${profile.username} ${after}`
    setText(newText)
    setMentionQuery(null)
    setMentionResults([])
    requestAnimationFrame(() => {
      const pos = before.length + profile.username.length + 2
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  const handleReplyClick = (comment) => {
    const p = profiles[comment.user_id]
    const username = p?.username || p?.first_name || 'user'
    setReplyingTo({ id: comment.id, username })
    const prefill = `@${username} `
    setText(prefill)
    requestAnimationFrame(() => {
      textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(prefill.length, prefill.length)
    })
  }

  const toggleExpand = (commentId) => {
    setExpandedThreads(prev => {
      const next = new Set(prev)
      next.add(commentId)
      return next
    })
  }

  const openProfileSheet = (profile) => {
    setViewingProfile(profile)
    setViewingProfileFriendship(null)
    if (!user?.id || user.id === profile.id) return
    supabase
      .from('friendships')
      .select('id, status, requester_id')
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${user.id})`)
      .maybeSingle()
      .then(({ data }) => {
        setViewingProfileFriendship({
          status: data?.status ?? null,
          isRequester: data ? data.requester_id === user.id : false,
          friendshipId: data?.id ?? null,
        })
      })
  }

  // Splits comment text on @word tokens; a token only renders as a tappable
  // salmon/bold mention if it resolved to a real profile in mentionProfiles.
  // Unmatched @text renders as plain text, untouched.
  const renderContent = (content) => {
    const parts = content.split(/(@\w+)/g)
    return parts.map((part, i) => {
      if (part[0] === '@') {
        const p = mentionProfiles[part.slice(1)]
        if (p) {
          return (
            <span key={i} onClick={() => openProfileSheet(p)} style={{ color: '#d4785a', fontWeight: 700, cursor: 'pointer' }}>
              {part}
            </span>
          )
        }
      }
      return part
    })
  }

  const handleSubmit = async () => {
    const content = text.trim()
    if (!content || !user || submitting) return
    setSubmitting(true)
    const { data: { user: currentUser }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !currentUser) { setSubmitting(false); return }
    const { data, error } = await supabase
      .from('spot_comments')
      .insert({ spot_id: spotId, user_id: currentUser.id, content, parent_id: replyingTo?.id ?? null })
      .select()
      .single()
    setSubmitting(false)
    if (!error && data) {
      setText('')
      setReplyingTo(null)
      setComments(prev => prev.some(c => c.id === data.id) ? prev : [...prev, data])
      if (myProfile) setProfiles(prev => ({ ...prev, [currentUser.id]: myProfile }))
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    setDeleteError('')
    const { data, error } = await supabase.from('spot_comments').delete().eq('id', pendingDeleteId).select()
    if (error || !data || data.length === 0) {
      console.error('[CommentsSection] handleDelete failed:', error)
      setDeleteError('Could not delete this comment. Try again.')
      return
    }
    setComments(prev => prev.filter(c => c.id !== pendingDeleteId))
    closeDeleteModal()
  }

  const topLevelComments = comments.filter(c => !c.parent_id)
  const repliesByParent = {}
  for (const c of comments) {
    if (c.parent_id) {
      if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = []
      repliesByParent[c.parent_id].push(c)
    }
  }

  return (
    <div>
      <div className="divider" />
      <div className="section-label">Comments ({comments.length})</div>

      {/* Input row — exactly one rounded box (the textarea itself carries
          the white fill + border now); the wrapper below is layout-only */}
      {user ? (
        <div style={{ marginBottom: 24 }}>
          {replyingTo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
              Replying to @{replyingTo.username}
              <span onClick={() => setReplyingTo(null)} style={{ cursor: 'pointer', color: '#d4785a', fontSize: 12 }}>✕</span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              placeholder="Add a comment…"
              rows={2}
              style={{
                width: '100%', resize: 'none', border: '1px solid #EAD8C8', borderRadius: 6,
                padding: '8px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif',
                color: 'var(--text-primary)', background: '#FFFFFF', outline: 'none',
                lineHeight: 1.5, boxSizing: 'border-box',
              }}
              onBlur={() => { mentionBlurTimer.current = setTimeout(() => setMentionQuery(null), 150) }}
              onFocus={() => clearTimeout(mentionBlurTimer.current)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (mentionQuery !== null) return
                  handleSubmit()
                }
              }}
            />
            {mentionQuery !== null && mentionResults.length > 0 && (
              <div style={mentionDropdownStyle}>
                {mentionResults.map(p => (
                  <div
                    key={p.id}
                    onMouseDown={() => handleSelectMention(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #ECEDF2' }}
                  >
                    <Avatar profile={p} size={22} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>@{p.username}</span>
                  </div>
                ))}
              </div>
            )}
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
      {topLevelComments.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
          {topLevelComments.map(comment => {
            const profile = profiles[comment.user_id]
            const isOwn = user?.id === comment.user_id
            const replies = repliesByParent[comment.id] || []
            const expanded = expandedThreads.has(comment.id)
            const visibleReplies = expanded ? replies : replies.slice(0, 2)
            const hiddenCount = replies.length - visibleReplies.length
            return (
              <div
                key={comment.id}
                ref={el => { commentRefs.current[comment.id] = el }}
                style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: 10 }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Avatar profile={profile} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                        @{profile?.username || profile?.first_name || 'Anonymous'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                        {relativeTime(comment.created_at)}
                      </span>
                      {isOwn && (
                        <div style={{ marginLeft: 'auto' }}>
                          <div
                            onClick={() => { setPendingDeleteId(comment.id); setShowDeleteModal(true) }}
                            style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <line x1="2" y1="2" x2="12" y2="12" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                              <line x1="12" y1="2" x2="2" y2="12" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{renderContent(comment.content)}</div>
                    {user && (
                      <div onClick={() => handleReplyClick(comment)} style={{ ...inlineLinkStyle, fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                        Reply
                      </div>
                    )}
                  </div>
                </div>

                {replies.length > 0 && (
                  <>
                    {/* Horizontal divider separates replies from the parent —
                        no left indent, no vertical rule, per spec */}
                    <div style={{ height: 1, background: '#E8DDD0', margin: '10px 0' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {visibleReplies.map(reply => {
                        const replyProfile = profiles[reply.user_id]
                        const isOwnReply = user?.id === reply.user_id
                        return (
                          <div
                            key={reply.id}
                            ref={el => { commentRefs.current[reply.id] = el }}
                            style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
                          >
                            <Avatar profile={replyProfile} size={24} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                                  @{replyProfile?.username || replyProfile?.first_name || 'Anonymous'}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                                  {relativeTime(reply.created_at)}
                                </span>
                                {isOwnReply && (
                                  <div style={{ marginLeft: 'auto' }}>
                                    <div
                                      onClick={() => { setPendingDeleteId(reply.id); setShowDeleteModal(true) }}
                                      style={{ minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 6 }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                        <line x1="2" y1="2" x2="12" y2="12" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                                        <line x1="12" y1="2" x2="2" y2="12" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{renderContent(reply.content)}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {hiddenCount > 0 && (
                      <div onClick={() => toggleExpand(comment.id)} style={viewMoreStyle}>
                        View {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
                      </div>
                    )}
                  </>
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
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Comment</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Delete this comment? This cannot be undone.</div>
            {deleteError && <div style={{ padding: '0 16px 12px', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{deleteError}</div>}
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleDelete} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Delete</button>
              <button onClick={closeDeleteModal} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Mini profile preview — opened by tapping a resolved @mention.
          No standalone "view any user's profile" screen exists elsewhere
          in the app, so this reuses the same avatar/row/AddFriendButton
          pieces FriendsView's search results already use, in a bottom
          sheet, rather than inventing a new full profile page. */}
      {viewingProfile && createPortal(
        <div className="modal-overlay" onClick={() => setViewingProfile(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px 24px' }}>
              <Avatar profile={viewingProfile} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{viewingProfile.username}
                </div>
              </div>
              {user && user.id !== viewingProfile.id && viewingProfileFriendship && (
                <AddFriendButton
                  targetUserId={viewingProfile.id}
                  friendshipStatus={viewingProfileFriendship.status}
                  isRequester={viewingProfileFriendship.isRequester}
                  friendshipId={viewingProfileFriendship.friendshipId}
                  onChange={(status, row) => setViewingProfileFriendship(prev => ({ ...prev, status, friendshipId: row?.id ?? prev.friendshipId }))}
                />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
