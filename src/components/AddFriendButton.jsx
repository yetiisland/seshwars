import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Filled pill — copied verbatim from the notification card's "View" action
// button in ProfileView.jsx (src/pages/ProfileView.jsx ~line 1050-1055).
const primaryBtnStyle = { flexShrink: 0, background: '#d4785a', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }
const primaryBtnTextStyle = { fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1 }

// Outline pill — copied verbatim from the "Edit Profile" button in
// ProfileView.jsx (~line 472-486), used here for inert/disabled states.
const outlineBtnStyle = { display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(212,120,90,0.5)', borderRadius: 6, padding: '5px 12px', cursor: 'default' }
const outlineBtnTextStyle = { fontSize: 10, fontWeight: 700, color: 'var(--salmon)', letterSpacing: 0.5, textTransform: 'uppercase' }

// Copied verbatim from the existing inline error text used in
// ProfileView.jsx (auth error, delete-account error, password error).
const errorTextStyle = { fontSize: 11, color: '#e07070', fontWeight: 700 }

export default function AddFriendButton({ targetUserId, friendshipStatus, isRequester, friendshipId, onChange }) {
  const [status, setStatus] = useState(friendshipStatus)
  const [requester, setRequester] = useState(isRequester)
  const [fid, setFid] = useState(friendshipId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setStatus(friendshipStatus)
    setRequester(isRequester)
    setFid(friendshipId)
  }, [friendshipStatus, isRequester, friendshipId])

  if (status === 'blocked') return null

  const handleAdd = async () => {
    setLoading(true)
    setError('')
    const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !cu) {
      setLoading(false)
      setError('Could not send request')
      return
    }
    const { data, error: err } = await supabase
      .from('friendships')
      .insert({ requester_id: cu.id, addressee_id: targetUserId, status: 'pending' })
      .select()
      .single()
    setLoading(false)
    if (err || !data) {
      setError('Could not send request')
      return
    }
    setStatus(data.status)
    setRequester(true)
    setFid(data.id)
    onChange?.(data.status, data)
  }

  const handleAccept = async () => {
    setLoading(true)
    setError('')
    let rowId = fid
    // search_profiles results carry friendship_status/is_requester but no
    // friendship_id — look the row up the same way the notification card
    // does (requester_id/addressee_id/status) when it wasn't passed in.
    if (!rowId) {
      const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !cu) {
        setLoading(false)
        setError('Could not accept request')
        return
      }
      const { data: row } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester_id', targetUserId)
        .eq('addressee_id', cu.id)
        .eq('status', 'pending')
        .maybeSingle()
      rowId = row?.id
    }
    if (!rowId) {
      setLoading(false)
      setError('Could not accept request')
      return
    }
    const { data, error: err } = await supabase
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', rowId)
      .select()
      .single()
    setLoading(false)
    if (err || !data) {
      setError('Could not accept request')
      return
    }
    setStatus(data.status)
    setFid(data.id)
    onChange?.(data.status, data)
  }

  let label, onClick, disabled, filled
  if (status === null || status === undefined) {
    label = 'ADD'
    onClick = handleAdd
    disabled = loading
    filled = true
  } else if (status === 'pending' && requester) {
    label = 'REQUESTED'
    onClick = undefined
    disabled = true
    filled = false
  } else if (status === 'pending' && !requester) {
    label = 'ACCEPT'
    onClick = handleAccept
    disabled = loading
    filled = true
  } else if (status === 'accepted') {
    label = 'FRIENDS'
    onClick = undefined
    disabled = true
    filled = false
  } else {
    return null
  }

  return (
    <div>
      <div
        onClick={disabled ? undefined : onClick}
        style={filled
          ? { ...primaryBtnStyle, opacity: disabled ? 0.6 : 1 }
          : outlineBtnStyle}
      >
        <span style={filled ? primaryBtnTextStyle : outlineBtnTextStyle}>
          {loading ? '...' : label}
        </span>
      </div>
      {error && <div style={errorTextStyle}>{error}</div>}
    </div>
  )
}
