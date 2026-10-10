import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { siteOrigin } from '../lib/siteUrl'
import { transformImageUrl } from '../utils/imageUrl'
import { getProfiles } from '../utils/profileCache'
import { sortTricks } from '../lib/trickSort'
import { notifyTricksChanged, cascadeDeleteOrphanedSpot } from '../lib/trickWrites'
import TrickCheckmark from '../components/TrickCheckmark'
import TrickEditPanel from '../components/TrickEditPanel'
import TabBar from '../components/TabBar'
import InitialsAvatar from '../components/InitialsAvatar'
import { ArrowIcon, TrickListIcon, SettingsIcon, ShareIcon, LeaveIcon, FriendsIcon, PencilIcon, IconBox } from '../components/Icons'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

function formatLandedDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

// Same avatar-with-initials-fallback pattern as SendToFriendsSheet.jsx's
// own FriendAvatar / FriendsView.jsx's Avatar.
function FriendAvatar({ profile, size = 38 }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #EAD8C8' }} />
  }
  return <InitialsAvatar profile={profile} size={size} />
}

// Copied verbatim from SaveToListModal.jsx / SendToFriendsSheet.jsx's own SquareToggle.
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

// Content-only (no portal/overlay/handle) — swapped into the SAME sheet as
// the Share Link choice, same shape as SpotDetail.jsx's SendToFriendsContent.
// Inserts into trick_list_members directly (a DB trigger creates the
// trick_list_invite notification — never inserted from the client), not an
// RPC, and skips friends who are already members.
function ShareTrickListFriends({ listId, onBack, onShared }) {
  const [friends, setFriends] = useState([])
  const [currentMemberIds, setCurrentMemberIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [friendsRes, membersRes] = await Promise.all([
        supabase.rpc('get_friends'),
        supabase.from('trick_list_members').select('user_id').eq('list_id', listId),
      ])
      if (cancelled) return
      const rows = friendsRes.data || []
      const profileMap = await getProfiles(rows.map(f => f.id))
      if (cancelled) return
      setFriends(rows.map(f => ({ ...f, first_name: profileMap[f.id]?.first_name || null })))
      setCurrentMemberIds(new Set((membersRes.data || []).map(m => m.user_id)))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [listId])

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
    const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !cu) { setSending(false); setError('Could not share. Try again.'); return }
    const toAdd = [...selected].filter(id => !currentMemberIds.has(id))
    if (toAdd.length === 0) { setSending(false); onShared?.('Already shared with everyone selected.'); return }
    const { data, error: err } = await supabase
      .from('trick_list_members')
      .insert(toAdd.map(userId => ({ list_id: listId, user_id: userId, added_by: cu.id })))
      .select()
    setSending(false)
    if (err || !data || data.length === 0) {
      console.error('[TrickListPage] ShareTrickListFriends handleSend failed:', err)
      setError('Could not share. Try again.')
      return
    }
    onShared?.('Trick list shared!')
  }

  return (
    <>
      <div className="modal-title" style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack && (
          <div onClick={onBack} style={{ width: 28, height: 28, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <span>Share With Friends</span>
      </div>

      {loading ? (
        <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Loading...</div>
      ) : friends.length === 0 ? (
        <div style={{ padding: '0 20px 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          You don't have any friends yet. Add some from the Friends page first.
        </div>
      ) : (
        <>
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {friends.map(f => {
              const already = currentMemberIds.has(f.id)
              return (
                <div key={f.id} className="modal-row" onClick={() => !already && toggleFriend(f.id)} style={already ? { opacity: 0.5, cursor: 'default' } : undefined}>
                  <FriendAvatar profile={f} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.first_name || f.username}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>@{f.username}</div>
                  </div>
                  {already ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Added</span>
                  ) : (
                    <SquareToggle selected={selected.has(f.id)} />
                  )}
                </div>
              )
            })}
          </div>
          {error && (
            <div style={{ padding: '8px 20px 0', fontSize: 11, color: '#e07070', fontWeight: 700 }}>{error}</div>
          )}
          <div style={{ padding: '10px 14px 0' }}>
            <button className="btn-salmon" onClick={handleSend} disabled={selected.size === 0 || sending} style={{ opacity: selected.size === 0 || sending ? 0.5 : 1 }}>
              {sending ? 'Sharing...' : 'Share'}
            </button>
          </div>
        </>
      )}
    </>
  )
}

// Detail view — one trick list's spots and tricks, loaded through
// get_trick_list_view (owners and members both). Owns its own header
// (back returns to the list-of-lists, not out of the whole Trick List
// screen) — same split SavedView.jsx uses between its own default view
// and CollectionView.
function TrickListDetail({ list, user, spots, onSpotClick, onBack, onTabChange, profileAvatar, profileInitials, unreadCount, onListRenamed, onListDeleted, onLeft, onGoProfile }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [listName, setListName] = useState(list.name)
  const [isOwner, setIsOwner] = useState(list.isOwner ?? true)
  const [spotDetails, setSpotDetails] = useState({}) // spot_id -> { title, slug, photos }
  // Per-spot trick order, frozen at fetch time — checking/unchecking a
  // trick must never reorder it while this screen stays open (it would
  // visibly jump); only a fresh fetch (reopening this list) re-sorts.
  const [orderIdsBySpot, setOrderIdsBySpot] = useState({})

  const fetchView = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_trick_list_view', { p_list_id: list.id })
    if (error || !data) { setLoading(false); return }
    setRows(data)
    const bySpot = {}
    for (const r of data) {
      if (!r.spot_id || !r.trick_id) continue
      if (!bySpot[r.spot_id]) bySpot[r.spot_id] = []
      bySpot[r.spot_id].push({ id: r.trick_id, landed: r.landed, landed_at: r.landed_at, created_at: r.created_at })
    }
    const frozen = {}
    for (const spotId of Object.keys(bySpot)) {
      frozen[spotId] = sortTricks(bySpot[spotId]).map(t => t.id)
    }
    setOrderIdsBySpot(frozen)
    if (data.length > 0) {
      setListName(data[0].list_name || list.name)
      setIsOwner(!!data[0].is_owner)
    }
    const spotIds = [...new Set(data.map(r => r.spot_id).filter(Boolean))]
    if (spotIds.length > 0) {
      const { data: spotsData } = await supabase.from('spots').select('id, title, slug, photos').in('id', spotIds)
      const map = {}
      for (const s of spotsData || []) map[s.id] = s
      setSpotDetails(map)
    } else {
      setSpotDetails({})
    }
    setLoading(false)
  }

  useEffect(() => { fetchView() }, [list.id])

  const toggleLanded = async (trickId, currentLanded) => {
    if (!isOwner) return
    const nextLanded = !currentLanded
    const { data, error } = await supabase
      .from('user_tricks')
      .update({ landed: nextLanded, landed_at: nextLanded ? new Date().toISOString() : null })
      .eq('id', trickId)
      .select()
      .single()
    if (error || !data) {
      console.error('[TrickListPage] toggleLanded failed:', error)
      return
    }
    setRows(prev => prev.map(r => (r.trick_id === trickId ? { ...r, landed: data.landed, landed_at: data.landed_at } : r)))
    notifyTricksChanged()
  }

  const handleCardClick = (spotId) => {
    const detail = spotDetails[spotId]
    const fullSpot = spots?.find(s => s.id === spotId) || { id: spotId, slug: detail?.slug, title: detail?.title }
    onSpotClick?.(fullSpot)
  }

  // Trick options (owner only) — three-dot menu per trick row, opened in
  // its own bottom sheet (not a nested pane — this page already opens
  // separate sheets for settings/share rather than swapping panes in
  // place). RENAME and DELETE TRICK write immediately and verified, per
  // docs/supabase-writes.md, then dispatch seshwars:tricks-changed — same
  // shared TrickEditPanel used by the spot-page trick list sheet for its
  // own existing (already-saved) tricks.
  const [optionsTrick, setOptionsTrick] = useState(null) // { id, name, spotId }
  const openTrickOptions = (trick, spotId) => setOptionsTrick({ id: trick.id, name: trick.name, spotId })
  const closeTrickOptions = () => setOptionsTrick(null)

  const trickOnRename = async (newName) => {
    const { data, error } = await supabase.from('user_tricks').update({ name: newName }).eq('id', optionsTrick.id).select().single()
    if (error || !data) {
      console.error('[TrickListPage] rename trick failed:', error)
      return { ok: false, error: error?.code === '23505' ? 'A trick with that name already exists at this spot.' : 'Could not rename this trick. Try again.' }
    }
    setRows(prev => prev.map(r => (r.trick_id === optionsTrick.id ? { ...r, trick_name: data.name } : r)))
    notifyTricksChanged()
    return { ok: true }
  }

  const trickOnDelete = async () => {
    const { data, error } = await supabase.from('user_tricks').delete().eq('id', optionsTrick.id).select()
    if (error || !data || data.length === 0) {
      console.error('[TrickListPage] delete trick failed:', error)
      return { ok: false, error: 'Could not delete this trick. Try again.' }
    }
    await cascadeDeleteOrphanedSpot(user.id, optionsTrick.spotId)
    setRows(prev => prev.filter(r => r.trick_id !== optionsTrick.id))
    notifyTricksChanged()
    return { ok: true }
  }

  // Settings sheet (owner only): rename + delete list.
  const [showSettings, setShowSettings] = useState(false)
  const [nameInput, setNameInput] = useState(listName)
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState('')
  const openSettings = () => { setNameInput(listName); setNameError(''); setShowSettings(true) }
  const handleSaveName = async () => {
    if (!nameInput.trim() || savingName) return
    setSavingName(true)
    setNameError('')
    const { data, error } = await supabase.from('trick_lists').update({ name: nameInput.trim() }).eq('id', list.id).select()
    setSavingName(false)
    if (error || !data || data.length === 0) {
      console.error('[TrickListPage] handleSaveName failed:', error)
      setNameError('Could not rename this list. Try again.')
      return
    }
    setListName(data[0].name)
    onListRenamed?.(data[0].name)
    setShowSettings(false)
  }

  const [pendingDeleteList, setPendingDeleteList] = useState(false)
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setDeleteError('')
    setTimeout(() => { setDeleteClosing(false); setPendingDeleteList(false) }, 180)
  }
  const handleDeleteList = async () => {
    setDeleting(true)
    // trick_list_spots here deletes every row for this list — a list with
    // no spots in it legitimately deletes zero rows, so only a real
    // `error` means failure. trick_lists below deletes one specific
    // known-to-exist row by id, so an empty result there does mean the
    // delete was blocked.
    const { error: spotsErr } = await supabase.from('trick_list_spots').delete().eq('list_id', list.id).select()
    if (spotsErr) {
      console.error('[TrickListPage] handleDeleteList: trick_list_spots delete failed:', spotsErr)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this list. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    const { data, error } = await supabase.from('trick_lists').delete().eq('id', list.id).select()
    if (error || !data || data.length === 0) {
      console.error('[TrickListPage] handleDeleteList: trick_lists delete failed:', error)
      setDeleting(false)
      closeDeleteConfirm()
      setDeleteError('Could not delete this list. Try again.')
      setTimeout(() => setDeleteError(''), 3000)
      return
    }
    setDeleting(false)
    notifyTricksChanged()
    closeDeleteConfirm()
    setShowSettings(false)
    onListDeleted?.()
    onBack()
  }

  // Share sheet (owner only): one sheet, friend content swaps in place —
  // never a second sheet on top. Same shape as SpotDetail.jsx's share sheet.
  const [showShareSheet, setShowShareSheet] = useState(false)
  const [shareSheetMode, setShareSheetMode] = useState('choice') // 'choice' | 'friends'
  const [shareToast, setShareToast] = useState('')
  const closeShareSheet = () => { setShowShareSheet(false); setShareSheetMode('choice') }
  const showShareToast = (msg) => {
    setShareToast(msg)
    setTimeout(() => setShareToast(''), 2500)
  }
  const handleShareLink = async () => {
    const { data: token, error } = await supabase.rpc('get_or_create_trick_list_share_token', { p_list_id: list.id })
    if (error || !token) {
      console.error('[TrickListPage] get_or_create_trick_list_share_token failed:', error)
      showShareToast('Could not create a share link. Try again.')
      return
    }
    const url = `${siteOrigin()}/#/trick-list/${token}`
    let shared = false
    if (navigator.share) {
      try {
        await navigator.share({ title: listName, url })
        shared = true
      } catch (err) {
        if (err && err.name === 'AbortError') shared = true
        else console.warn('[TrickListPage] navigator.share failed, falling back to clipboard:', err)
      }
    }
    if (!shared) {
      try {
        await navigator.clipboard.writeText(url)
        showShareToast('Link Copied!')
      } catch (err) {
        console.error('[TrickListPage] clipboard failed:', err)
        window.prompt('Copy this share link:', url)
      }
    }
  }

  // Leave (members only) — existing confirm-dialog pattern, closes in both
  // outcomes, then deletes the user's own trick_list_members row.
  const [pendingLeave, setPendingLeave] = useState(false)
  const [leaveClosing, setLeaveClosing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const closeLeaveConfirm = () => {
    setLeaveClosing(true)
    setLeaveError('')
    setTimeout(() => { setLeaveClosing(false); setPendingLeave(false) }, 180)
  }
  const handleLeave = async () => {
    if (!user?.id) return
    setLeaving(true)
    const { data, error } = await supabase.from('trick_list_members').delete().eq('list_id', list.id).eq('user_id', user.id).select()
    if (error || !data || data.length === 0) {
      console.error('[TrickListPage] handleLeave failed:', error)
      setLeaving(false)
      closeLeaveConfirm()
      setLeaveError('Could not leave this list. Try again.')
      setTimeout(() => setLeaveError(''), 3000)
      return
    }
    setLeaving(false)
    closeLeaveConfirm()
    onLeft?.()
    onBack()
  }

  // Group rows by spot — one row per trick; a spot with no tricks returns
  // one row with null trick fields; an empty list returns one row with a
  // null spot_id (skipped entirely).
  const grouped = (() => {
    if (rows.length === 0 || (rows.length === 1 && !rows[0].spot_id)) return []
    const order = []
    const map = new Map()
    for (const r of rows) {
      if (!r.spot_id) continue
      if (!map.has(r.spot_id)) { map.set(r.spot_id, []); order.push(r.spot_id) }
      if (r.trick_id) map.get(r.spot_id).push(r)
    }
    return order.map(spotId => {
      const tricksById = new Map(map.get(spotId).map(t => [t.trick_id, t]))
      const frozenOrder = orderIdsBySpot[spotId] || []
      const ordered = []
      for (const id of frozenOrder) {
        if (tricksById.has(id)) { ordered.push(tricksById.get(id)); tricksById.delete(id) }
      }
      // A trick not in the frozen order (shouldn't normally happen within
      // a single open session) — append in fetch order, same fallback
      // AddToTrickListSheet.jsx uses for its own frozen ordering.
      for (const t of map.get(spotId)) {
        if (tricksById.has(t.trick_id)) ordered.push(t)
      }
      return {
        spotId,
        tricks: ordered.map(t => ({ id: t.trick_id, name: t.trick_name, landed: t.landed, landed_at: t.landed_at, created_at: t.created_at })),
      }
    })
  })()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '80px 1fr 80px', alignItems: 'center',
        padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div onClick={onBack} style={{ justifySelf: 'start', width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ minWidth: 0, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase', overflowWrap: 'break-word' }}>
          {listName}
        </div>
        <div style={{ justifySelf: 'end', display: 'flex', gap: 8, flexShrink: 0 }}>
          {isOwner ? (
            <>
              <div onClick={openSettings} style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <SettingsIcon color="#d4785a" size={17} />
              </div>
              <div onClick={() => setShowShareSheet(true)} style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <ShareIcon color="#d4785a" />
              </div>
            </>
          ) : (
            <div onClick={() => { setLeaveError(''); setPendingLeave(true) }} style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <LeaveIcon color="#d4785a" size={15} />
            </div>
          )}
        </div>
      </div>

      <div className="scroll-area">
        <div style={{ padding: '10px 14px 0', maxWidth: 480, margin: '0 auto' }}>
          {!loading && grouped.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
              No spots in this list yet.
            </div>
          ) : (
            grouped.map(group => {
              const detail = spotDetails[group.spotId]
              return (
                <div key={group.spotId} style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, marginBottom: 18, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
                    <div onClick={() => handleCardClick(group.spotId)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 6, background: '#F0E8DE', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {detail?.photos?.[0] && (
                          <img src={transformImageUrl(detail.photos[0], 88)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {detail?.title || 'Spot'}
                      </div>
                    </div>
                    <div className="arrow-btn" onClick={() => handleCardClick(group.spotId)}><ArrowIcon /></div>
                  </div>
                  <div>
                    {group.tricks.length === 0 ? (
                      <div style={{ padding: '0 12px 12px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>No tricks yet.</div>
                    ) : group.tricks.map(trick => (
                      <div key={trick.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid #ECEDF2' }}>
                        <TrickCheckmark landed={trick.landed} onClick={isOwner ? () => toggleLanded(trick.id, trick.landed) : undefined} />
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
                        {isOwner && (
                          <IconBox size={30} onClick={() => openTrickOptions(trick, group.spotId)}>
                            <PencilIcon color="#d4785a" />
                          </IconBox>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>
      {onTabChange && <TabBar active="profile" onChange={onTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} notificationCount={unreadCount} />}

      {/* Settings sheet — rename + delete */}
      {showSettings && createPortal(
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px' }}>List Settings</div>
            <div style={{ padding: '0 20px 14px' }}>
              <input
                className="form-input"
                placeholder="List name..."
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName() }}
                style={{ marginBottom: 8 }}
              />
              {nameError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 8 }}>{nameError}</div>}
              <button className="btn-salmon" onClick={handleSaveName} disabled={savingName || !nameInput.trim()} style={{ opacity: savingName || !nameInput.trim() ? 0.6 : 1 }}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="divider" style={{ margin: '0 20px 14px' }} />
            <div style={{ padding: '0 20px 28px' }}>
              <button
                className="btn-salmon"
                onClick={() => { setShowSettings(false); setDeleteError(''); setPendingDeleteList(true) }}
              >
                Delete List
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete list confirmation — existing confirm-dialog pattern, closes
          via closeDeleteConfirm in both outcomes. */}
      {(pendingDeleteList || deleteClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Delete List</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Delete "{listName}"? This cannot be undone.</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleDeleteList} disabled={deleting} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Delete List'}
              </button>
              <button onClick={closeDeleteConfirm} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Trick options — pencil icon, opened in its own bottom sheet (owner
          only; members never see the pencil icon that triggers this). Same
          shared TrickEditPanel the spot-page trick list sheet uses for its
          own existing (already-saved) tricks. */}
      {optionsTrick && createPortal(
        <div className="modal-overlay" onClick={closeTrickOptions}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-title" style={{ padding: '0 20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{optionsTrick.name}</div>
            <div style={{ padding: '0 20px 20px' }}>
              <TrickEditPanel trick={optionsTrick} onRename={trickOnRename} onDelete={trickOnDelete} onClose={closeTrickOptions} />
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

      {/* Share sheet — ONE sheet; friend content swaps in place. */}
      {showShareSheet && createPortal(
        <div className="modal-overlay" onClick={closeShareSheet}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-handle" />
            {shareSheetMode === 'choice' ? (
              <>
                <div className="modal-title" style={{ padding: '0 20px' }}>Share</div>
                <div className="modal-row" onClick={() => { if (!user) { closeShareSheet(); onGoProfile?.(); return } setShareSheetMode('friends') }}>
                  <FriendsIcon color="#d4785a" size={16} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Share With Friends</span>
                </div>
                <div className="modal-row" onClick={() => { closeShareSheet(); handleShareLink() }}>
                  <ShareIcon color="#d4785a" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Share Link</span>
                </div>
              </>
            ) : (
              <ShareTrickListFriends
                listId={list.id}
                onBack={() => setShareSheetMode('choice')}
                onShared={(msg) => { closeShareSheet(); showShareToast(msg) }}
              />
            )}
          </div>
        </div>,
        document.body
      )}
      {shareToast && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#2a1e14', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {shareToast}
        </div>,
        document.body
      )}

      {/* Leave confirmation (members) — same pattern */}
      {(pendingLeave || leaveClosing) && createPortal(
        <div className="modal-overlay" onClick={closeLeaveConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={leaveClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Leave List</div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>Leave "{listName}"? You'll need a new invite to see it again.</div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleLeave} disabled={leaving} style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: leaving ? 0.7 : 1 }}>
                {leaving ? 'Leaving…' : 'Leave'}
              </button>
              <button onClick={closeLeaveConfirm} style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {leaveError && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#FFFFFF', border: '1px solid #EAD8C8', color: '#e07070', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {leaveError}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function TrickListPage({ user, spots, onSpotClick, onClose, openListId, onOpenListIdHandled, onTabChange, profileAvatar, profileInitials, unreadCount, onGoProfile }) {
  const [trickLists, setTrickLists] = useState([]) // owned, with computed landed/total
  const [sharedTrickLists, setSharedTrickLists] = useState([]) // from get_trick_lists_shared_with_me()
  const [loading, setLoading] = useState(true)
  const [openList, setOpenList] = useState(null) // { id, name, isOwner }
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  const fetchOwnedLists = async () => {
    if (!user?.id) { setTrickLists([]); return }
    const { data: listsData } = await supabase.from('trick_lists').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    const lists = listsData || []
    const counts = {}
    if (lists.length > 0) {
      const [spotRowsRes, tricksRes] = await Promise.all([
        supabase.from('trick_list_spots').select('list_id, spot_id').in('list_id', lists.map(l => l.id)),
        supabase.from('user_tricks').select('spot_id, landed').eq('user_id', user.id),
      ])
      const listSpotMap = {} // list_id -> Set(spot_id)
      for (const r of spotRowsRes.data || []) {
        if (!listSpotMap[r.list_id]) listSpotMap[r.list_id] = new Set()
        listSpotMap[r.list_id].add(r.spot_id)
      }
      const spotTrickMap = {} // spot_id -> { landed, total }
      for (const t of tricksRes.data || []) {
        if (!spotTrickMap[t.spot_id]) spotTrickMap[t.spot_id] = { landed: 0, total: 0 }
        spotTrickMap[t.spot_id].total++
        if (t.landed) spotTrickMap[t.spot_id].landed++
      }
      for (const l of lists) {
        let landed = 0, total = 0
        for (const spotId of (listSpotMap[l.id] || [])) {
          const c = spotTrickMap[spotId]
          if (c) { landed += c.landed; total += c.total }
        }
        counts[l.id] = { landed, total }
      }
    }
    setTrickLists(lists.map(l => ({ ...l, landed: counts[l.id]?.landed || 0, total: counts[l.id]?.total || 0 })))
  }

  const fetchSharedLists = async () => {
    if (!user?.id) { setSharedTrickLists([]); return }
    const { data, error } = await supabase.rpc('get_trick_lists_shared_with_me')
    if (error) { console.error('[TrickListPage] get_trick_lists_shared_with_me failed:', error); return }
    setSharedTrickLists(data || [])
  }

  const fetchAll = async () => {
    setLoading(true)
    await Promise.all([fetchOwnedLists(), fetchSharedLists()])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [user?.id])

  // Live refresh while mounted — same event-refresh approach used
  // throughout (seshwars:tricks-changed covers list/spot/trick changes).
  useEffect(() => {
    const handler = () => fetchAll()
    window.addEventListener('seshwars:tricks-changed', handler)
    return () => window.removeEventListener('seshwars:tricks-changed', handler)
  }, [user?.id])

  // Deep link (trick_list_invite notification tap, or a VIEW action
  // elsewhere) — open once the matching list has loaded, owned or shared.
  useEffect(() => {
    if (!openListId) return
    const ownMatch = trickLists.find(l => l.id === openListId)
    if (ownMatch) {
      setOpenList({ id: ownMatch.id, name: ownMatch.name, isOwner: true })
      onOpenListIdHandled?.()
      return
    }
    const sharedMatch = sharedTrickLists.find(l => l.id === openListId)
    if (sharedMatch) {
      setOpenList({ id: sharedMatch.id, name: sharedMatch.name, isOwner: false })
      onOpenListIdHandled?.()
    }
  }, [openListId, trickLists, sharedTrickLists])

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id) return
    setCreating(true)
    const { data, error } = await supabase.from('trick_lists').insert({ user_id: user.id, name: newListName.trim() }).select()
    if (!error && data && data.length > 0) {
      setTrickLists(prev => [{ ...data[0], landed: 0, total: 0 }, ...prev])
    }
    setNewListName('')
    setShowCreateList(false)
    setCreating(false)
  }

  // Owned lists newest-first by created_at, shared lists newest-first by
  // added_at, merged and interleaved by that date.
  const combined = [
    ...trickLists.map(l => ({ ...l, _kind: 'own', _sortDate: l.created_at })),
    ...sharedTrickLists.map(l => ({ ...l, _kind: 'shared', _sortDate: l.added_at })),
  ].sort((a, b) => new Date(b._sortDate) - new Date(a._sortDate))

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
          onGoProfile={onGoProfile}
          onListRenamed={(name) => setTrickLists(prev => prev.map(l => (l.id === openList.id ? { ...l, name } : l)))}
          onListDeleted={() => { setTrickLists(prev => prev.filter(l => l.id !== openList.id)); setOpenList(null) }}
          onLeft={() => { setSharedTrickLists(prev => prev.filter(l => l.id !== openList.id)); setOpenList(null) }}
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
          {!loading && combined.map(list => {
            const isShared = list._kind === 'shared'
            return (
              <div
                key={`${list._kind}-${list.id}`}
                onClick={() => setOpenList({ id: list.id, name: list.name, isOwner: !isShared })}
                style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <TrickListIcon color="#d4785a" size={18} filled />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                    {list.landed}/{list.total} landed{isShared ? ` · @${list.owner_username}` : ''}
                  </div>
                </div>
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

          {!loading && combined.length === 0 && !showCreateList && (
            <div style={{ padding: '40px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1.6 }}>
              No trick lists yet. Add tricks from any spot's page, or create one above.
            </div>
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      </div>
      {onTabChange && <TabBar active="profile" onChange={onTabChange} user={user} profileAvatar={profileAvatar} profileInitials={profileInitials} notificationCount={unreadCount} />}
    </div>
  )
}
