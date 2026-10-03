import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import AddFriendButton from './AddFriendButton'
import { PersonPlusIcon, CloseIcon, IconBox } from './Icons'

// Row container + avatar — copied verbatim from the notification card
// markup in ProfileView.jsx (~line 1009-1035).
const rowStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 8, borderRadius: 10, background: '#FFFFFF', border: '1px solid #EAD8C8' }
const avatarWrapStyle = { flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: '#ECEDF2', border: '1px solid #C8CAD4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const avatarInitialStyle = { fontSize: 15, fontWeight: 900, color: '#6a6c7a' }
const usernameStyle = { fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const errorTextStyle = { fontSize: 11, color: '#e07070', fontWeight: 700 }

// Count badge — copied verbatim from the notification bell's unread badge
// in ProfileView.jsx (~line 454-464), minus the absolute overlay positioning.
const countBadgeStyle = { minWidth: 17, height: 17, borderRadius: 9, background: '#FDF8F0', border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }
const countBadgeTextStyle = { fontSize: 9, fontWeight: 900, color: '#d4785a', lineHeight: 1 }

// Stat card — copied verbatim from the 2x2 stat-card grid in ProfileView.jsx
// (~line 580-648), minus the icon/chevron (these cards are narrower, 3-across).
const statCardStyle = { flex: 1, background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', textAlign: 'center' }
const statCardCountStyle = { fontSize: 22, fontWeight: 900, color: 'var(--salmon)' }
const statCardLabelStyle = { fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }

// "Deny" outline button — copied verbatim from the friend-request
// notification card's Deny button in ProfileView.jsx (~line 1299-1303).
const denyBtnStyle = { flexShrink: 0, border: '1px solid rgba(212,120,90,0.5)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }
const denyBtnTextStyle = { fontSize: 10, fontWeight: 700, color: 'var(--salmon)', letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1 }

function Avatar({ avatarUrl, username }) {
  return (
    <div style={avatarWrapStyle}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={avatarInitialStyle}>{username ? username[0].toUpperCase() : '?'}</span>
      )}
    </div>
  )
}

const SEARCH_PAGE_SIZE = 20

export default function FriendsView({ user, userLocation, onFriendsChanged }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [requests, setRequests] = useState([])
  const [friends, setFriends] = useState([])
  const [sentPending, setSentPending] = useState([])
  const [requestsError, setRequestsError] = useState('')
  const [friendsError, setFriendsError] = useState('')
  const [sentPendingError, setSentPendingError] = useState('')
  const [activeSheet, setActiveSheet] = useState(null) // null | 'friends' | 'requests' | 'pending'
  const [nearbySkaters, setNearbySkaters] = useState([])
  const nearbyFetchedRef = useRef(false)
  const searchInputRef = useRef(null)

  // Reuses the location the spots list already gets from useGeolocation()
  // (passed down via App.jsx -> ProfileView -> here) — no separate geolocation
  // request/permission prompt. Fetched once, not re-run on every GPS update.
  useEffect(() => {
    if (!userLocation || nearbyFetchedRef.current) return
    nearbyFetchedRef.current = true
    supabase.rpc('get_nearby_skaters', {
      p_lat: userLocation.latitude,
      p_lng: userLocation.longitude,
      p_radius_km: 40,
    }).then(({ data, error }) => {
      if (error || !data) return
      setNearbySkaters(data)
    })
  }, [userLocation])

  // search_profiles(q, p_limit, p_offset) returns rows carrying a
  // total_count column identical on every row — read it from the first.
  const fetchResultsPage = async (q, offset, append) => {
    if (append) setLoadingMore(true)
    else setSearching(true)
    const { data, error } = await supabase.rpc('search_profiles', { q, p_limit: SEARCH_PAGE_SIZE, p_offset: offset })
    if (append) setLoadingMore(false)
    else setSearching(false)
    if (error) {
      setSearchError('Search failed')
      if (!append) { setResults([]); setTotalCount(0) }
      return
    }
    setSearchError('')
    const rows = data || []
    setTotalCount(rows[0]?.total_count ?? 0)
    setResults(prev => append ? [...prev, ...rows] : rows)
  }

  useEffect(() => {
    // Reset to offset 0 whenever the query text changes.
    if (query.trim().length < 2) {
      setResults([])
      setTotalCount(0)
      setSearchError('')
      return
    }
    const t = setTimeout(() => {
      fetchResultsPage(query.trim(), 0, false)
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const handleLoadMoreResults = () => {
    fetchResultsPage(query.trim(), results.length, true)
  }

  const loadRequests = async () => {
    const { data, error } = await supabase.rpc('get_friend_requests')
    if (error) { setRequestsError('Could not load requests'); return }
    setRequestsError('')
    setRequests(data || [])
  }

  const loadFriends = async () => {
    const { data, error } = await supabase.rpc('get_friends')
    if (error) { setFriendsError('Could not load friends'); return }
    setFriendsError('')
    setFriends(data || [])
  }

  // No RPC exists for "requests I sent that are still pending" — two-step
  // fetch (friendship rows, then a batch profile lookup) using the exact
  // same .in('id', ids) pattern already used by ReviewsSection.jsx and
  // ClipsSection.jsx to resolve a list of user ids to profiles.
  const loadSentPending = async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('friendships')
      .select('id, addressee_id, created_at')
      .eq('requester_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) { setSentPendingError('Could not load pending requests'); return }
    setSentPendingError('')
    const rows = data || []
    const ids = [...new Set(rows.map(r => r.addressee_id))]
    if (ids.length === 0) { setSentPending([]); return }
    const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
    const profileMap = {}
    for (const p of profiles || []) profileMap[p.id] = p
    setSentPending(rows.map(r => ({
      friendship_id: r.id,
      id: r.addressee_id,
      username: profileMap[r.addressee_id]?.username,
      avatar_url: profileMap[r.addressee_id]?.avatar_url,
    })))
  }

  useEffect(() => {
    loadRequests()
    loadFriends()
    loadSentPending()
  }, [user?.id])

  const handleIgnoreRequest = async (friendshipId) => {
    setRequests(prev => prev.filter(r => r.friendship_id !== friendshipId))
    await supabase.from('friendships').delete().eq('id', friendshipId)
  }

  const handleRequestAccepted = () => {
    loadRequests()
    loadFriends()
    onFriendsChanged?.()
  }

  const handleRemoveFriend = async (friendshipId) => {
    setFriends(prev => prev.filter(f => f.friendship_id !== friendshipId))
    await supabase.from('friendships').delete().eq('id', friendshipId)
    onFriendsChanged?.()
  }

  const handleCancelPending = async (friendshipId) => {
    setSentPending(prev => prev.filter(r => r.friendship_id !== friendshipId))
    await supabase.from('friendships').delete().eq('id', friendshipId)
  }

  return (
    <div>
      {/* Three count cards — tapping each opens its bottom sheet */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div onClick={() => setActiveSheet('friends')} style={statCardStyle}>
          <div style={statCardCountStyle}>{friends.length}</div>
          <div style={statCardLabelStyle}>Friends</div>
        </div>
        <div onClick={() => setActiveSheet('requests')} style={statCardStyle}>
          <div style={statCardCountStyle}>{requests.length}</div>
          <div style={statCardLabelStyle}>Requests</div>
        </div>
        <div onClick={() => setActiveSheet('pending')} style={statCardStyle}>
          <div style={statCardCountStyle}>{sentPending.length}</div>
          <div style={statCardLabelStyle}>Pending</div>
        </div>
      </div>

      {/* Add-person icon sits outside the search input, to its left, per
          the shared icon spec. Tapping it focuses the search field. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <IconBox size={42} onClick={() => searchInputRef.current?.focus()}>
          <PersonPlusIcon color="#d4785a" size={18} />
        </IconBox>
        {/* Persistent "@" prefix — a separate absolutely-positioned element, not
            part of the input's value, so it can't be edited or deleted. Any
            leading "@" typed/pasted into the input is stripped in onChange. */}
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-primary)', pointerEvents: 'none', fontFamily: 'Barlow, sans-serif' }}>@</span>
          <input
            ref={searchInputRef}
            className="form-input"
            placeholder="Search for skaters..."
            value={query}
            onChange={e => setQuery(e.target.value.replace(/^@+/, ''))}
            style={{ paddingLeft: 24 }}
          />
        </div>
      </div>

      {nearbySkaters.length > 0 && query.trim().length < 2 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Skaters Near You</div>
            <div style={countBadgeStyle}>
              <span style={countBadgeTextStyle}>{nearbySkaters.length}</span>
            </div>
          </div>
          {nearbySkaters.map(s => (
            <div key={s.id} style={rowStyle}>
              <Avatar avatarUrl={s.avatar_url} username={s.username} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={usernameStyle}>@{s.username}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{s.spot_count} spots nearby</div>
              </div>
              <AddFriendButton
                targetUserId={s.id}
                friendshipStatus={s.friendship_status}
                isRequester={s.is_requester}
                friendshipId={null}
              />
            </div>
          ))}
        </div>
      )}

      {query.trim().length >= 2 && (
        <div style={{ marginBottom: 20 }}>
          {!searching && !searchError && results.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div className="section-label" style={{ marginBottom: 0 }}>Results</div>
              <div style={countBadgeStyle}>
                <span style={countBadgeTextStyle}>{totalCount}</span>
              </div>
            </div>
          )}
          {searchError && <div style={errorTextStyle}>{searchError}</div>}
          {!searching && !searchError && results.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, padding: '4px 0' }}>No users found</div>
          )}
          {results.map(r => (
            <div key={r.id} style={rowStyle}>
              <Avatar avatarUrl={r.avatar_url} username={r.username} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={usernameStyle}>@{r.username}</div>
              </div>
              <AddFriendButton
                targetUserId={r.id}
                friendshipStatus={r.friendship_status}
                isRequester={r.is_requester}
                friendshipId={null}
              />
            </div>
          ))}
          {!searching && results.length < totalCount && (
            <div
              onClick={() => !loadingMore && handleLoadMoreResults()}
              style={{ padding: 16, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#d4785a', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase', opacity: loadingMore ? 0.6 : 1 }}
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </div>
          )}
        </div>
      )}

      {/* FRIENDS sheet */}
      {activeSheet === 'friends' && createPortal(
        <div className="modal-overlay" onClick={() => setActiveSheet(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px' }}>Friends</div>
            {friendsError && <div style={{ ...errorTextStyle, padding: '0 20px 12px' }}>{friendsError}</div>}
            {friends.length === 0 ? (
              <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No friends yet</div>
            ) : friends.map(f => (
              <div key={f.friendship_id} className="modal-row">
                <Avatar avatarUrl={f.avatar_url} username={f.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={usernameStyle}>@{f.username}</div>
                </div>
                <IconBox onClick={() => handleRemoveFriend(f.friendship_id)}>
                  <CloseIcon color="#d4785a" />
                </IconBox>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* REQUESTS sheet — incoming requests, Accept solid / Deny outline */}
      {activeSheet === 'requests' && createPortal(
        <div className="modal-overlay" onClick={() => setActiveSheet(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px' }}>Requests</div>
            {requestsError && <div style={{ ...errorTextStyle, padding: '0 20px 12px' }}>{requestsError}</div>}
            {requests.length === 0 ? (
              <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No requests</div>
            ) : requests.map(r => (
              <div key={r.friendship_id} className="modal-row">
                <Avatar avatarUrl={r.avatar_url} username={r.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={usernameStyle}>@{r.username}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <AddFriendButton
                    targetUserId={r.id}
                    friendshipStatus="pending"
                    isRequester={false}
                    friendshipId={r.friendship_id}
                    onChange={handleRequestAccepted}
                  />
                  <div onClick={() => handleIgnoreRequest(r.friendship_id)} style={denyBtnStyle}>
                    <span style={denyBtnTextStyle}>Deny</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* PENDING sheet — requests I sent, still awaiting a response */}
      {activeSheet === 'pending' && createPortal(
        <div className="modal-overlay" onClick={() => setActiveSheet(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px' }}>Pending</div>
            {sentPendingError && <div style={{ ...errorTextStyle, padding: '0 20px 12px' }}>{sentPendingError}</div>}
            {sentPending.length === 0 ? (
              <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No pending requests</div>
            ) : sentPending.map(r => (
              <div key={r.friendship_id} className="modal-row">
                <Avatar avatarUrl={r.avatar_url} username={r.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={usernameStyle}>@{r.username}</div>
                </div>
                <IconBox onClick={() => handleCancelPending(r.friendship_id)}>
                  <CloseIcon color="#d4785a" />
                </IconBox>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
