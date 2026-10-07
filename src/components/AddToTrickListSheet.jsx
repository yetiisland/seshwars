import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { sortTricks } from '../lib/trickSort'
import TrickCheckmark from './TrickCheckmark'
import { CloseIcon, PlusIcon, IconBox } from './Icons'

const NAME_MAX = 60

function notifyTricksChanged() {
  window.dispatchEvent(new Event('seshwars:tricks-changed'))
}

function formatLandedDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

function tempId() {
  return `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Matches SaveToListModal.jsx's SquareToggle exactly — duplicated locally,
// same pattern already repeated in SendToFriendsSheet.jsx / TrickListPage.jsx.
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

function BackArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9 2L4 7L9 12" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// Two-step draft form inside ONE bottom sheet. Trick lists are collections
// of spots (trick_list_spots), and tricks belong to the user+spot, not to
// a list (user_tricks.list_id is deprecated — never read or written here).
// Step 1 edits the tricks landed at this spot; step 2 picks which of the
// user's own trick lists this spot belongs to. Everything is held in local
// draft state — nothing is written to Supabase until SAVE on step 2 — so
// closing the sheet from either step naturally discards the whole draft
// (this component just unmounts with no persisted side effects).
export default function AddToTrickListSheet({ spot, user, onClose, onGoProfile }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(true)

  // Step 1 draft: tricks at this spot. Each entry carries isNew/isDeleted/
  // original* flags so the save handler can derive exactly which writes are
  // needed straight from this array, with no separate diffing structure.
  const [draftTricks, setDraftTricks] = useState([])

  const [nameInput, setNameInput] = useState('')
  const [addError, setAddError] = useState('')
  const addInputRef = useRef(null)

  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState('')
  const editInputRef = useRef(null)

  const [pendingDeleteTrick, setPendingDeleteTrick] = useState(null) // { id, name }
  const [deleteClosing, setDeleteClosing] = useState(false)

  // Step 2 draft: list membership
  const [trickLists, setTrickLists] = useState([]) // existing lists the user owns: { id, name }
  const [originalMemberListIds, setOriginalMemberListIds] = useState(new Set())
  const [existingListChecked, setExistingListChecked] = useState(new Set())
  const [draftNewLists, setDraftNewLists] = useState([]) // { id: tempId, name, checked }
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    async function fetchData() {
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
      const memberIds = new Set((membershipRes.data || []).map(r => r.list_id))
      setOriginalMemberListIds(memberIds)
      setExistingListChecked(new Set(memberIds))
      setDraftTricks((tricksRes.data || []).map(t => ({
        id: t.id,
        name: t.name,
        landed: t.landed,
        landed_at: t.landed_at,
        created_at: t.created_at,
        isNew: false,
        isDeleted: false,
        originalName: t.name,
        originalLanded: t.landed,
      })))
      setLoading(false)
    }
    fetchData()
  }, [user?.id, spot?.id])

  const visibleTricks = sortTricks(draftTricks.filter(t => !t.isDeleted))

  const nameTakenAtDraft = (name, excludeId) => draftTricks.some(
    t => !t.isDeleted && t.id !== excludeId && t.name.toLowerCase() === name.toLowerCase()
  )

  // ---- Step 1 handlers (all draft-only, no writes) ----

  const addDraftTrick = () => {
    const trimmed = nameInput.trim().slice(0, NAME_MAX)
    if (!trimmed) return
    if (nameTakenAtDraft(trimmed, null)) {
      setAddError('You already have a trick with that name at this spot.')
      addInputRef.current?.focus()
      return
    }
    setAddError('')
    setDraftTricks(prev => [...prev, {
      id: tempId(),
      name: trimmed,
      landed: false,
      landed_at: null,
      created_at: new Date().toISOString(),
      isNew: true,
      isDeleted: false,
      originalName: trimmed,
      originalLanded: false,
    }])
    setNameInput('')
    addInputRef.current?.focus()
  }

  const toggleDraftLanded = (id) => {
    setDraftTricks(prev => prev.map(t => t.id === id
      ? { ...t, landed: !t.landed, landed_at: !t.landed ? new Date().toISOString() : null }
      : t
    ))
  }

  const openEdit = (trick) => {
    setEditError('')
    setEditValue(trick.name)
    setEditingId(trick.id)
  }

  const commitEdit = () => {
    if (editingId == null) return
    const trimmed = editValue.trim().slice(0, NAME_MAX)
    if (!trimmed) { setEditingId(null); setEditError(''); return }
    if (nameTakenAtDraft(trimmed, editingId)) {
      setEditError('You already have a trick with that name at this spot.')
      editInputRef.current?.focus()
      return
    }
    setDraftTricks(prev => prev.map(t => t.id === editingId ? { ...t, name: trimmed } : t))
    setEditingId(null)
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditError('')
  }

  // Existing confirm-dialog pattern — closes (with the slide-out animation)
  // in both outcomes. This removal is draft-only; the real delete happens
  // on SAVE.
  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setTimeout(() => { setDeleteClosing(false); setPendingDeleteTrick(null) }, 180)
  }

  const confirmDeleteTrick = () => {
    if (!pendingDeleteTrick) return
    setDraftTricks(prev => prev.map(t => t.id === pendingDeleteTrick.id ? { ...t, isDeleted: true } : t))
    if (editingId === pendingDeleteTrick.id) { setEditingId(null); setEditError('') }
    closeDeleteConfirm()
  }

  // ---- Step 2 handlers (all draft-only, no writes) ----

  const toggleExistingList = (listId) => {
    setExistingListChecked(prev => {
      const s = new Set(prev)
      if (s.has(listId)) s.delete(listId); else s.add(listId)
      return s
    })
  }

  const toggleNewList = (id) => {
    setDraftNewLists(prev => prev.map(l => l.id === id ? { ...l, checked: !l.checked } : l))
  }

  const commitNewList = () => {
    const trimmed = newListName.trim()
    if (!trimmed) { setShowCreateList(false); setNewListName(''); return }
    setDraftNewLists(prev => [...prev, { id: tempId(), name: trimmed, checked: true }])
    setNewListName('')
    setShowCreateList(false)
  }

  const anyListChecked = existingListChecked.size > 0 || draftNewLists.some(l => l.checked)

  // ---- Save — sequential, verified, stop at the first failure ----
  const handleSave = async () => {
    if (!anyListChecked || saving) return
    setSaving(true)
    setSaveError('')

    // 1. Create new lists
    const createdListIdByTempId = new Map()
    for (const l of draftNewLists) {
      const { data, error } = await supabase.from('trick_lists').insert({ user_id: user.id, name: l.name }).select().single()
      if (error || !data) {
        console.error('[AddToTrickListSheet] create list failed:', error)
        setSaveError(`Could not create list "${l.name}". Try again.`)
        setSaving(false)
        return
      }
      createdListIdByTempId.set(l.id, data.id)
    }

    // 2. Insert new tricks (final landed state included directly — a
    // brand-new trick's landed state is part of its initial row, not a
    // change to an existing one, so it doesn't need a separate pass below)
    const newTricks = draftTricks.filter(t => t.isNew && !t.isDeleted)
    if (newTricks.length > 0) {
      const { data, error } = await supabase
        .from('user_tricks')
        .insert(newTricks.map(t => ({ user_id: user.id, spot_id: spot.id, name: t.name, landed: t.landed, landed_at: t.landed_at })))
        .select()
      if (error || !data || data.length !== newTricks.length) {
        console.error('[AddToTrickListSheet] insert new tricks failed:', error)
        setSaveError(error?.code === '23505' ? 'One of your new tricks already exists at this spot.' : 'Could not add your new tricks. Try again.')
        setSaving(false)
        return
      }
    }

    // 3. Apply renames (existing tricks only)
    const renamed = draftTricks.filter(t => !t.isNew && !t.isDeleted && t.name !== t.originalName)
    for (const t of renamed) {
      const { data, error } = await supabase.from('user_tricks').update({ name: t.name }).eq('id', t.id).select().single()
      if (error || !data) {
        console.error('[AddToTrickListSheet] rename trick failed:', error)
        setSaveError(error?.code === '23505' ? `Could not rename "${t.originalName}" — that name is already in use.` : `Could not rename "${t.originalName}". Try again.`)
        setSaving(false)
        return
      }
    }

    // 4. Apply landed changes (existing tricks only)
    const landedChanged = draftTricks.filter(t => !t.isNew && !t.isDeleted && t.landed !== t.originalLanded)
    for (const t of landedChanged) {
      const { data, error } = await supabase.from('user_tricks').update({ landed: t.landed, landed_at: t.landed_at }).eq('id', t.id).select().single()
      if (error || !data) {
        console.error('[AddToTrickListSheet] update landed failed:', error)
        setSaveError(`Could not update "${t.name}". Try again.`)
        setSaving(false)
        return
      }
    }

    // 5. Delete removed tricks (existing rows only — a trick that was both
    // added and deleted within this same draft never existed server-side,
    // so there's nothing to delete for it)
    const deletedExisting = draftTricks.filter(t => t.isDeleted && !t.isNew)
    if (deletedExisting.length > 0) {
      const { data, error } = await supabase.from('user_tricks').delete().in('id', deletedExisting.map(t => t.id)).select()
      if (error || !data || data.length !== deletedExisting.length) {
        console.error('[AddToTrickListSheet] delete tricks failed:', error)
        setSaveError('Could not delete some tricks. Try again.')
        setSaving(false)
        return
      }
    }

    // 6. Insert trick_list_spots for newly checked lists — existing lists
    // newly checked, plus every checked new list
    const newlyCheckedExisting = [...existingListChecked].filter(id => !originalMemberListIds.has(id))
    const checkedNewListIds = draftNewLists.filter(l => l.checked).map(l => createdListIdByTempId.get(l.id))
    const toInsertListIds = [...newlyCheckedExisting, ...checkedNewListIds]
    if (toInsertListIds.length > 0) {
      const { data, error } = await supabase
        .from('trick_list_spots')
        .insert(toInsertListIds.map(listId => ({ list_id: listId, spot_id: spot.id })))
        .select()
      if (error || !data || data.length !== toInsertListIds.length) {
        console.error('[AddToTrickListSheet] insert trick_list_spots failed:', error)
        setSaveError(error?.code === '23505' ? 'This spot is already in one of those lists.' : 'Could not add this spot to the selected lists. Try again.')
        setSaving(false)
        return
      }
    }

    // 7. Delete trick_list_spots for newly unchecked (existing) lists —
    // bulk delete of rows known to exist (they came from originalMemberListIds)
    const newlyUncheckedExisting = [...originalMemberListIds].filter(id => !existingListChecked.has(id))
    if (newlyUncheckedExisting.length > 0) {
      const { data, error } = await supabase
        .from('trick_list_spots')
        .delete()
        .eq('spot_id', spot.id)
        .in('list_id', newlyUncheckedExisting)
        .select()
      if (error || !data || data.length !== newlyUncheckedExisting.length) {
        console.error('[AddToTrickListSheet] delete trick_list_spots failed:', error)
        setSaveError('Could not remove this spot from some lists. Try again.')
        setSaving(false)
        return
      }
    }

    setSaving(false)
    notifyTricksChanged()
    onClose()
  }

  if (!user) {
    return createPortal(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-title" style={{ padding: '0 16px' }}>Trick List</div>
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

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-handle" />

        {/* Two-step form — steps swap in place with a horizontal slide,
            never a second sheet. */}
        <div style={{ overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: '200%', flex: 1, minHeight: 0, transform: `translateX(${step === 1 ? '0%' : '-50%'})`, transition: 'transform 250ms ease' }}>

            {/* Step 1 — Trick List */}
            <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="modal-title" style={{ padding: '0 20px' }}>Trick List</div>

              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 20px 14px' }}>
                <div className="section-label">Tricks at this spot</div>
                {loading ? null : visibleTricks.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>No tricks at this spot yet.</div>
                ) : (
                  <div style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6 }}>
                    {visibleTricks.map((trick, i) => (
                      <div key={trick.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i > 0 ? '1px solid #ECEDF2' : 'none' }}>
                        <TrickCheckmark landed={trick.landed} onClick={() => toggleDraftLanded(trick.id)} />
                        {editingId === trick.id ? (
                          <>
                            <input
                              ref={editInputRef}
                              className="form-input"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); else if (e.key === 'Escape') cancelEdit() }}
                              onBlur={commitEdit}
                              autoFocus
                              maxLength={NAME_MAX}
                              style={{ flex: 1, padding: '8px 10px', fontSize: 13 }}
                            />
                            <IconBox
                              size={30}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => { setPendingDeleteTrick({ id: trick.id, name: trick.name }) }}
                            >
                              <CloseIcon color="#d4785a" />
                            </IconBox>
                          </>
                        ) : (
                          <div onClick={() => openEdit(trick)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {trick.name}
                            </div>
                            {trick.landed && (
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                                Landed {formatLandedDate(trick.landed_at)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {editError && (
                  <div style={{ padding: '8px 2px 0', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{editError}</div>
                )}
              </div>

              <div style={{ padding: '0 20px', display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  ref={addInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraftTrick() } }}
                  placeholder="Add a trick"
                  maxLength={NAME_MAX}
                  style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--salmon)', borderRadius: 6, padding: '10px 12px', fontSize: 16, fontFamily: 'Barlow, sans-serif', color: 'var(--text-primary)', background: '#FFFFFF' }}
                />
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={addDraftTrick}
                  style={{ width: 44, flexShrink: 0, border: 'none', borderRadius: 6, background: 'var(--salmon)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <PlusIcon color="#fff" />
                </button>
              </div>
              {addError && (
                <div style={{ padding: '8px 20px 0', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{addError}</div>
              )}

              <div style={{ padding: '14px 20px 0' }}>
                <button className="btn-salmon" onClick={() => setStep(2)}>Next</button>
              </div>
            </div>

            {/* Step 2 — Add To Lists */}
            <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', marginBottom: 12 }}>
                <div
                  onClick={() => setStep(1)}
                  style={{ cursor: 'pointer', width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <BackArrow />
                </div>
                <div style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Add To Lists
                </div>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 20px 14px' }}>
                <div style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6 }}>
                  {trickLists.map((list, i) => (
                    <div
                      key={list.id}
                      onClick={() => toggleExistingList(list.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i > 0 ? '1px solid #ECEDF2' : 'none', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {list.name}
                      </div>
                      <SquareToggle selected={existingListChecked.has(list.id)} />
                    </div>
                  ))}
                  {draftNewLists.map((list, i) => (
                    <div
                      key={list.id}
                      onClick={() => toggleNewList(list.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: (trickLists.length > 0 || i > 0) ? '1px solid #ECEDF2' : 'none', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {list.name}
                      </div>
                      <SquareToggle selected={list.checked} />
                    </div>
                  ))}
                  {showCreateList ? (
                    <div style={{ padding: '10px 14px', borderTop: (trickLists.length > 0 || draftNewLists.length > 0) ? '1px solid #ECEDF2' : 'none' }}>
                      <input
                        className="form-input"
                        placeholder="List name"
                        value={newListName}
                        onChange={e => setNewListName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') commitNewList(); else if (e.key === 'Escape') { setShowCreateList(false); setNewListName('') } }}
                        onBlur={commitNewList}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div
                      onClick={() => setShowCreateList(true)}
                      style={{ display: 'flex', alignItems: 'center', padding: '13px 14px', borderTop: (trickLists.length > 0 || draftNewLists.length > 0) ? '1px solid #ECEDF2' : 'none', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--salmon)' }}>+ Create new list</span>
                    </div>
                  )}
                </div>
              </div>

              {saveError && (
                <div style={{ padding: '0 20px 10px', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{saveError}</div>
              )}
              <div style={{ padding: '0 20px' }}>
                <button
                  className="btn-salmon"
                  onClick={handleSave}
                  disabled={!anyListChecked || saving}
                  style={{ opacity: (!anyListChecked || saving) ? 0.5 : 1 }}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete trick confirmation — existing confirm-dialog pattern, always
          closes via closeDeleteConfirm. Draft-only removal; the trick is
          only actually deleted server-side on SAVE. */}
      {(pendingDeleteTrick || deleteClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Remove Trick</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Remove "{pendingDeleteTrick?.name}" from your trick list?
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={confirmDeleteTrick} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                Remove
              </button>
              <button onClick={closeDeleteConfirm} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>,
    document.body
  )
}
