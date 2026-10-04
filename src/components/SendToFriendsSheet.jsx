import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { getProfiles } from '../utils/profileCache'
import InitialsAvatar from './InitialsAvatar'

const NOTE_MAX = 200

// Copied verbatim from SaveToListModal.jsx's own SquareToggle — same
// multi-select interaction (tap a row, toggle a checked/unchecked square).
function SquareToggle({ selected }) {
  if (selected) {
    return (
      <div style={{ width: 30, height: 30, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 7L5.5 10.5L11.5 3.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  return (
    <div style={{ width: 30, height: 30, borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <line x1="6" y1="2" x2="6" y2="10" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="6" x2="10" y2="6" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// Same avatar-with-initials-fallback pattern already used by FriendsView.jsx
// and CommentsSection.jsx's own local Avatar wrappers.
function FriendAvatar({ profile, size = 38 }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #EAD8C8' }} />
  }
  return <InitialsAvatar profile={profile} size={size} />
}

export default function SendToFriendsSheet({ spot, onClose, onSent, onGoProfile }) {
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error: fetchErr } = await supabase.rpc('get_friends')
      if (cancelled) return
      if (fetchErr) {
        console.error('[SendToFriendsSheet] get_friends failed:', fetchErr)
        setLoading(false)
        return
      }
      const rows = data || []
      const profileMap = await getProfiles(rows.map(f => f.id))
      if (cancelled) return
      setFriends(rows.map(f => ({ ...f, first_name: profileMap[f.id]?.first_name || null })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const toggleFriend = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    if (selected.size === 0 || sending) return
    setSending(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('share_spot_with_friends', {
      p_spot_id: spot.id,
      p_friend_ids: Array.from(selected),
      p_message: note.trim() || null,
    })
    setSending(false)
    if (rpcError) {
      console.error('[SendToFriendsSheet] share_spot_with_friends failed:', rpcError)
      setError('Could not send. Try again.')
      return
    }
    const count = data ?? 0
    if (count === 0) {
      console.error('[SendToFriendsSheet] share_spot_with_friends created 0 notifications')
      setError('Could not reach any of the selected friends. Try again.')
      return
    }
    if (count < selected.size) {
      onSent(`Sent to ${count} of ${selected.size} friends — some couldn't be reached.`)
      return
    }
    onSent('Spot sent!')
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-handle" />
        <div className="modal-title" style={{ padding: '0 20px' }}>Send To Friends</div>

        {loading ? (
          <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Loading...</div>
        ) : friends.length === 0 ? (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
              You don't have any friends yet. Add some from the Friends page first.
            </div>
            <div
              onClick={() => { onClose(); onGoProfile?.() }}
              style={{ fontSize: 11, color: '#d4785a', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
            >
              Go to Friends
            </div>
          </div>
        ) : (
          <>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {friends.map(f => {
                const isSelected = selected.has(f.id)
                return (
                  <div key={f.id} className="modal-row" onClick={() => toggleFriend(f.id)}>
                    <FriendAvatar profile={f} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.first_name || f.username}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>@{f.username}</div>
                    </div>
                    <SquareToggle selected={isSelected} />
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '12px 20px 0' }}>
              <textarea
                className="form-input"
                placeholder="Add a note (optional)..."
                value={note}
                onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
                maxLength={NOTE_MAX}
                rows={2}
                style={{ resize: 'none', width: '100%', boxSizing: 'border-box' }}
              />
              <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 4 }}>
                {NOTE_MAX - note.length} characters left
              </div>
            </div>

            {error && (
              <div style={{ padding: '8px 20px 0', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{error}</div>
            )}

            <div style={{ padding: '10px 14px 0' }}>
              <button
                className="btn-salmon"
                onClick={handleSend}
                disabled={selected.size === 0 || sending}
                style={{ opacity: selected.size === 0 || sending ? 0.5 : 1 }}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
