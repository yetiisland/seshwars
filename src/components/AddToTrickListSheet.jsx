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

// Replaces the old inline "Your Tricks" section on the spot page (see
// SpotDetail.jsx) — same spot-scoped trick management, but across every
// list the user has, in one bottom sheet opened from ADD TO TRICK LIST.
export default function AddToTrickListSheet({ spot, user, onClose, onViewTrickList, onGoProfile }) {
  const [trickLists, setTrickLists] = useState([])
  const [spotTricks, setSpotTricks] = useState([]) // this user's tricks at this spot, any list
  const [loading, setLoading] = useState(true)
  const [selectedListId, setSelectedListId] = useState(null)

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
    const [listsRes, tricksRes] = await Promise.all([
      supabase.from('trick_lists').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('user_tricks').select('*').eq('user_id', user.id).eq('spot_id', spot.id),
    ])
    const lists = listsRes.data || []
    setTrickLists(lists)
    const listMap = {}
    for (const l of lists) listMap[l.id] = l.name
    setSpotTricks((tricksRes.data || []).map(t => ({ ...t, listName: listMap[t.list_id] || '' })))
    setSelectedListId(prev => prev && lists.some(l => l.id === prev) ? prev : (lists[0]?.id || null))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [user?.id, spot?.id])

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id || creatingList) return
    setCreatingList(true)
    setAddError('')
    const { data, error } = await supabase.from('trick_lists').insert({ user_id: user.id, name: newListName.trim() }).select()
    setCreatingList(false)
    if (error || !data || data.length === 0) {
      console.error('[AddToTrickListSheet] handleCreateList failed:', error)
      setAddError('Could not create this list. Try again.')
      return
    }
    setTrickLists(prev => [...prev, data[0]])
    setSelectedListId(data[0].id)
    setNewListName('')
    setShowCreateList(false)
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
  // names already exists at this spot in this list) rolls the whole insert
  // back; the specific duplicate isn't worth identifying here since the
  // user can just re-add the rest individually.
  const handleAddTricks = async () => {
    if (!selectedListId || pendingNames.length === 0 || adding || !user?.id) return
    setAdding(true)
    setAddError('')
    const { data, error } = await supabase
      .from('user_tricks')
      .insert(pendingNames.map(name => ({ user_id: user.id, spot_id: spot.id, list_id: selectedListId, name })))
      .select()
    setAdding(false)
    if (error || !data || data.length === 0) {
      console.error('[AddToTrickListSheet] handleAddTricks failed:', error)
      setAddError(error?.code === '23505' ? 'One of those tricks already exists at this spot in that list.' : 'Could not add these tricks. Try again.')
      return
    }
    const listName = trickLists.find(l => l.id === selectedListId)?.name || ''
    setSpotTricks(prev => [...prev, ...data.map(t => ({ ...t, listName }))])
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
      setEditError(error?.code === '23505' ? 'A trick with that name already exists in that list.' : 'Could not rename this trick. Try again.')
      return
    }
    setSpotTricks(prev => prev.map(t => (t.id === editingTrick.id ? { ...t, name: data.name } : t)))
    setEditingTrick(null)
    setEditValue('')
  }

  // Existing confirm-dialog pattern — closes (with the slide-out animation)
  // in both outcomes, same as SavedView.jsx's "Delete List" and
  // TrickListPage.jsx's "Delete List".
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

  const handleViewList = () => {
    if (!selectedListId) return
    onClose?.()
    onViewTrickList?.(selectedListId)
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
          {/* Tricks already at this spot, across every list */}
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
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {trick.listName}
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

          {/* Choose or create a list */}
          <div style={{ padding: '0 20px 14px' }}>
            <div className="section-label">Add To</div>
            {!loading && trickLists.map(list => {
              const selected = selectedListId === list.id
              return (
                <div
                  key={list.id}
                  onClick={() => setSelectedListId(list.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: selected ? '1.5px solid #d4785a' : '1px solid #EAD8C8', background: selected ? '#f5e6e0' : '#fff', cursor: 'pointer', marginBottom: 8 }}
                >
                  <ListIcon color="#d4785a" size={16} filled />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</span>
                </div>
              )
            })}

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
              disabled={!selectedListId || pendingNames.length === 0 || adding}
              style={{ marginTop: 10, opacity: !selectedListId || pendingNames.length === 0 || adding ? 0.5 : 1 }}
            >
              {adding
                ? 'Adding...'
                : pendingNames.length === 0
                  ? 'Add Tricks'
                  : `Add ${pendingNames.length} Trick${pendingNames.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>

        <div style={{ padding: '4px 16px 0' }}>
          <button
            onClick={handleViewList}
            disabled={!selectedListId}
            style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: !selectedListId ? 0.5 : 1 }}
          >
            View Trick List
          </button>
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
