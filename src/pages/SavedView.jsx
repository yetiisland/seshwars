import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { siteOrigin } from '../lib/siteUrl'
import SpotCard from '../components/SpotCard'
import Navbar from '../components/Navbar'
import { ArrowIcon, ShareIcon, PlusIcon, CloseIcon, LeaveIcon, IconBox } from '../components/Icons'
import InitialsAvatar from '../components/InitialsAvatar'
import MapView from './MapView'

// Inline suggestion dropdown — copied verbatim from the geocoder address
// dropdown in AddSpot.jsx (same pattern CommentsSection.jsx's @mention
// dropdown already reuses).
const memberDropdownStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#FFFFFF', border: '1px solid #C8CAD4', borderRadius: 4, marginTop: 2, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }

function MemberAvatar({ profile, size = 32, border }) {
  const style = { width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, ...(border ? { border } : {}) }
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" style={{ ...style, objectFit: 'cover' }} />
  }
  return (
    <div style={style}>
      <InitialsAvatar profile={profile} size={size} />
    </div>
  )
}

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

// Module-level state: survives App remount so back-nav restores the open collection
let _savedOpenCollection = null
let _savedCollectionScrollTop = 0

// Module-level list cache: prevents refetch on every tab switch
let _cachedLists = []
let _cachedListSpotIds = {}
let _listsUserId = null
// Bumped by fetchLists() (start) and by any local write to _cachedLists
// (create/delete). fetchLists() checks this after its awaits and bails out
// if it's changed — otherwise a fetch that was already in flight when a list
// was created would resolve afterward with a pre-create snapshot and silently
// overwrite the just-created list from both the cache and component state,
// which is why it didn't show up until a hard refresh re-fetched from scratch.
let _listsFetchSeq = 0

export function invalidateListsCache() {
  _listsUserId = null
}

// Always-on, module-scope listener — not tied to SavedView's own mount
// state. SaveToListModal (and anything else that writes to a list) can be
// opened from any tab, so the save/remove often happens while SavedView
// itself is unmounted and has no listener to hear the event; without this,
// _listsUserId never gets invalidated, and the next mount's "already fresh
// for this user" check (below) skips refetching, serving the stale cache
// until a hard reload resets the module state from scratch.
if (typeof window !== 'undefined') {
  window.addEventListener('seshwars:lists-changed', invalidateListsCache)
}

// 20 bytes of crypto.getRandomValues() output, one char each — well above the
// RPCs' 16-character minimum, with margin.
function generateShareToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const arr = new Uint8Array(20)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(n => chars[n % chars.length]).join('')
}

function CollectionView({ title, isList, isFavorites, isOwner = true, userId, listId, shareToken, onTokenGenerated, spots, saved, onSavePress, onSpotClick, onBack, onListDeleted, initialScrollTop, onSaveScrollTop }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const viewToggleTrackRef = useRef(null)
  const viewToggleThumbRef = useRef(null)
  const viewToggleSegmentRefs = useRef({})
  const positionViewToggleThumb = () => {
    const track = viewToggleTrackRef.current
    const thumb = viewToggleThumbRef.current
    const activeEl = viewToggleSegmentRefs.current[viewMode]
    if (!track || !thumb || !activeEl) return
    const trackRect = track.getBoundingClientRect()
    const elRect = activeEl.getBoundingClientRect()
    thumb.style.width = `${elRect.width}px`
    thumb.style.transform = `translateX(${elRect.left - trackRect.left}px)`
  }
  useLayoutEffect(() => {
    positionViewToggleThumb()
  })
  useEffect(() => {
    window.addEventListener('resize', positionViewToggleThumb)
    return () => window.removeEventListener('resize', positionViewToggleThumb)
  }, [viewMode])
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareError, setShareError] = useState('')
  const scrollRef = useRef(null)
  const scrollRestoredRef = useRef(false)

  // ── List members (Section A/B/C) ──────────────────────────────
  const [members, setMembers] = useState([])
  const [memberQuery, setMemberQuery] = useState('')
  const [memberSuggestions, setMemberSuggestions] = useState([])
  const [memberSearchResults, setMemberSearchResults] = useState([])
  const [memberInputFocused, setMemberInputFocused] = useState(false)
  const [showMembersSheet, setShowMembersSheet] = useState(false)
  const [pendingRemoveMember, setPendingRemoveMember] = useState(null) // { id, username }
  const [removeMemberError, setRemoveMemberError] = useState('')
  const [addMemberError, setAddMemberError] = useState('')
  const memberInputRef = useRef(null)
  // Guards against refetching suggestions on every refocus of the add-
  // skaters input — set once the first fetch (for this list) lands, cleared
  // only by a fresh mount (i.e. switching lists, since CollectionView is
  // keyed by listId).
  const suggestionsFetchedRef = useRef(false)

  const fetchMembers = async () => {
    if (!listId) return
    const { data } = await supabase.rpc('get_list_members', { p_list_id: listId })
    setMembers(data || [])
  }

  const fetchMemberSuggestions = async () => {
    if (!listId) return
    const { data } = await supabase.rpc('suggest_friends_for_list', { p_list_id: listId })
    setMemberSuggestions(data || [])
  }

  useEffect(() => {
    if (!isList || !listId || !isOwner) return
    fetchMembers()
  }, [isList, listId, isOwner])

  // Suggestions are only useful once the owner opens the add-skaters input,
  // so fetch them on first focus instead of unconditionally on mount.
  const handleMemberInputFocus = () => {
    setMemberInputFocused(true)
    if (!isOwner || suggestionsFetchedRef.current) return
    suggestionsFetchedRef.current = true
    fetchMemberSuggestions()
  }

  // Switches from suggest_friends_for_list to search_profiles once the
  // owner starts typing — same debounce as FriendsView's own search.
  useEffect(() => {
    if (!isOwner) return
    const q = memberQuery.trim()
    if (!q) return
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_profiles', { q, p_limit: 10, p_offset: 0 })
      setMemberSearchResults(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [memberQuery, isOwner])

  const handleAddMember = async (profile) => {
    setAddMemberError('')
    const { data, error } = await supabase.from('list_members').insert({ list_id: listId, user_id: profile.id, added_by: userId }).select().single()
    if (error || !data) {
      console.error('[SavedView] handleAddMember failed:', error)
      setAddMemberError(`Could not add @${profile.username}. Try again.`)
      return
    }
    setMembers(prev => prev.some(m => m.id === profile.id) ? prev : [...prev, profile])
    setMemberSuggestions(prev => prev.filter(p => p.id !== profile.id))
    setMemberSearchResults(prev => prev.filter(p => p.id !== profile.id))
  }

  const confirmRemoveMember = async () => {
    if (!pendingRemoveMember) return
    const memberId = pendingRemoveMember.id
    setPendingRemoveMember(null)
    const { data, error } = await supabase.from('list_members').delete().eq('list_id', listId).eq('user_id', memberId).select()
    if (error || !data || data.length === 0) {
      console.error('[SavedView] confirmRemoveMember failed:', error)
      setRemoveMemberError('Could not remove this member. Try again.')
      return
    }
    setRemoveMemberError('')
    setMembers(prev => prev.filter(m => m.id !== memberId))
    suggestionsFetchedRef.current = true
    fetchMemberSuggestions()
  }

  const memberResults = memberQuery.trim() ? memberSearchResults : memberSuggestions

  // Restore scroll once spots content is actually rendered (listSpotIds loads async)
  useEffect(() => {
    if (scrollRestoredRef.current || !initialScrollTop || !scrollRef.current) return
    if (spots.length > 0) {
      scrollRef.current.scrollTop = initialScrollTop
      scrollRestoredRef.current = true
    }
  }, [spots.length, initialScrollTop])

  const handleSpotClick = (spot) => {
    if (scrollRef.current) onSaveScrollTop?.(scrollRef.current.scrollTop)
    onSpotClick(spot)
  }

  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setDeleteError('')
    setTimeout(() => { setDeleteClosing(false); setShowDeleteConfirm(false) }, 180)
  }

  const handleDelete = async () => {
    setDeleting(true)
    // saved_spots here deletes every row for this list — a list with no
    // spots in it legitimately deletes zero rows, so only a real `error`
    // means failure. spot_lists below deletes one specific known-to-exist
    // row by id, so an empty result there does mean the delete was blocked.
    const { error: savedSpotsError } = await supabase.from('saved_spots').delete().eq('list_id', listId).select()
    if (savedSpotsError) {
      console.error('[SavedView] handleDelete: saved_spots delete failed:', savedSpotsError)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this list. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    const { data, error } = await supabase.from('spot_lists').delete().eq('id', listId).select()
    if (error || !data || data.length === 0) {
      console.error('[SavedView] handleDelete: spot_lists delete failed:', error)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this list. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    _listsFetchSeq++ // invalidate any in-flight fetchLists() — see comment at the declaration
    _cachedLists = _cachedLists.filter(l => l.id !== listId)
    const { [listId]: _removed, ...rest } = _cachedListSpotIds
    _cachedListSpotIds = rest
    setDeleting(false)
    setShowDeleteConfirm(false)
    onListDeleted?.()
    onBack()
  }

  const handleShare = async () => {
    if (sharing) return
    setSharing(true)
    setShareError('')
    try {
      let token = shareToken
      if (!token) {
        token = generateShareToken()
        if (isFavorites) {
          const { data, error } = await supabase
            .from('spot_lists')
            .insert({ user_id: userId, name: 'Saved Spots', is_favorites: true, share_token: token })
            .select('id')
            .single()
          if (error) {
            console.error('[share] failed to create share token:', error)
            alert('Could not create a share link: ' + error.message)
            return
          }
          onTokenGenerated?.(token, data?.id)
        } else {
          const { data, error } = await supabase
            .from('spot_lists')
            .update({ share_token: token })
            .eq('id', listId)
            .select()
          if (error || !data || data.length === 0) {
            console.error('[share] failed to save share token:', error)
            setShareError('Could not create a share link. Try again.')
            setTimeout(() => setShareError(''), 3000)
            return
          }
          onTokenGenerated?.(token)
        }
      }

      const url = `${siteOrigin()}/#/list/${token}`

      // Try the native share sheet first, but fall back to clipboard if it
      // isn't available or throws (common inside the Capacitor WebView).
      let shared = false
      if (navigator.share) {
        try {
          await navigator.share({ title, url })
          shared = true
        } catch (err) {
          // User cancelling the share sheet is normal — don't fall through to a toast.
          if (err && err.name === 'AbortError') {
            shared = true
          } else {
            console.warn('[share] navigator.share failed, falling back to clipboard:', err)
          }
        }
      }

      if (!shared) {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2500)
        } catch (err) {
          console.error('[share] clipboard failed:', err)
          // Last resort so the user still gets the link.
          window.prompt('Copy this share link:', url)
        }
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="desktop-page-root" style={{ position: 'absolute', inset: 0, background: '#FDF8F0', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'grid',
        // Both side columns reserved at the same width — 2 buttons (36px
        // each) + 8px gap = 80px, the widest side this header ever shows
        // (trash + share) — so the title's center column is always truly
        // centered on the full header width, regardless of whether the
        // right side renders one button, two, or the plain 36px spacer.
        gridTemplateColumns: '80px 1fr 80px',
        alignItems: 'center',
        padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div
          onClick={onBack}
          style={{ justifySelf: 'start', width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase', overflowWrap: 'break-word' }}>
          {title}
        </div>
        {(isList || isFavorites) ? (
          <div style={{ justifySelf: 'end', display: 'flex', gap: 8, flexShrink: 0 }}>
            {isList && isOwner && (
              <div
                onClick={() => { setDeleteError(''); setShowDeleteConfirm(true) }}
                style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                  <path d="M1 4H13M5 4V2H9V4M2 4L3 14H11L12 4" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            {isOwner && (
              <div
                onClick={handleShare}
                style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: sharing ? 0.6 : 1 }}
              >
                <ShareIcon color="#d4785a" />
              </div>
            )}
          </div>
        ) : (
          <div style={{ justifySelf: 'end', width: 36 }} />
        )}
      </div>

      {copied && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#2a1e14', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          Link Copied!
        </div>,
        document.body
      )}

      {shareError && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#FFFFFF', border: '1px solid #EAD8C8', color: '#e07070', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {shareError}
        </div>,
        document.body
      )}

      {deleteError && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#FFFFFF', border: '1px solid #EAD8C8', color: '#e07070', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {deleteError}
        </div>,
        document.body
      )}

      {/* Delete confirmation popup */}
      {(showDeleteConfirm || deleteClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Delete List
            </div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Delete "{title}"? This cannot be undone.
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete List'}
              </button>
              <button
                onClick={closeDeleteConfirm}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* C) Members sheet — every member as a full-width row. X controls
          (remove) only render for the list owner. */}
      {showMembersSheet && createPortal(
        <div className="modal-overlay" onClick={() => setShowMembersSheet(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px' }}>Members</div>
            {removeMemberError && <div style={{ padding: '0 20px 12px', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{removeMemberError}</div>}
            {members.map(m => (
              <div key={m.id} className="modal-row">
                <MemberAvatar profile={m} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[m.first_name, m.last_name].filter(Boolean).join(' ') || m.username}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>@{m.username}</div>
                </div>
                {isOwner && (
                  <IconBox onClick={() => { setRemoveMemberError(''); setPendingRemoveMember({ id: m.id, username: m.username }) }}>
                    <CloseIcon color="#d4785a" />
                  </IconBox>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Remove-member confirmation — existing confirm-dialog pattern
          (modal-overlay/modal-sheet, solid-salmon action + outline cancel)
          copied verbatim from ReviewsSection.jsx's "Delete Rating" modal. */}
      {pendingRemoveMember && createPortal(
        <div className="modal-overlay" onClick={() => setPendingRemoveMember(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Remove Member</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Remove @{pendingRemoveMember.username} from this list?</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmRemoveMember} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Remove</button>
              <button onClick={() => setPendingRemoveMember(null)} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fixed bottom toggle */}
      {createPortal(
        <div ref={viewToggleTrackRef} style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 84px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', background: '#d4785a', borderRadius: 50, padding: 3, pointerEvents: 'auto', boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
          <div ref={viewToggleThumbRef} style={{ position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 50, background: '#fff', transition: 'transform 340ms cubic-bezier(.32,.9,.36,1)', zIndex: 0 }} />
          <div ref={el => { viewToggleSegmentRefs.current.list = el }} onClick={() => setViewMode('list')} style={{ position: 'relative', zIndex: 1, padding: '6px 18px', borderRadius: 50, color: viewMode === 'list' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>LIST</div>
          <div ref={el => { viewToggleSegmentRefs.current.map = el }} onClick={() => setViewMode('map')} style={{ position: 'relative', zIndex: 1, padding: '6px 18px', borderRadius: 50, color: viewMode === 'map' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>MAP</div>
        </div>,
        document.body
      )}
      {viewMode === 'map' ? (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {spots.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No spots saved here yet</div>
          ) : (
            <MapView spots={spots} saved={saved} onSavePress={onSavePress} onSpotClick={handleSpotClick} showNav={false} showFilterChips={false} fitOnMount={true} />
          )}
        </div>
      ) : (
        <div className="scroll-area" ref={scrollRef} style={{ paddingTop: 14 }}>
          {isList && (
            <div style={{ padding: '0 16px 14px' }}>
              {isOwner && (
                <div style={{ marginBottom: 10 }}>
                  {/* Persistent "@" prefix — same pattern as FriendsView's search input */}
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#d4785a', pointerEvents: 'none', fontFamily: 'Barlow, sans-serif' }}>@</span>
                    <input
                      ref={memberInputRef}
                      className="form-input"
                      placeholder="Add skaters to this list..."
                      value={memberQuery}
                      onChange={e => setMemberQuery(e.target.value.replace(/^@+/, ''))}
                      onFocus={handleMemberInputFocus}
                      onBlur={() => setTimeout(() => setMemberInputFocused(false), 150)}
                      style={{ paddingLeft: 24, border: '1.5px solid #d4785a' }}
                    />
                    {memberInputFocused && (
                      <div style={memberDropdownStyle}>
                        {memberResults.length === 0 ? (
                          <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                            {memberQuery.trim() ? 'No users found' : 'No friends to suggest'}
                          </div>
                        ) : memberResults.map(p => {
                          const already = members.some(m => m.id === p.id)
                          return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #ECEDF2' }}>
                              <MemberAvatar profile={p} size={28} />
                              <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.username}</span>
                              {!already && p.id !== userId && (
                                <IconBox size={28} onMouseDown={() => handleAddMember(p)}>
                                  <PlusIcon color="#d4785a" />
                                </IconBox>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {addMemberError && (
                    <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{addMemberError}</div>
                  )}
                </div>
              )}

              {/* B) Added-members summary — overlapping avatars + count.
                  Owner only: members see no member controls on a shared list. */}
              {isOwner && members.length > 0 && (
                <div onClick={() => { setRemoveMemberError(''); setShowMembersSheet(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    Added:
                  </span>
                  <div style={{ display: 'flex' }}>
                    {members.map((m, i) => (
                      <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -12, zIndex: members.length - i }}>
                        <MemberAvatar profile={m} size={32} border="2px solid #FDF8F0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {spots.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No spots saved here yet</div>
          ) : (
            spots.map((spot, i) => (
              <SpotCard key={spot.id} spot={spot} saved={saved.has(spot.id)} onSavePress={onSavePress} onClick={handleSpotClick} priority={i < 3} />
            ))
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      )}
    </div>
  )
}

export default function SavedView({ spots, saved, onSavePress, onSpotClick, onAddSpot, onSearch, searchOverlay, showNav = true, user, openListId, onOpenListIdHandled }) {
  const [lists, setLists] = useState(() => _listsUserId === user?.id ? _cachedLists : [])
  const [listSpotIds, setListSpotIds] = useState(() => _listsUserId === user?.id ? _cachedListSpotIds : {})
  const [openCollection, setOpenCollection] = useState(_savedOpenCollection)
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)
  const [sharedLists, setSharedLists] = useState([])
  const [sharedListDetail, setSharedListDetail] = useState(null) // { header, spotIds: Set } | null
  const [shareCardToast, setShareCardToast] = useState('')
  const [pendingLeaveList, setPendingLeaveList] = useState(null) // { id, name }
  const [leaveClosing, setLeaveClosing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  useEffect(() => {
    if (!user?.id) return
    if (_listsUserId === user.id) return
    fetchLists()
  }, [user?.id])

  // Lists a friend added this user to as a member — RLS blocks a member
  // from reading spot_lists/saved_spots directly, so this RPC (SECURITY
  // DEFINER, presumably) is the only way to see them. No module-level
  // cache like fetchLists() above: membership changes aren't covered by
  // the seshwars:lists-changed event, so this just refetches per mount.
  useEffect(() => {
    if (!user?.id) { setSharedLists([]); return }
    let cancelled = false
    supabase.rpc('get_lists_shared_with_me').then(({ data, error }) => {
      if (cancelled) return
      if (error) { console.error('[SavedView] get_lists_shared_with_me failed:', error); return }
      setSharedLists(data || [])
    })
    return () => { cancelled = true }
  }, [user?.id])

  // Shared-list detail (member view): get_list_header + get_list_spot_ids
  // are the only RLS-permitted paths to a shared list's contents for a
  // member. Spot rows themselves are resolved from the existing spots
  // cache below (not re-fetched here) — see collSpots/missingSharedSpotIds.
  // Exact shapes: get_list_header returns one row (id, name, owner_id,
  // owner_username, is_owner), not wrapped in an array; get_list_spot_ids
  // returns rows with a single spot_id column.
  useEffect(() => {
    if (!openCollection || openCollection.type !== 'shared') { setSharedListDetail(null); return }
    let cancelled = false
    ;(async () => {
      const [{ data: header, error: headerErr }, { data: idsData, error: idsErr }] = await Promise.all([
        supabase.rpc('get_list_header', { p_list_id: openCollection.id }),
        supabase.rpc('get_list_spot_ids', { p_list_id: openCollection.id }),
      ])
      if (cancelled) return
      if (headerErr) console.error('[SavedView] get_list_header failed:', headerErr)
      if (idsErr) console.error('[SavedView] get_list_spot_ids failed:', idsErr)
      const rawIds = (idsData || []).map(r => r.spot_id)
      setSharedListDetail({ header: header || null, spotIds: new Set(rawIds) })
    })()
    return () => { cancelled = true }
  }, [openCollection?.type, openCollection?.id])

  // Refetch when a list was modified externally (e.g. SaveToListModal)
  useEffect(() => {
    const handler = () => fetchLists()
    window.addEventListener('seshwars:lists-changed', handler)
    return () => window.removeEventListener('seshwars:lists-changed', handler)
  }, [user?.id])

  // Open a specific list by id (list_invite notification tap). Looks for
  // it among the user's own lists first; otherwise this is a member opening
  // a list they don't own — RLS blocks reading spot_lists/saved_spots
  // directly for a member, so get_list_header is the only permitted path
  // (spots themselves resolve via the sharedListDetail effect above, same
  // as tapping a "Shared With You" card).
  useEffect(() => {
    if (!openListId || !user?.id) return
    let cancelled = false
    ;(async () => {
      const ownList = lists.find(l => l.id === openListId)
      if (ownList) {
        setOpenCollection({ type: 'list', id: ownList.id, name: ownList.name, shareToken: ownList.share_token, isOwner: true })
        onOpenListIdHandled?.()
        return
      }
      const { data: header, error } = await supabase.rpc('get_list_header', { p_list_id: openListId })
      if (cancelled) return
      if (error || !header) { onOpenListIdHandled?.(); return }
      setOpenCollection({ type: 'shared', id: openListId, name: header.name, isOwner: header.is_owner })
      onOpenListIdHandled?.()
    })()
    return () => { cancelled = true }
  }, [openListId, user?.id, lists])

  const fetchLists = async () => {
    if (!user?.id) return
    const seq = ++_listsFetchSeq
    const { data: listsData } = await supabase
      .from('spot_lists').select('*').eq('user_id', user.id).order('created_at')
    const map = {}
    if (listsData?.length > 0) {
      const { data: items } = await supabase
        .from('saved_spots')
        .select('list_id, spot_id')
        .eq('user_id', user.id)
        .not('list_id', 'is', null)
      for (const item of (items || [])) {
        if (!map[item.list_id]) map[item.list_id] = new Set()
        map[item.list_id].add(item.spot_id)
      }
    }
    // A create/delete (or a newer fetch) landed while this one was in
    // flight — applying this now would silently revert that newer change.
    if (seq !== _listsFetchSeq) return
    _cachedLists = listsData || []
    _cachedListSpotIds = map
    _listsUserId = user.id
    setLists(_cachedLists)
    setListSpotIds(_cachedListSpotIds)
  }

  const savedSpots = spots.filter(s => saved.has(s.id))

  const getListSpots = (listId) => {
    const ids = listSpotIds[listId] || new Set()
    return spots.filter(s => ids.has(s.id))
  }

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id) return
    setCreating(true)
    // A blocked RLS write returns { data: [], error: null } and would look
    // like success if we only checked `error` — chain .select() (no
    // .single(), which would itself error on zero rows but there's no
    // reason to rely on that) and require a non-empty result before
    // touching cache/state, matching hideSpot/unhideSpot in useSpots.js.
    const { data, error } = await supabase.from('spot_lists').insert({ user_id: user.id, name: newListName.trim() }).select()
    if (!error && data && data.length > 0) {
      _listsFetchSeq++ // invalidate any in-flight fetchLists() — see comment at the declaration
      _cachedLists = [..._cachedLists, data[0]]
      setLists(_cachedLists)
    }
    setNewListName('')
    setShowCreateList(false)
    setCreating(false)
  }

  const showShareCardToast = (msg) => {
    setShareCardToast(msg)
    setTimeout(() => setShareCardToast(''), 2500)
  }

  // SHARE icon on a "Shared With You" overview card — get_or_create_list_share_token
  // works for owners and members, unlike the owner-only share_token write
  // CollectionView.handleShare still uses for the user's own lists.
  const handleShareSharedList = async (list) => {
    const { data: token, error } = await supabase.rpc('get_or_create_list_share_token', { p_list_id: list.id })
    if (error || !token) {
      console.error('[SavedView] get_or_create_list_share_token failed:', error)
      showShareCardToast('Could not create a share link. Try again.')
      return
    }
    const url = `${siteOrigin()}/#/list/${token}`
    let shared = false
    if (navigator.share) {
      try {
        await navigator.share({ title: list.name, url })
        shared = true
      } catch (err) {
        if (err && err.name === 'AbortError') shared = true
        else console.warn('[SavedView] navigator.share failed, falling back to clipboard:', err)
      }
    }
    if (!shared) {
      try {
        await navigator.clipboard.writeText(url)
        showShareCardToast('Link Copied!')
      } catch (err) {
        console.error('[SavedView] clipboard failed:', err)
        window.prompt('Copy this share link:', url)
      }
    }
  }

  const closeLeaveConfirm = () => {
    setLeaveClosing(true)
    setLeaveError('')
    setTimeout(() => { setLeaveClosing(false); setPendingLeaveList(null) }, 180)
  }

  // Existing confirm-dialog pattern — closes in both outcomes. Removes only
  // this user's own list_members row (self-removal), then drops the card.
  const confirmLeaveList = async () => {
    if (!pendingLeaveList || !user?.id) return
    const listId = pendingLeaveList.id
    setLeaving(true)
    const { data, error } = await supabase.from('list_members').delete().eq('list_id', listId).eq('user_id', user.id).select()
    if (error || !data || data.length === 0) {
      console.error('[SavedView] confirmLeaveList failed:', error)
      setLeaving(false)
      closeLeaveConfirm()
      setLeaveError('Could not leave this list. Try again.')
      setTimeout(() => setLeaveError(''), 3000)
      return
    }
    setLeaving(false)
    setSharedLists(prev => prev.filter(l => l.id !== listId))
    closeLeaveConfirm()
  }

  const handleBackFromCollection = () => {
    _savedOpenCollection = null
    _savedCollectionScrollTop = 0
    setOpenCollection(null)
  }

  const handleSpotClickInCollection = (spot) => {
    _savedOpenCollection = openCollection
    onSpotClick(spot)
  }

  const handleTokenGenerated = (token, newListId) => {
    if (openCollection.type === 'favorites') {
      // A new spot_lists row was created for Saved Spots; update local state
      if (newListId) {
        const newEntry = { id: newListId, name: 'Saved Spots', is_favorites: true, share_token: token }
        setLists(prev => [...prev, newEntry])
      }
      setOpenCollection(prev => ({ ...prev, shareToken: token }))
      _savedOpenCollection = { ..._savedOpenCollection, shareToken: token }
    } else {
      setLists(prev => prev.map(l => l.id === openCollection.id ? { ...l, share_token: token } : l))
      setOpenCollection(prev => ({ ...prev, shareToken: token }))
      _savedOpenCollection = { ..._savedOpenCollection, shareToken: token }
    }
  }

  // Find any existing favorites share token from lists data
  const favoritesListEntry = lists.find(l => l.is_favorites)

  // Owned lists newest-first by created_at, shared lists newest-first by
  // added_at, merged and interleaved by that date.
  const combinedLists = [
    ...lists.map(l => ({ ...l, _kind: 'own', _sortDate: l.created_at })),
    ...sharedLists.map(l => ({ ...l, _kind: 'shared', _sortDate: l.added_at })),
  ].sort((a, b) => new Date(b._sortDate) - new Date(a._sortDate))

  if (openCollection) {
    let collSpots
    if (openCollection.type === 'favorites') {
      collSpots = savedSpots
    } else if (openCollection.type === 'shared') {
      const ids = sharedListDetail?.spotIds || new Set()
      collSpots = spots.filter(s => ids.has(s.id))
      // Spot IDs the shared list contains that the useSpots cache has no row
      // for (typically a private/unlisted spot this member can't see via the
      // spots table's own RLS select) — silently excluded from the rendered
      // list, same as a regular owned-list spot id with no matching cache
      // entry already is via getListSpots() above.
      if (sharedListDetail) {
        const missing = [...ids].filter(id => !spots.some(s => s.id === id))
        if (missing.length > 0) console.warn('[SavedView] shared list spot ids not in useSpots cache (private/unlisted?):', missing)
      }
    } else {
      collSpots = getListSpots(openCollection.id)
    }
    const favShareToken = openCollection.type === 'favorites'
      ? (openCollection.shareToken || favoritesListEntry?.share_token)
      : openCollection.shareToken
    const title = openCollection.type === 'shared'
      ? (sharedListDetail?.header?.name || openCollection.name)
      : openCollection.name
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <CollectionView
          key={openCollection.type === 'favorites' ? 'favorites' : openCollection.id}
          title={title}
          isList={openCollection.type === 'list' || openCollection.type === 'shared'}
          isFavorites={openCollection.type === 'favorites'}
          isOwner={openCollection.isOwner ?? true}
          userId={user?.id}
          listId={openCollection.type === 'list' || openCollection.type === 'shared' ? openCollection.id : favoritesListEntry?.id}
          shareToken={favShareToken}
          onTokenGenerated={handleTokenGenerated}
          spots={collSpots}
          saved={saved}
          onSavePress={onSavePress}
          onSpotClick={handleSpotClickInCollection}
          onBack={handleBackFromCollection}
          initialScrollTop={_savedCollectionScrollTop}
          onSaveScrollTop={(v) => { _savedCollectionScrollTop = v }}
          onListDeleted={() => {
            _savedOpenCollection = null
            _savedCollectionScrollTop = 0
            setLists(prev => prev.filter(l => l.id !== openCollection.id))
            setListSpotIds(prev => { const n = {...prev}; delete n[openCollection.id]; return n })
          }}
        />
      </div>
    )
  }

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      {searchOverlay || (
      <>
      <div className="scroll-area">
        <div style={{ padding: '8px 16px 0' }}>
        {/* Saved Spots (was Favorites) */}
        <div
          onClick={() => setOpenCollection({ type: 'favorites', name: 'Saved Spots' })}
          style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="20" viewBox="0 0 28 32" fill="none">
              <path d="M4,2 H24 V30 L14,22 L4,30 Z" fill="#d4785a" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Saved Spots</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{savedSpots.length} spot{savedSpots.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="arrow-btn"><ArrowIcon /></div>
        </div>

        {/* Custom lists — the user's own, mixed with lists shared with them
            (merged/sorted above as combinedLists). Shared cards get SHARE
            (get_or_create_list_share_token — works for members too, unlike
            CollectionView.handleShare's owner-only write) and LEAVE icons
            in the existing salmon-stroke icon box. */}
        {combinedLists.map(list => {
          const isShared = list._kind === 'shared'
          const count = isShared ? list.spot_count : (listSpotIds[list.id]?.size || 0)
          return (
            <div
              key={`${list._kind}-${list.id}`}
              onClick={() => setOpenCollection(isShared
                ? { type: 'shared', id: list.id, name: list.name, isOwner: false }
                : { type: 'list', id: list.id, name: list.name, shareToken: list.share_token, isOwner: true })}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="20" viewBox="0 0 28 32" fill="none">
                  <path d="M4,2 H24 V30 L14,22 L4,30 Z" fill="#d4785a" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                  {count} spot{count !== 1 ? 's' : ''}{isShared ? ` · @${list.owner_username}` : ''}
                </div>
              </div>
              {isShared && (
                <>
                  <IconBox onClick={(e) => { e.stopPropagation(); handleShareSharedList(list) }}>
                    <ShareIcon color="#d4785a" />
                  </IconBox>
                  <IconBox onClick={(e) => { e.stopPropagation(); setLeaveError(''); setPendingLeaveList({ id: list.id, name: list.name }) }}>
                    <LeaveIcon color="#d4785a" />
                  </IconBox>
                </>
              )}
              <div className="arrow-btn"><ArrowIcon /></div>
            </div>
          )
        })}

        {/* Create New List card */}
        {user && (
          showCreateList ? (
            <div style={{ border: '1.5px solid #d4785a', borderRadius: 8, padding: 14, marginBottom: 8 }}>
              <input
                className="form-input"
                placeholder="List name..."
                value={newListName}
                onChange={e => setNewListName(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleCreateList() }}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-salmon" onClick={handleCreateList} disabled={creating} style={{ flex: 1, padding: 10 }}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
                <button
                  onClick={() => { setShowCreateList(false); setNewListName('') }}
                  style={{ flex: 1, padding: 10, borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', fontSize: 12, fontWeight: 700, color: '#d4785a', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setShowCreateList(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: '1.5px solid #d4785a', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 8, background: 'transparent', border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <line x1="8" y1="3" x2="8" y2="13" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="3" y1="8" x2="13" y2="8" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#d4785a' }}>Create New List</div>
              </div>
            </div>
          )
        )}
        </div>

        {!user && (
          <div style={{ padding: '40px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1.6 }}>
            Sign in to save spots and create lists
          </div>
        )}

        <div style={{ height: BOTTOM_PAD }} />
      </div>
      </>
      )}

      {/* Leave-list confirmation (shared cards' LEAVE icon) — existing
          confirm-dialog pattern, closes in both outcomes. */}
      {(pendingLeaveList || leaveClosing) && createPortal(
        <div className="modal-overlay" onClick={closeLeaveConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={leaveClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Leave List</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Leave "{pendingLeaveList?.name}"? You'll need a new invite to see it again.</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmLeaveList} disabled={leaving} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: leaving ? 0.7 : 1 }}>
                {leaving ? 'Leaving…' : 'Leave'}
              </button>
              <button onClick={closeLeaveConfirm} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {leaveError && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#FFFFFF', border: '1px solid #EAD8C8', color: '#e07070', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {leaveError}
        </div>,
        document.body
      )}
      {shareCardToast && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#2a1e14', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {shareCardToast}
        </div>,
        document.body
      )}
    </>
  )
}
