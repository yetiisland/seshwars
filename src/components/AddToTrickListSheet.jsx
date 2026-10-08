import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { sortTricks } from '../lib/trickSort'
import TrickCheckmark from './TrickCheckmark'
import { PlusIcon, IconBox, MoreIcon, ListIcon } from './Icons'

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

// Matches SaveToListModal.jsx's BookmarkSVG icon-box exactly (same 34x34
// box, same salmon tint/border), with the bookmark glyph swapped for the
// plain list icon since these rows are trick lists, not saved-spot lists.
function TrickListIconBox({ filled }) {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <ListIcon color="#d4785a" size={14} filled={filled} />
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
// Step 1 edits the tricks landed at this spot (with a nested options pane
// for rename/delete, reached via each row's three-dot icon — same sliding
// mechanism as the step1/step2 swap, never a second sheet); step 2 picks
// which of the user's own trick lists this spot belongs to. Everything is
// held in local draft state — nothing is written to Supabase until SAVE on
// step 2 — so closing the sheet from either step naturally discards the
// whole draft (this component just unmounts with no persisted side effects).
//
// `initialData` ({ trickLists, memberListIds, tricks }) is fetched by the
// parent as soon as the spot page itself loads (not when this sheet opens)
// and used here only as the seed for lazy useState initializers — so the
// very first render already has its final content height, and the sheet's
// transform-only slide-up animation never has to grow mid-flight.
export default function AddToTrickListSheet({ spot, user, initialData, onClose, onGoProfile }) {
  const [step, setStep] = useState(1)

  // Step 1 draft: tricks at this spot. Each entry carries isNew/isDeleted/
  // original* flags so the save handler can derive exactly which writes are
  // needed straight from this array, with no separate diffing structure.
  const [draftTricks, setDraftTricks] = useState(() => (initialData?.tricks || []).map(t => ({
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
  // Sort order is captured once, at open — toggling landed must never move
  // a row while the sheet is open, only a fresh open re-sorts.
  const [orderIds] = useState(() => sortTricks((initialData?.tricks || []).map(t => ({ id: t.id, landed: t.landed, landed_at: t.landed_at, created_at: t.created_at }))).map(t => t.id))

  const [nameInput, setNameInput] = useState('')
  const [addError, setAddError] = useState('')
  const addInputRef = useRef(null)

  // Trick options — three-dot menu per row, swapped into this same sheet
  // (nested pane inside step 1, same slide mechanism as step1<->step2).
  const [optionsTrick, setOptionsTrick] = useState(null) // { id, name }
  const [optionsMode, setOptionsMode] = useState('menu') // 'menu' | 'rename'
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')

  const [pendingDeleteTrick, setPendingDeleteTrick] = useState(null) // { id, name }
  const [deleteClosing, setDeleteClosing] = useState(false)

  // Step 2 draft: list membership
  const [trickLists] = useState(() => initialData?.trickLists || [])
  const [originalMemberListIds] = useState(() => new Set(initialData?.memberListIds || []))
  const [existingListChecked, setExistingListChecked] = useState(() => new Set(initialData?.memberListIds || []))
  const [draftNewLists, setDraftNewLists] = useState([]) // { id: tempId, name, checked }
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Pre-existing tricks render in their captured open-time order; any
  // trick added during this session is appended after them, in creation
  // order — neither group ever reorders from a landed toggle or rename.
  const orderedTricks = (() => {
    const byId = new Map(draftTricks.filter(t => !t.isDeleted).map(t => [t.id, t]))
    const ordered = []
    for (const id of orderIds) {
      if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id) }
    }
    for (const t of draftTricks) {
      if (byId.has(t.id)) ordered.push(t)
    }
    return ordered
  })()

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

  // ---- Trick options (nested pane) ----

  const openOptions = (trick) => {
    setOptionsMode('menu')
    setRenameError('')
    setOptionsTrick({ id: trick.id, name: trick.name })
  }

  const closeOptions = () => {
    setOptionsTrick(null)
    setOptionsMode('menu')
    setRenameValue('')
    setRenameError('')
  }

  const commitRename = () => {
    if (!optionsTrick) return
    const trimmed = renameValue.trim().slice(0, NAME_MAX)
    if (!trimmed) return
    if (nameTakenAtDraft(trimmed, optionsTrick.id)) {
      setRenameError('You already have a trick with that name at this spot.')
      return
    }
    setDraftTricks(prev => prev.map(t => t.id === optionsTrick.id ? { ...t, name: trimmed } : t))
    closeOptions()
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
    closeDeleteConfirm()
    closeOptions()
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
    if (!trimmed) return
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

  const noTricksYet = orderedTricks.length === 0
  const addDisabled = !nameInput.trim()

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-handle" />

        {/* Two-step form — steps swap in place with a horizontal slide
            (transform only), never a second sheet. */}
        <div style={{ overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: '200%', flex: 1, minHeight: 0, transform: `translateX(${step === 1 ? '0%' : '-50%'})`, transition: 'transform 250ms ease' }}>

            {/* Step 1 — Trick List (itself a nested two-pane slide: tricks <-> trick options) */}
            <div style={{ width: '50%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', width: '200%', flex: 1, minHeight: 0, transform: `translateX(${optionsTrick ? '-50%' : '0%'})`, transition: 'transform 250ms ease' }}>

                {/* Tricks pane */}
                <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div className="modal-title" style={{ padding: '0 20px' }}>Trick List</div>

                  <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 20px 14px' }}>
                    <div className="section-label">Tricks at this spot</div>
                    {noTricksYet ? (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>No tricks at this spot yet.</div>
                    ) : (
                      <div style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6 }}>
                        {orderedTricks.map((trick, i) => (
                          <div key={trick.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i > 0 ? '1px solid #ECEDF2' : 'none' }}>
                            <TrickCheckmark landed={trick.landed} onClick={() => toggleDraftLanded(trick.id)} />
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
                            <IconBox size={30} onClick={() => openOptions(trick)}>
                              <MoreIcon color="#d4785a" />
                            </IconBox>
                          </div>
                        ))}
                      </div>
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
                      disabled={addDisabled}
                      style={{ width: 44, flexShrink: 0, border: 'none', borderRadius: 6, background: 'var(--salmon)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: addDisabled ? 0.5 : 1 }}
                    >
                      <PlusIcon color="#fff" />
                    </button>
                  </div>
                  {addError && (
                    <div style={{ padding: '8px 20px 0', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{addError}</div>
                  )}

                  <div style={{ padding: '14px 20px 0' }}>
                    <button className="btn-salmon" onClick={() => setStep(2)} disabled={noTricksYet} style={{ opacity: noTricksYet ? 0.5 : 1 }}>
                      Save Tricks To List
                    </button>
                  </div>
                </div>

                {/* Trick options pane — rename / delete, reached via each
                    row's three-dot icon; back arrow always returns to the
                    tricks pane, whether showing the menu or the rename input. */}
                <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', marginBottom: 12 }}>
                    <div
                      onClick={closeOptions}
                      style={{ cursor: 'pointer', width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <BackArrow />
                    </div>
                    <div style={{ fontSize: 18, color: 'var(--text-primary)', fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {optionsTrick?.name}
                    </div>
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 20px 14px' }}>
                    {optionsMode === 'menu' ? (
                      <div style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6 }}>
                        <div
                          onClick={() => { setRenameValue(optionsTrick.name); setRenameError(''); setOptionsMode('rename') }}
                          style={{ padding: '13px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}
                        >
                          Rename
                        </div>
                        <div
                          onClick={() => { setPendingDeleteTrick({ id: optionsTrick.id, name: optionsTrick.name }) }}
                          style={{ padding: '13px 14px', borderTop: '1px solid #ECEDF2', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}
                        >
                          Delete Trick
                        </div>
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
                        <button className="btn-salmon" onClick={commitRename} disabled={!renameValue.trim()} style={{ opacity: !renameValue.trim() ? 0.5 : 1 }}>
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 — Add To Lists. Matches SaveToListModal.jsx exactly:
                same modal-row layout/spacing, list icon box, selected-row
                highlight (icon box fill + SquareToggle), Create New List
                row style, and Save button recipe — only the icon (list,
                not bookmark) and the Save button's hard-disable differ. */}
            <div style={{ width: '50%', flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', marginBottom: 12 }}>
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

              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {trickLists.map(list => {
                  const isIn = existingListChecked.has(list.id)
                  return (
                    <div key={list.id} className="modal-row" onClick={() => toggleExistingList(list.id)}>
                      <TrickListIconBox filled={isIn} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{list.name}</div>
                      </div>
                      <SquareToggle selected={isIn} />
                    </div>
                  )
                })}
                {draftNewLists.map(list => (
                  <div key={list.id} className="modal-row" onClick={() => toggleNewList(list.id)}>
                    <TrickListIconBox filled={list.checked} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{list.name}</div>
                    </div>
                    <SquareToggle selected={list.checked} />
                  </div>
                ))}

                {showCreateList ? (
                  <div style={{ padding: '12px 20px' }}>
                    <input
                      className="form-input"
                      placeholder="List name..."
                      value={newListName}
                      onChange={e => setNewListName(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') commitNewList() }}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn-salmon" onClick={commitNewList} style={{ flex: 1, padding: 10 }}>
                        Create
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
                  <div className="modal-row" onClick={() => setShowCreateList(true)}>
                    <div style={{ width: 34, height: 34, borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <line x1="7" y1="2" x2="7" y2="12" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1="2" y1="7" x2="12" y2="7" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Create New List</div>
                  </div>
                )}
              </div>

              {saveError && (
                <div style={{ padding: '8px 14px 0', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{saveError}</div>
              )}
              <div style={{ padding: '10px 14px 0' }}>
                <button
                  onClick={handleSave}
                  disabled={!anyListChecked || saving}
                  style={{
                    width: '100%', padding: 13, borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'Barlow, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                    background: anyListChecked ? '#d4785a' : 'transparent',
                    border: anyListChecked ? 'none' : '1.5px solid #d4785a',
                    color: anyListChecked ? '#fff' : '#d4785a',
                    opacity: anyListChecked ? 1 : 0.5,
                    transition: 'all 0.2s',
                  }}
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
