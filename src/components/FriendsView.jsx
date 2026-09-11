import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import AddFriendButton from './AddFriendButton'

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

// Soft circular "X" — copied verbatim from the LocationChip clear icon in
// FiltersModal.jsx (~line 16-25).
function IgnoreIcon({ onClick }) {
  return (
    <div onClick={onClick} style={{ marginLeft: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" fill="rgba(212,120,90,0.15)" />
        <line x1="4" y1="4" x2="8" y2="8" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="8" y1="4" x2="4" y2="8" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </div>
  )
}

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
  const [requestsError, setRequestsError] = useState('')
  const [friendsError, setFriendsError] = useState('')
  const [nearbySkaters, setNearbySkaters] = useState([])
  const nearbyFetchedRef = useRef(false)

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

  useEffect(() => {
    loadRequests()
    loadFriends()
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

  return (
    <div>
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

      {/* Persistent "@" prefix — a separate absolutely-positioned element, not
          part of the input's value, so it can't be edited or deleted. Any
          leading "@" typed/pasted into the input is stripped in onChange. */}
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--text-primary)', pointerEvents: 'none', fontFamily: 'Barlow, sans-serif' }}>@</span>
        <input
          className="form-input"
          placeholder="Search by username..."
          value={query}
          onChange={e => setQuery(e.target.value.replace(/^@+/, ''))}
          style={{ paddingLeft: 24 }}
        />
      </div>

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

      {requests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div className="section-label" style={{ marginBottom: 0 }}>Requests</div>
            <div style={countBadgeStyle}>
              <span style={countBadgeTextStyle}>{requests.length}</span>
            </div>
          </div>
          {requestsError && <div style={errorTextStyle}>{requestsError}</div>}
          {requests.map(r => (
            <div key={r.friendship_id} style={rowStyle}>
              <Avatar avatarUrl={r.avatar_url} username={r.username} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={usernameStyle}>@{r.username}</div>
              </div>
              <AddFriendButton
                targetUserId={r.id}
                friendshipStatus="pending"
                isRequester={false}
                friendshipId={r.friendship_id}
                onChange={handleRequestAccepted}
              />
              <IgnoreIcon onClick={() => handleIgnoreRequest(r.friendship_id)} />
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Friends</div>
          <div style={countBadgeStyle}>
            <span style={countBadgeTextStyle}>{friends.length}</span>
          </div>
        </div>
        {friendsError && <div style={errorTextStyle}>{friendsError}</div>}
        {friends.length === 0 && !friendsError && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, padding: '4px 0' }}>No friends yet</div>
        )}
        {friends.map(f => (
          <div key={f.friendship_id} style={rowStyle}>
            <Avatar avatarUrl={f.avatar_url} username={f.username} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={usernameStyle}>@{f.username}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
