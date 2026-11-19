import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { LAYERS } from '../lib/layers'
import { normalizeCreditUrl } from '../lib/spotCredit'
import { friendlySaveErrorMessage } from '../lib/spotSaveValidation'

// Admin-only "Spot Credit" editor, opened from the pencil icon (or "Add
// Spot Credit" text button) next to AddedByCard on the spot page. Writes
// directly to spots.credit_name/credit_url — a database trigger is the
// actual admin gate (only taylorselgas@gmail.com may set or change those
// columns); the caller only checking isAdminUser(user) before ever
// mounting this is what keeps the controls themselves hidden from
// everyone else.
export default function SpotCreditSheet({ spot, onClose, onSaved, onError }) {
  const [name, setName] = useState(spot.credit_name || '')
  const [url, setUrl] = useState(spot.credit_url || '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const hasCredit = !!spot.credit_url

  const handleSave = async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl || saving || removing) return
    setSaving(true)
    const payload = {
      credit_name: name.trim() || null,
      credit_url: normalizeCreditUrl(trimmedUrl),
    }
    const { data, error } = await supabase.from('spots').update(payload).eq('id', spot.id).select().single()
    setSaving(false)
    if (error || !data) {
      console.error('[SpotCreditSheet] save failed:', error)
      onError?.(friendlySaveErrorMessage(error))
      return
    }
    onSaved?.(data)
    onClose?.()
  }

  const handleRemove = async () => {
    if (saving || removing) return
    setRemoving(true)
    const { data, error } = await supabase.from('spots').update({ credit_name: null, credit_url: null }).eq('id', spot.id).select().single()
    setRemoving(false)
    if (error || !data) {
      console.error('[SpotCreditSheet] remove failed:', error)
      onError?.(friendlySaveErrorMessage(error))
      return
    }
    onSaved?.(data)
    onClose?.()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: LAYERS.SHEET }}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title" style={{ padding: '0 16px' }}>Spot Credit</div>
        <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            className="form-input"
            placeholder="@handle or site name"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <input
            className="form-input"
            placeholder="https://"
            value={url}
            onChange={e => setUrl(e.target.value)}
          />
          <button
            className="btn-salmon"
            onClick={handleSave}
            disabled={saving || removing || !url.trim()}
            style={{ opacity: saving || removing || !url.trim() ? 0.5 : 1, marginTop: 4 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {hasCredit && (
            <span
              onClick={handleRemove}
              style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, fontWeight: 700, color: '#e07070', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase', opacity: saving || removing ? 0.6 : 1 }}
            >
              {removing ? 'Removing…' : 'Remove Credit'}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
