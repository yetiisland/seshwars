import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { transformImageUrl } from '../utils/imageUrl'
import { sortTricks } from '../lib/trickSort'
import TrickCheckmark from '../components/TrickCheckmark'
import TabBar from '../components/TabBar'
import { ArrowIcon, ListIcon, PencilIcon, CloseIcon, IconBox } from '../components/Icons'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

function notifyTricksChanged() {
  window.dispatchEvent(new Event('seshwars:tricks-changed'))
}

function formatLandedDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

// Detail view — one trick list's tricks. Owns its own back button (returns
// to the list-of-lists, not out of the whole Trick List screen) — same
// split SavedView.jsx uses between its own default view and CollectionView.
function TrickListDetail({ list, user, spots, onSpotClick, onBack, onTabChange, profileAvatar, profileInitials, unreadCount }) {
  const [tricks, setTricks] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchTricks = async () => {
    if (!user?.id || !list?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('user_tricks')
      .select('*')
      .eq('user_id', user.id)
      .eq('list_id', list.id)
      .order('created_at', { ascending: true })
    if (error || !data) { setLoading(false); return }
    const spotIds = [...new Set(data.map(t => t.spot_id))]
    const { data: spotsData } = spotIds.length > 0
      ? await supabase.from('spots').select('id, title, slug, photos').in('id', spotIds)
      : { data: [] }
    const spotMap = {}
    for (const s of spotsData || []) spotMap[s.id] = s
    setTricks(data.map(t => ({
      ...t,
      spotTitle: spotMap[t.spot_id]?.title || null,
      spotSlug: spotMap[t.spot_id]?.slug || null,
      spotPhoto: spotMap[t.spot_id]?.photos?.[0] || null,
    })))
    setLoading(false)
  }

  useEffect(() => { fetchTricks() }, [list?.id, user?.id])

  const toggleLanded = async (trick) => {
    const nextLanded = !trick.landed
    const { data, error } = await supabase
      .from('user_tricks')
      .update({ landed: nextLanded, landed_at: nextLanded ? new Date().toISOString() : null })
      .eq('id', trick.id)
      .select()
      .single()
    if (error || !data) {
      console.error('[TrickListPage] toggleLanded failed:', error)
      return
    }
    setTricks(prev => prev.map(t => (t.id === trick.id ? { ...t, ...data } : t)))
    notifyTricksChanged()
  }

  const handleCardClick = (trick) => {
    const fullSpot = spots?.find(s => s.id === trick.spot_id) || { id: trick.spot_id, slug: trick.spotSlug }
    onSpotClick?.(fullSpot)
  }

  const sorted = sortTricks(tricks)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div onClick={onBack} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px' }}>
          {list.name}
        </div>
        <div style={{ width: 36 }} />
      </div>
      <div className="scroll-area">
        <div style={{ padding: '10px 14px 0', maxWidth: 480, margin: '0 auto' }}>
          {!loading && sorted.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
              No tricks in this list yet. Add tricks from any spot's page.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sorted.map(trick => (
                <div key={trick.id} onClick={() => handleCardClick(trick)} style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <TrickCheckmark landed={trick.landed} onClick={(e) => { e.stopPropagation(); toggleLanded(trick) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trick.name}
                    </div>
                    {trick.spotTitle && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                        {trick.spotTitle}
                      </div>
                    )}
                    {trick.landed && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 1 }}>
                        Landed {formatLandedDate(trick.landed_at)}
                      </div>
                    )}
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: 6, background: '#F0E8DE', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {trick.spotPhoto && (
                      <img src={transformImageUrl(trick.spotPhoto, 80)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>
      {onTabChange && <TabBar active="profile" onChange={onTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} notificationCount={unreadCount} />}
    </div>
  )
}

export default function TrickListPage({ user, spots, onSpotClick, onClose, openListId, onOpenListIdHandled, onTabChange, profileAvatar, profileInitials, unreadCount }) {
  const [trickLists, setTrickLists] = useState([])
  const [listCounts, setListCounts] = useState({}) // list_id -> { landed, total }
  const [loading, setLoading] = useState(true)
  const [openList, setOpenList] = useState(null)
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingList, setRenamingList] = useState(null) // { id, name }
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [pendingDeleteList, setPendingDeleteList] = useState(null) // { id, name }
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const fetchTrickLists = async () => {
    if (!user?.id) { setLoading(false); return }
    setLoading(true)
    const { data: listsData } = await supabase
      .from('trick_lists').select('*').eq('user_id', user.id).order('created_at')
    const counts = {}
    if (listsData?.length > 0) {
      const { data: tricksData } = await supabase
        .from('user_tricks').select('list_id, landed').eq('user_id', user.id)
      for (const t of (tricksData || [])) {
        if (!counts[t.list_id]) counts[t.list_id] = { landed: 0, total: 0 }
        counts[t.list_id].total++
        if (t.landed) counts[t.list_id].landed++
      }
    }
    setTrickLists(listsData || [])
    setListCounts(counts)
    setLoading(false)
  }

  useEffect(() => { fetchTrickLists() }, [user?.id])

  // Live refresh while mounted — same event-refresh approach as
  // SavedView.jsx's list counts (seshwars:lists-changed).
  useEffect(() => {
    const handler = () => fetchTrickLists()
    window.addEventListener('seshwars:tricks-changed', handler)
    return () => window.removeEventListener('seshwars:tricks-changed', handler)
  }, [user?.id])

  // Deep link (VIEW TRICK LIST from a spot page) — open once the matching
  // list has loaded.
  useEffect(() => {
    if (!openListId) return
    const match = trickLists.find(l => l.id === openListId)
    if (!match) return
    setOpenList(match)
    onOpenListIdHandled?.()
  }, [openListId, trickLists])

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id) return
    setCreating(true)
    // A blocked RLS write returns { data: [], error: null } and would look
    // like success if we only checked `error` — chain .select() and require
    // a non-empty result before touching state, matching SavedView.jsx's
    // handleCreateList.
    const { data, error } = await supabase.from('trick_lists').insert({ user_id: user.id, name: newListName.trim() }).select()
    if (!error && data && data.length > 0) {
      setTrickLists(prev => [...prev, data[0]])
    }
    setNewListName('')
    setShowCreateList(false)
    setCreating(false)
  }

  const openRename = (list) => {
    setRenameError('')
    setRenameValue(list.name)
    setRenamingList(list)
  }

  const handleRename = async () => {
    if (!renamingList || !renameValue.trim() || renaming) return
    setRenaming(true)
    setRenameError('')
    const { data, error } = await supabase.from('trick_lists').update({ name: renameValue.trim() }).eq('id', renamingList.id).select()
    setRenaming(false)
    if (error || !data || data.length === 0) {
      console.error('[TrickListPage] handleRename failed:', error)
      setRenameError('Could not rename this list. Try again.')
      return
    }
    setTrickLists(prev => prev.map(l => l.id === renamingList.id ? data[0] : l))
    if (openList?.id === renamingList.id) setOpenList(data[0])
    setRenamingList(null)
    setRenameValue('')
  }

  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setDeleteError('')
    setTimeout(() => { setDeleteClosing(false); setPendingDeleteList(null) }, 180)
  }

  const handleDeleteList = async () => {
    if (!pendingDeleteList) return
    const id = pendingDeleteList.id
    setDeleting(true)
    // user_tricks here deletes every row in this list — a list with no
    // tricks in it legitimately deletes zero rows, so only a real `error`
    // means failure. trick_lists below deletes one specific known-to-exist
    // row by id, so an empty result there does mean the delete was blocked.
    const { error: tricksError } = await supabase.from('user_tricks').delete().eq('list_id', id).select()
    if (tricksError) {
      console.error('[TrickListPage] handleDeleteList: user_tricks delete failed:', tricksError)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this list. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    const { data, error } = await supabase.from('trick_lists').delete().eq('id', id).select()
    if (error || !data || data.length === 0) {
      console.error('[TrickListPage] handleDeleteList: trick_lists delete failed:', error)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this list. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    setDeleting(false)
    setTrickLists(prev => prev.filter(l => l.id !== id))
    setListCounts(prev => { const n = { ...prev }; delete n[id]; return n })
    if (openList?.id === id) setOpenList(null)
    notifyTricksChanged()
    closeDeleteConfirm()
  }

  if (openList) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
        <TrickListDetail
          key={openList.id}
          list={openList}
          user={user}
          spots={spots}
          onSpotClick={onSpotClick}
          onBack={() => setOpenList(null)}
          onTabChange={onTabChange}
          profileAvatar={profileAvatar}
          profileInitials={profileInitials}
          unreadCount={unreadCount}
        />
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div onClick={onClose} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Trick Lists
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className="scroll-area">
        <div style={{ padding: '8px 16px 0', maxWidth: 480, margin: '0 auto' }}>
          {!loading && trickLists.map(list => {
            const counts = listCounts[list.id] || { landed: 0, total: 0 }
            return (
              <div
                key={list.id}
                onClick={() => setOpenList(list)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ListIcon color="#d4785a" size={18} filled />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{counts.landed}/{counts.total} landed</div>
                </div>
                <IconBox size={30} onClick={(e) => { e.stopPropagation(); openRename(list) }}>
                  <PencilIcon color="#d4785a" />
                </IconBox>
                <IconBox size={30} onClick={(e) => { e.stopPropagation(); setDeleteError(''); setPendingDeleteList({ id: list.id, name: list.name }) }}>
                  <CloseIcon color="#d4785a" />
                </IconBox>
                <div className="arrow-btn"><ArrowIcon /></div>
              </div>
            )
          })}

          {user && (
            showCreateList ? (
              <div style={{ border: '1.5px solid #d4785a', borderRadius: 8, padding: 14, marginBottom: 8 }}>
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
                  <button className="btn-salmon" onClick={handleCreateList} disabled={creating} style={{ flex: 1, padding: 10 }}>
                    {creating ? 'Creating...' : 'Create'}
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
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: '1.5px solid #d4785a', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 8, background: 'transparent', border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <line x1="8" y1="3" x2="8" y2="13" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="3" y1="8" x2="13" y2="8" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#d4785a' }}>Create New List</div>
                </div>
              </div>
            )
          )}

          {!loading && trickLists.length === 0 && !showCreateList && (
            <div style={{ padding: '40px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1.6 }}>
              No trick lists yet. Add tricks from any spot's page, or create one above.
            </div>
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>
      {onTabChange && <TabBar active="profile" onChange={onTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} notificationCount={unreadCount} />}

      {/* Rename list */}
      {renamingList && createPortal(
        <div className="modal-overlay" onClick={() => setRenamingList(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rename List</div>
            <div style={{ padding: '0 16px 12px' }}>
              <input
                className="form-input"
                placeholder="List name..."
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleRename() }}
              />
              {renameError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: 6 }}>{renameError}</div>}
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleRename} disabled={renaming || !renameValue.trim()} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: renaming || !renameValue.trim() ? 0.6 : 1 }}>
                {renaming ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setRenamingList(null)} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete list confirmation — existing confirm-dialog pattern
          (modal-overlay/modal-sheet, solid-salmon action + outline cancel,
          closes via closeDeleteConfirm in both outcomes) copied from
          SavedView.jsx's own "Delete List" dialog. */}
      {(pendingDeleteList || deleteClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Delete List
            </div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Delete "{pendingDeleteList?.name}"? This cannot be undone.
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleDeleteList}
                disabled={deleting}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleting ? 0.7 : 1 }}
              >
                {deleting ? 'Deleting…' : 'Delete List'}
              </button>
              <button
                onClick={closeDeleteConfirm}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Cancel
              </button>
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
  )
}
