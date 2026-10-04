import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import TrickCheckmark from './TrickCheckmark'
import { IconBox, CloseIcon } from './Icons'

const NAME_MAX = 60

// Dispatched after every verified add/toggle/delete so the Trick List
// profile-card count (and the Trick List page itself, if open) stay
// accurate without each owning its own cross-page refetch — same
// event-refresh approach used for list counts (SavedView.jsx's
// seshwars:lists-changed / invalidateListsCache).
function notifyTricksChanged() {
  window.dispatchEvent(new Event('seshwars:tricks-changed'))
}

export default function TricksSection({ spotId, user }) {
  const [tricks, setTricks] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null) // { id, name }
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!user?.id) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('user_tricks')
        .select('*')
        .eq('user_id', user.id)
        .eq('spot_id', spotId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (!error && data) setTricks(data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [spotId, user?.id])

  const toggleLanded = async (trick) => {
    const nextLanded = !trick.landed
    const { data, error } = await supabase
      .from('user_tricks')
      .update({ landed: nextLanded, landed_at: nextLanded ? new Date().toISOString() : null })
      .eq('id', trick.id)
      .select()
      .single()
    if (error || !data) {
      console.error('[TricksSection] toggleLanded failed:', error)
      return
    }
    setTricks(prev => prev.map(t => (t.id === trick.id ? data : t)))
    notifyTricksChanged()
  }

  const handleAdd = async () => {
    const trimmed = name.trim()
    if (!trimmed || adding || !user?.id) return
    setAdding(true)
    setAddError('')
    const { data, error } = await supabase
      .from('user_tricks')
      .insert({ user_id: user.id, spot_id: spotId, name: trimmed })
      .select()
      .single()
    setAdding(false)
    if (error || !data) {
      console.error('[TricksSection] handleAdd failed:', error)
      setAddError(error?.code === '23505' ? "You've already added that trick at this spot." : 'Could not add this trick. Try again.')
      return
    }
    setTricks(prev => [...prev, data])
    setName('')
    notifyTricksChanged()
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    const { data, error } = await supabase.from('user_tricks').delete().eq('id', id).select()
    if (error || !data || data.length === 0) {
      console.error('[TricksSection] confirmDelete failed:', error)
      setDeleteError('Could not delete this trick. Try again.')
      return
    }
    setDeleteError('')
    setTricks(prev => prev.filter(t => t.id !== id))
    notifyTricksChanged()
  }

  if (!user) return null

  return (
    <div>
      <div className="divider" />
      <div className="section-label">Your Tricks</div>

      {deleteError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 10 }}>{deleteError}</div>}

      {!loading && tricks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {tricks.map(trick => (
            <div key={trick.id} style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <TrickCheckmark landed={trick.landed} onClick={() => toggleLanded(trick)} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {trick.name}
              </div>
              <IconBox onClick={() => { setDeleteError(''); setPendingDelete({ id: trick.id, name: trick.name }) }}>
                <CloseIcon color="#d4785a" />
              </IconBox>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="form-input"
          placeholder="Add a trick..."
          value={name}
          onChange={e => setName(e.target.value.slice(0, NAME_MAX))}
          maxLength={NAME_MAX}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          style={{ flex: 1 }}
        />
        <button
          className="btn-salmon"
          onClick={handleAdd}
          disabled={!name.trim() || adding}
          style={{ width: 'auto', padding: '0 18px', opacity: !name.trim() || adding ? 0.5 : 1 }}
        >
          Add
        </button>
      </div>
      {addError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{addError}</div>}

      {/* Delete confirmation — existing confirm-dialog pattern (modal-
          overlay/modal-sheet, solid-salmon action + outline cancel). Always
          closes; the error (if any) is shown above, outside the dialog. */}
      {pendingDelete && createPortal(
        <div className="modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Trick</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Remove "{pendingDelete.name}" from your trick list? This cannot be undone.</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmDelete} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Delete</button>
              <button onClick={() => setPendingDelete(null)} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
