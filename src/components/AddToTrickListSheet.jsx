import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { sortTricks } from '../lib/trickSort'
import TrickCheckmark from './TrickCheckmark'
import { ListIcon, PencilIcon, CloseIcon, PlusIcon, IconBox } from './Icons'

const NAME_MAX = 60

function notifyTricksChanged() {
  window.dispatchEvent(new Event('seshwars:tricks-changed'))
}

function formatLandedDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

// Trick lists are now collections of spots (trick_list_spots), and tricks
// belong to the user+spot, not to a list (user_tricks.list_id is
// deprecated — never read or written here). So this sheet does two
// separate things: manage the tricks landed at this spot, and toggle
// which of the user's own trick lists this spot belongs to.
export default function AddToTrickListSheet({ spot, user, onClose, onGoProfile }) {
  const [trickLists, setTrickLists] = useState([])
  const [memberListIds, setMemberListIds] = useState(new Set()) // this user's own lists that already contain this spot
  const [spotTricks, setSpotTricks] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const [nameInput, setNameInput] = useState('')
  const [pendingNames, setPendingNames] = useState([])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  const [editingTrick, setEditingTrick] = useState(null) // { id, name }
  const [editValue, setEditValue] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')

  const [pendingDeleteTrick, setPendingDeleteTrick] = useState(null) // { id, name }
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchData = async () => {
    if (!user?.id || !spot?.id) { setLoading(false); return }
    setLoading(true)
    // trick_list_spots is owner-only RLS, so this select naturally returns
    // only rows for lists this user owns — no client-side filtering needed.
    const [listsRes, membershipRes, tricksRes] = await Promise.all([
      supabase.from('trick_lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('trick_list_spots').select('list_id').eq('spot_id', spot.id),
      supabase.from('user_tricks').select('*').eq('user_id', user.id).eq('spot_id', spot.id),
    ])
    setTrickLists(listsRes.data || [])
    setMemberListIds(new Set((membershipRes.data || []).map(r => r.list_id)))
    setSpotTricks(tricksRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [user?.id, spot?.id])

  const toggleListMembership = async (list) => {
    setListError('')
    const inList = memberListIds.has(list.id)
    if (inList) {
      // Targeted delete — row is known to exist (memberListIds has it), so
      // an empty result means the delete was blocked, not that there was
      // nothing to remove.
      const { data, error } = await supabase.from('trick_list_spots').delete().eq('list_id', list.id).eq('spot_id', spot.id).select()
      if (error || !data || data.length === 0) {
        console.error('[AddToTrickListSheet] remove spot from list failed:', error)
        setListError('Could not remove this spot from the list. Try again.')
        return
      }
      setMemberListIds(prev => { const s = new Set(prev); s.delete(list.id); return s })
    } else {
      const { data, error } = await supabase.from('trick_list_spots').insert({ list_id: list.id, spot_id: spot.id }).select().single()
      if (error || !data) {
        console.error('[AddToTrickListSheet] add spot to list failed:', error)
        setListError(error?.code === '23505' ? 'This spot is already in that list.' : 'Could not add this spot to the list. Try again.')
        return
      }
      setMemberListIds(prev => new Set([...prev, list.id]))
    }
    notifyTricksChanged()
  }

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id || creatingList) return
    setCreatingList(true)
    setListError('')
    const { data, error } = await supabase.from('trick_lists').insert({ user_id: user.id, name: newListName.trim() }).select()
    if (error || !data || data.length === 0) {
      console.error('[AddToTrickListSheet] handleCreateList failed:', error)
      setCreatingList(false)
      setListError('Could not create this list. Try again.')
      return
    }
    const newList = data[0]
    // Create-and-add in one action, same shape as SaveToListModal.jsx's own createList.
    const { data: spotRow, error: spotError } = await supabase.from('trick_list_spots').insert({ list_id: newList.id, spot_id: spot.id }).select().single()
    setCreatingList(false)
    setTrickLists(prev => [newList, ...prev])
    if (!spotError && spotRow) {
      setMemberListIds(prev => new Set([...prev, newList.id]))
    } else {
      console.error('[AddToTrickListSheet] add spot to new list failed:', spotError)
      setListError('List created, but the spot could not be added to it. Try again.')
    }
    setNewListName('')
    setShowCreateList(false)
    notifyTricksChanged()
  }

  const addPendingName = () => {
    const trimmed = nameInput.trim().slice(0, NAME_MAX)
    if (!trimmed) return
    if (pendingNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) { setNameInput(''); return }
    setPendingNames(prev => [...prev, trimmed])
    setNameInput('')
  }

  const removePendingName = (name) => setPendingNames(prev => prev.filter(n => n !== name))

  // Inserted as one batch — "in one go" — so a single 23505 (one of these
  // names already exists at this spot) rolls the whole insert back; the
  // specific duplicate isn't worth identifying here since the user can
  // just re-add the rest individually. No list_id — user_tricks is unique
  // on (user_id, spot_id, name) only now.
  const handleAddTricks = async () => {
    if (pendingNames.length === 0 || adding || !user?.id) return
    setAdding(true)
    setAddError('')
    const { data, error } = await supabase
      .from('user_tricks')
      .insert(pendingNames.map(name => ({ user_id: user.id, spot_id: spot.id, name })))
      .select()
    setAdding(false)
    if (error || !data || data.length === 0) {
      console.error('[AddToTrickListSheet] handleAddTricks failed:', error)
      setAddError(error?.code === '23505' ? 'One of those tricks already exists at this spot.' : 'Could not add these tricks. Try again.')
      return
    }
    setSpotTricks(prev => [...prev, ...data])
    setPendingNames([])
    notifyTricksChanged()
  }

  const openEdit = (trick) => {
    setEditError('')
    setEditValue(trick.name)
    setEditingTrick(trick)
  }

  const handleEditSave = async () => {
    if (!editingTrick || !editValue.trim() || editing) return
    setEditing(true)
    setEditError('')
    const { data, error } = await supabase.from('user_tricks').update({ name: editValue.trim() }).eq('id', editingTrick.id).select().single()
    setEditing(false)
    if (error || !data) {
      console.error('[AddToTrickListSheet] handleEditSave failed:', error)
      setEditError(error?.code === '23505' ? 'A trick with that name already exists at this spot.' : 'Could not rename this trick. Try again.')
      return
    }
    setSpotTricks(prev => prev.map(t => (t.id === editingTrick.id ? { ...t, name: data.name } : t)))
    setEditingTrick(null)
    setEditValue('')
  }

  // Existing confirm-dialog pattern — closes (with the slide-out animation)
  // in both outcomes.
  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setDeleteError('')
    setTimeout(() => { setDeleteClosing(false); setPendingDeleteTrick(null) }, 180)
  }

  const confirmDeleteTrick = async () => {
    if (!pendingDeleteTrick) return
    const id = pendingDeleteTrick.id
    setDeleting(true)
    const { data, error } = await supabase.from('user_tricks').delete().eq('id', id).select()
    if (error || !data || data.length === 0) {
      console.error('[AddToTrickListSheet] confirmDeleteTrick failed:', error)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this trick. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    setDeleting(false)
    setSpotTricks(prev => prev.filter(t => t.id !== id))
    notifyTricksChanged()
    closeDeleteConfirm()
  }

  if (!user) {
    return createPortal(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-title" style={{ padding: '0 16px' }}>Add To Trick List</div>
          <div style={{ padding: '0 20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Sign in to track tricks you've landed.
            </div>
          </div>
          <div className="modal-cancel" onClick={() => { onClose?.(); onGoProfile?.() }}>Sign In</div>
        </div>
      </div>,
      document.body
    )
  }

  const sortedSpotTricks = sortTricks(spotTricks)

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-handle" />
        <div className="modal-title" style={{ padding: '0 20px' }}>Add To Trick List</div>

        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {/* Tricks already at this spot — these are the user's, not tied
              to any one list, so no per-trick list label anymore. */}
          {!loading && sortedSpotTricks.length > 0 && (
            <div style={{ padding: '0 20px 14px' }}>
              <div className="section-label">Your Tricks Here</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedSpotTricks.map(trick => (
                  <div key={trick.id} style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <TrickCheckmark landed={trick.landed} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {trick.name}
                      </div>
                      {trick.landed && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                          Landed {formatLandedDate(trick.landed_at)}
                        </div>
                      )}
                    </div>
                    <IconBox size={30} onClick={() => openEdit(trick)}>
                      <PencilIcon color="#d4785a" />
                    </IconBox>
                    <IconBox size={30} onClick={() => { setDeleteError(''); setPendingDeleteTrick({ id: trick.id, name: trick.name }) }}>
                      <CloseIcon color="#d4785a" />
                    </IconBox>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="divider" style={{ margin: '0 20px 14px' }} />

          {/* Which of the user's own trick lists this spot belongs to —
              multi-select (a spot can be in any number of lists), toggled
              via trick_list_spots. */}
          <div style={{ padding: '0 20px 14px' }}>
            <div className="section-label">Add This Spot To</div>
            {!loading && trickLists.map(list => {
              const selected = memberListIds.has(list.id)
              return (
                <div
                  key={list.id}
                  onClick={() => toggleListMembership(list)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: selected ? '1.5px solid #d4785a' : '1px solid #EAD8C8', background: selected ? '#f5e6e0' : '#fff', cursor: 'pointer', marginBottom: 8 }}
                >
                  <ListIcon color="#d4785a" size={16} filled />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</span>
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7L5.5 10.5L11.5 3.5" stroke="#d4785a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              )
            })}

            {listError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 8 }}>{listError}</div>}

            {showCreateList ? (
              <div style={{ border: '1.5px solid #d4785a', borderRadius: 8, padding: 12 }}>
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
                  <button className="btn-salmon" onClick={handleCreateList} disabled={creatingList} style={{ flex: 1, padding: 10 }}>
                    {creatingList ? 'Creating...' : 'Create'}
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
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d4785a', cursor: 'pointer' }}
              >
                <PlusIcon color="#d4785a" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#d4785a' }}>Create New List</span>
              </div>
            )}
          </div>

          {/* Trick names to add — batched, inserted together */}
          <div style={{ padding: '0 20px 14px' }}>
            <div className="section-label">Tricks To Add</div>
            {pendingNames.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {pendingNames.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', borderRadius: 20, padding: '5px 8px 5px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{name}</span>
                    <span onClick={() => removePendingName(name)} style={{ cursor: 'pointer', color: '#d4785a', fontSize: 13, lineHeight: 1 }}>✕</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Trick name..."
                value={nameInput}
                onChange={e => setNameInput(e.target.value.slice(0, NAME_MAX))}
                maxLength={NAME_MAX}
                onKeyDown={e => { if (e.key === 'Enter') addPendingName() }}
                style={{ flex: 1 }}
              />
              <button
                className="btn-salmon"
                onClick={addPendingName}
                disabled={!nameInput.trim()}
                style={{ width: 'auto', padding: '0 18px', opacity: !nameInput.trim() ? 0.5 : 1 }}
              >
                Add
              </button>
            </div>

            {addError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 8 }}>{addError}</div>}

            <button
              className="btn-salmon"
              onClick={handleAddTricks}
              disabled={pendingNames.length === 0 || adding}
              style={{ marginTop: 10, opacity: pendingNames.length === 0 || adding ? 0.5 : 1 }}
            >
              {adding
                ? 'Adding...'
                : pendingNames.length === 0
                  ? 'Add Tricks'
                  : `Add ${pendingNames.length} Trick${pendingNames.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>

        {/* Edit trick name */}
        {editingTrick && createPortal(
          <div className="modal-overlay" onClick={() => setEditingTrick(null)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="modal-handle" />
              <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rename Trick</div>
              <div style={{ padding: '0 16px 12px' }}>
                <input
                  className="form-input"
                  placeholder="Trick name..."
                  value={editValue}
                  onChange={e => setEditValue(e.target.value.slice(0, NAME_MAX))}
                  maxLength={NAME_MAX}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleEditSave() }}
                />
                {editError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{editError}</div>}
              </div>
              <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={handleEditSave} disabled={editing || !editValue.trim()} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: editing || !editValue.trim() ? 0.6 : 1 }}>
                  {editing ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditingTrick(null)} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Delete trick confirmation — existing confirm-dialog pattern,
            closes via closeDeleteConfirm in both outcomes. */}
        {(pendingDeleteTrick || deleteClosing) && createPortal(
          <div className="modal-overlay" onClick={closeDeleteConfirm}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
              <div className="modal-handle" />
              <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete Trick</div>
              <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Remove "{pendingDeleteTrick?.name}" from your trick list? This cannot be undone.
              </div>
              <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={confirmDeleteTrick} disabled={deleting} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleting ? 0.7 : 1 }}>
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button onClick={closeDeleteConfirm} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {deleteError && createPortal(
          <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#FFFFFF', border: '1px solid #EAD8C8', color: '#e07070', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {deleteError}
          </div>,
          document.body
        )}
      </div>
    </div>,
    document.body
  )
}
