import { useState } from 'react'
import { createPortal } from 'react-dom'

const NAME_MAX = 60

// Shared "edit a trick" view — identical in the spot-page trick list sheet
// (where it swaps into the same sheet, nested pane, see AddToTrickListSheet)
// and on individual trick list pages (where it's dropped into its own
// bottom sheet). The actual mutation is injected by the caller so this
// component stays agnostic to where/how the write happens:
//   - onRename(newName) => Promise<{ ok: true } | { ok: false, error }>
//   - onDelete()         => Promise<{ ok: true } | { ok: false, error }>
// On success, either calls onClose() so the caller can dismiss/return.
export default function TrickEditPanel({ trick, onRename, onDelete, onClose }) {
  const [mode, setMode] = useState('menu') // 'menu' | 'rename'
  const [renameValue, setRenameValue] = useState(trick.name)
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')

  const [pendingDelete, setPendingDelete] = useState(false)
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const commitRename = async () => {
    if (renaming) return
    const trimmed = renameValue.trim().slice(0, NAME_MAX)
    if (!trimmed) return
    setRenaming(true)
    setRenameError('')
    const result = await onRename(trimmed)
    setRenaming(false)
    if (!result?.ok) {
      setRenameError(result?.error || 'Could not rename this trick. Try again.')
      return
    }
    onClose?.()
  }

  // Existing confirm-dialog pattern — closes (with the slide-out animation)
  // in both outcomes.
  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setDeleteError('')
    setTimeout(() => { setDeleteClosing(false); setPendingDelete(false) }, 180)
  }

  const confirmDelete = async () => {
    setDeleting(true)
    const result = await onDelete()
    setDeleting(false)
    if (!result?.ok) {
      closeDeleteConfirm()
      setDeleteError(result?.error || 'Could not delete this trick. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    closeDeleteConfirm()
    onClose?.()
  }

  return (
    <>
      {mode === 'menu' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn-salmon"
            onClick={() => { setRenameValue(trick.name); setRenameError(''); setMode('rename') }}
          >
            Rename
          </button>
          <button
            onClick={() => { setDeleteError(''); setPendingDelete(true) }}
            style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
          >
            Delete Trick
          </button>
        </div>
      ) : (
        <div>
          <input
            className="form-input"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename() }}
            autoFocus
            maxLength={NAME_MAX}
            style={{ marginBottom: 8 }}
          />
          {renameError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 8 }}>{renameError}</div>}
          <button className="btn-salmon" onClick={commitRename} disabled={renaming || !renameValue.trim()} style={{ opacity: renaming || !renameValue.trim() ? 0.5 : 1 }}>
            {renaming ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      {(pendingDelete || deleteClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Trick</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Delete "{trick.name}"? This cannot be undone.
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmDelete} disabled={deleting} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button onClick={closeDeleteConfirm} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {deleteError && (
        <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 8 }}>{deleteError}</div>
      )}
    </>
  )
}
