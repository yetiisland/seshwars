import { useState } from 'react'
import { createPortal } from 'react-dom'
import InitialsAvatar from './InitialsAvatar'
import { CloseIcon, IconBox } from './Icons'

// Matches SavedView.jsx's own MemberAvatar exactly — duplicated locally,
// same pattern already repeated across this codebase's shared sub-pieces
// (SquareToggle, HeaderBackButton, etc.).
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

// "Added:" row (overlapping member avatars) + the members bottom sheet it
// opens — shared by saved list pages (SavedView.jsx) and individual trick
// list pages (TrickListPage.jsx). Renders nothing when there are no
// members. The caller owns fetching `members` and deciding whether this
// mounts at all (SavedView keeps its own owner-only gate at the call site
// so its existing behavior is unchanged); `isOwner` here only controls
// whether remove (X) controls show inside the sheet.
//
// `onRemove(memberId)` performs the actual delete (different table per
// caller) and returns `{ ok: true } | { ok: false, error }` — same
// inject-the-mutation shape as TrickEditPanel's onRename/onDelete. On
// success the caller is expected to drop the member from the `members`
// array it passed in; this component only owns its own sheet/confirm UI.
export default function MembersSummary({ members, isOwner, onRemove }) {
  const [showSheet, setShowSheet] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(null) // { id, username }
  const [removeError, setRemoveError] = useState('')

  if (!members || members.length === 0) return null

  // Existing confirm-dialog pattern: closes immediately either way, error
  // (if any) surfaces in the members sheet behind it.
  const confirmRemove = async () => {
    const memberId = pendingRemove.id
    setPendingRemove(null)
    const result = await onRemove(memberId)
    if (!result?.ok) {
      setRemoveError(result?.error || 'Could not remove this member. Try again.')
      return
    }
    setRemoveError('')
  }

  return (
    <>
      <div onClick={() => { setRemoveError(''); setShowSheet(true) }} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
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

      {showSheet && createPortal(
        <div className="modal-overlay" onClick={() => setShowSheet(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px' }}>Members</div>
            {removeError && <div style={{ padding: '0 20px 12px', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{removeError}</div>}
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
                  <IconBox onClick={() => { setRemoveError(''); setPendingRemove({ id: m.id, username: m.username }) }}>
                    <CloseIcon color="#d4785a" />
                  </IconBox>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* Remove-member confirmation — existing confirm-dialog pattern,
          closes in both outcomes. */}
      {pendingRemove && createPortal(
        <div className="modal-overlay" onClick={() => setPendingRemove(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Remove Member</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Remove @{pendingRemove.username} from this list?</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmRemove} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Remove</button>
              <button onClick={() => setPendingRemove(null)} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
