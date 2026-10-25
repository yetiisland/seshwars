import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { getProfiles } from '../utils/profileCache'
import InitialsAvatar from './InitialsAvatar'
import AddFriendButton from './AddFriendButton'
import { LAYERS } from '../lib/layers'
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion'

// Mention chip row animation timings — all in milliseconds unless noted.
const MENTION_ROW_EXPAND_MS = 180
const MENTION_ROW_COLLAPSE_MS = 150
const MENTION_CHIP_ENTER_MS = 180
const MENTION_CHIP_ENTER_STAGGER_MS = 30
const MENTION_CHIP_ENTER_STAGGER_CAP = 6
const MENTION_CHIPS_SWAP_FADE_MS = 100
const MENTION_CHIPS_HIDE_FADE_MS = 120
// How long the longest-staggered chip's own enter transition runs for —
// once past this, chips are settled/idle and stop carrying an opacity/
// transform transition at all (only the unrelated press-scale remains,
// via the .mention-chip CSS class).
const MENTION_CHIP_ENTER_SETTLE_MS = MENTION_CHIP_ENTER_MS + (MENTION_CHIP_ENTER_STAGGER_CAP - 1) * MENTION_CHIP_ENTER_STAGGER_MS

function relativeTime(ts) {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

// Small salmon text-link — copied verbatim from the "Sign in to leave a
// comment" link style further down this same file.
const inlineLinkStyle = { fontSize: 11, color: '#d4785a', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }

// "View N more replies" — copied verbatim from the search-results "Load
// More" control in FriendsView.jsx.
const viewMoreStyle = { padding: '8px 0 0', fontSize: 10, fontWeight: 700, color: '#d4785a', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }

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
  const [submitError, setSubmitError] = useState('')
  const [replyingTo, setReplyingTo] = useState(null) // { id, username } | null
  const [expandedThreads, setExpandedThreads] = useState(new Set())
  const [mentionQuery, setMentionQuery] = useState(null) // null = dropdown closed
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionResults, setMentionResults] = useState([])
  const [mentionProfiles, setMentionProfiles] = useState({}) // username -> profile | null
  const [viewingProfile, setViewingProfile] = useState(null)
  const [viewingProfileFriendship, setViewingProfileFriendship] = useState(null)
  // Mention chip row animation state — see the orchestration effect below.
  const [mentionRowMounted, setMentionRowMounted] = useState(false)
  const [mentionRowExpanded, setMentionRowExpanded] = useState(false)
  const [mentionRowClosing, setMentionRowClosing] = useState(false)
  const [mentionChipsVisible, setMentionChipsVisible] = useState(false)
  const [mentionChipsEntering, setMentionChipsEntering] = useState(false)
  const [displayedMentionResults, setDisplayedMentionResults] = useState([])
  const mentionAnimTimerRef = useRef(null)
  const mentionEnterTimerRef = useRef(null)
  const prefersReducedMotion = usePrefersReducedMotion()
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
  // search but a 10-result typeahead instead of a paginated list. Only
  // fires once there's at least one character after the @.
  useEffect(() => {
    if (!mentionQuery) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_profiles', { q: mentionQuery, p_limit: 10, p_offset: 0 })
      setMentionResults(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [mentionQuery])

  // Mention chip row open/close + chip enter/exit animation state machine,
  // driven by (mentionQuery, mentionResults) rather than rendered directly —
  // so the row can stay mounted through its own hide sequence (chips fade,
  // then the row's height collapses, then it actually unmounts) instead of
  // vanishing the instant mentionQuery/mentionResults goes empty.
  useEffect(() => {
    const shouldShow = Boolean(mentionQuery) && mentionResults.length > 0
    clearTimeout(mentionAnimTimerRef.current)
    clearTimeout(mentionEnterTimerRef.current)

    if (!shouldShow) {
      if (!mentionRowMounted) return
      if (prefersReducedMotion) {
        setMentionRowMounted(false)
        setMentionRowExpanded(false)
        setMentionChipsVisible(false)
        setMentionRowClosing(false)
        setDisplayedMentionResults([])
        return
      }
      setMentionRowClosing(true)
      setMentionChipsVisible(false)
      mentionAnimTimerRef.current = setTimeout(() => {
        setMentionRowExpanded(false)
        mentionAnimTimerRef.current = setTimeout(() => {
          setMentionRowMounted(false)
          setMentionRowClosing(false)
          setDisplayedMentionResults([])
        }, MENTION_ROW_COLLAPSE_MS)
      }, MENTION_CHIPS_HIDE_FADE_MS)
      return
    }

    setMentionRowClosing(false)

    if (prefersReducedMotion) {
      setDisplayedMentionResults(mentionResults)
      setMentionRowMounted(true)
      setMentionRowExpanded(true)
      setMentionChipsVisible(true)
      setMentionChipsEntering(false)
      return
    }

    if (!mentionRowMounted) {
      // Fresh open — expand the row and stagger the chips in together.
      setDisplayedMentionResults(mentionResults)
      setMentionRowMounted(true)
      setMentionRowExpanded(false)
      setMentionChipsVisible(false)
      requestAnimationFrame(() => {
        setMentionRowExpanded(true)
        setMentionChipsVisible(true)
        setMentionChipsEntering(true)
      })
      mentionEnterTimerRef.current = setTimeout(() => setMentionChipsEntering(false), MENTION_CHIP_ENTER_SETTLE_MS)
      return
    }

    // Already open — results changed while typing. Keep showing (and fade
    // out) whatever's currently displayed, then swap in the new results.
    // The row's own height never replays here.
    setMentionRowExpanded(true)
    setMentionChipsVisible(false)
    mentionAnimTimerRef.current = setTimeout(() => {
      setDisplayedMentionResults(mentionResults)
      setMentionChipsVisible(true)
      setMentionChipsEntering(true)
      mentionEnterTimerRef.current = setTimeout(() => setMentionChipsEntering(false), MENTION_CHIP_ENTER_SETTLE_MS)
    }, MENTION_CHIPS_SWAP_FADE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionQuery, mentionResults])

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

  // Shared by both "Reply" entry points — a top-level comment, or a reply
  // to a reply. Threads stay flat (one level visually): replying to a
  // reply still targets the top-level comment's id as parent_id, with the
  // reply-being-answered's @username prefilled so it's clear who it's for.
  const startReply = (topLevelId, username) => {
    setReplyingTo({ id: topLevelId, username })
    const prefill = `@${username} `
    setText(prefill)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(prefill.length, prefill.length)
    })
  }

  const handleReplyClick = (comment) => {
    const p = profiles[comment.user_id]
    const username = p?.username || p?.first_name || 'user'
    startReply(comment.id, username)
  }

  const handleReplyToReplyClick = (topLevelId, reply) => {
    const p = profiles[reply.user_id]
    const username = p?.username || p?.first_name || 'user'
    startReply(topLevelId, username)
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
    setSubmitError('')
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
    } else {
      console.error('[CommentsSection] handleSubmit insert failed:', error)
      setSubmitError('Could not post your comment. Try again.')
    }
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    const deleteId = pendingDeleteId
    closeDeleteModal()
    const { data, error } = await supabase.from('spot_comments').delete().eq('id', deleteId).select()
    if (error || !data || data.length === 0) {
      console.error('[CommentsSection] handleDelete failed:', error)
      setDeleteError('Could not delete this comment. Try again.')
      return
    }
    setDeleteError('')
    setComments(prev => prev.filter(c => c.id !== deleteId))
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
      {deleteError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 10 }}>{deleteError}</div>}

      {/* Input row — exactly one rounded box (the textarea itself carries
          the white fill + border now); the wrapper below is layout-only */}
      {user ? (
        <div style={{ marginBottom: 16 }}>
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
                padding: '8px 10px', fontSize: 16, fontFamily: 'Barlow, sans-serif',
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
            {mentionRowMounted && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: mentionRowExpanded ? '1fr' : '0fr',
                  transition: prefersReducedMotion ? 'none' : `grid-template-rows ${mentionRowExpanded ? MENTION_ROW_EXPAND_MS : MENTION_ROW_COLLAPSE_MS}ms ease-out`,
                }}
              >
                <div style={{ minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ padding: 8 }}>
                    <div className="hide-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto', flexWrap: 'nowrap' }}>
                      {displayedMentionResults.map((p, idx) => {
                        const delayMs = Math.min(idx, MENTION_CHIP_ENTER_STAGGER_CAP - 1) * MENTION_CHIP_ENTER_STAGGER_MS
                        const exitMs = mentionRowClosing ? MENTION_CHIPS_HIDE_FADE_MS : MENTION_CHIPS_SWAP_FADE_MS
                        const chipTransition = prefersReducedMotion
                          ? 'none'
                          : !mentionChipsVisible
                            ? `opacity ${exitMs}ms ease-out, transform ${exitMs}ms ease-out`
                            : mentionChipsEntering
                              ? `opacity ${MENTION_CHIP_ENTER_MS}ms ease-out ${delayMs}ms, transform ${MENTION_CHIP_ENTER_MS}ms ease-out ${delayMs}ms`
                              : 'none'
                        return (
                          <div
                            key={p.id}
                            style={{
                              flexShrink: 0,
                              opacity: mentionChipsVisible ? 1 : 0,
                              transform: `translateY(${mentionChipsVisible ? 0 : 6}px)`,
                              transition: chipTransition,
                            }}
                          >
                            <div
                              className="mention-chip"
                              onPointerDown={e => e.preventDefault()}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => handleSelectMention(p)}
                              style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 6, background: '#FFFFFF', border: '1px solid #EAD8C8', padding: '3px 9px 3px 3px', cursor: 'pointer' }}
                            >
                              <InitialsAvatar profile={p} size={18} ring="0 0 0 1px #EAD8C8" />
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#2a1e14', whiteSpace: 'nowrap' }}>@{p.username}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {text.trim().length > 0 && (
              <button
                className="btn-salmon"
                onClick={handleSubmit}
                disabled={submitting}
                style={{ opacity: submitting ? 0.6 : 1 }}
              >
                Post Comment
              </button>
            )}
          </div>
          {submitError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{submitError}</div>}
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
        <>
          <div className="section-label">Replies ({topLevelComments.length})</div>
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
                  <InitialsAvatar profile={profile} size={28} ring="0 0 0 1px #EAD8C8" />
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
                            onClick={() => { setDeleteError(''); setPendingDeleteId(comment.id); setShowDeleteModal(true) }}
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
                    {visibleReplies.map(reply => {
                      const replyProfile = profiles[reply.user_id]
                      const isOwnReply = user?.id === reply.user_id
                      return (
                        <div key={reply.id}>
                          {/* Horizontal divider before every reply — separates
                              it from whatever precedes it, the parent comment
                              for the first one, the previous reply for the rest. */}
                          <div style={{ height: 1, background: '#E8DDD0', margin: '10px 0' }} />
                          <div
                            ref={el => { commentRefs.current[reply.id] = el }}
                            style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
                          >
                            <InitialsAvatar profile={replyProfile} size={24} ring="0 0 0 1px #EAD8C8" />
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
                                      onClick={() => { setDeleteError(''); setPendingDeleteId(reply.id); setShowDeleteModal(true) }}
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
                              {user && (
                                <div onClick={() => handleReplyToReplyClick(comment.id, reply)} style={{ ...inlineLinkStyle, fontSize: 10, marginTop: 4, display: 'inline-block' }}>
                                  Reply
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                    {hiddenCount > 0 && (
                      <>
                        <div style={{ height: 1, background: '#E8DDD0', margin: '10px 0' }} />
                        <div onClick={() => toggleExpand(comment.id)} style={viewMoreStyle}>
                          View more replies ({hiddenCount})
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
        </>
      )}
      {/* Extra space at the very end of the comments section, after the
          last comment and its replies — moved here from the composer's
          own bottom margin above. */}
      {topLevelComments.length > 0 && <div style={{ height: 64 }} />}

      {(showDeleteModal || deleteModalClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteModal} style={{ zIndex: LAYERS.CONFIRM }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteModalClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Comment</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Delete this comment? This cannot be undone.</div>
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
              <InitialsAvatar profile={viewingProfile} size={48} ring="0 0 0 1px #EAD8C8" />
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
