import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import SpotCard from '../components/SpotCard'
import Navbar from '../components/Navbar'
import { ArrowIcon, ShareIcon } from '../components/Icons'
import MapView from './MapView'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

// Module-level state: survives App remount so back-nav restores the open collection
let _savedOpenCollection = null
let _savedCollectionScrollTop = 0

function generateShareToken() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const arr = new Uint8Array(12)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(n => chars[n % chars.length]).join('')
}

function CollectionView({ title, isList, isFavorites, userId, listId, shareToken, onTokenGenerated, spots, saved, onSavePress, onSpotClick, onBack, onListDeleted, initialScrollTop, onSaveScrollTop }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteClosing, setDeleteClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewMode, setViewMode] = useState('list')
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)
  const scrollRef = useRef(null)
  const scrollRestoredRef = useRef(false)

  // Restore scroll once spots content is actually rendered (listSpotIds loads async)
  useEffect(() => {
    if (scrollRestoredRef.current || !initialScrollTop || !scrollRef.current) return
    if (spots.length > 0) {
      scrollRef.current.scrollTop = initialScrollTop
      scrollRestoredRef.current = true
    }
  }, [spots.length, initialScrollTop])

  const handleSpotClick = (spot) => {
    if (scrollRef.current) onSaveScrollTop?.(scrollRef.current.scrollTop)
    onSpotClick(spot)
  }

  const closeDeleteConfirm = () => {
    setDeleteClosing(true)
    setTimeout(() => { setDeleteClosing(false); setShowDeleteConfirm(false) }, 180)
  }

  const handleDelete = async () => {
    setDeleting(true)
    await supabase.from('saved_spots').delete().eq('list_id', listId)
    await supabase.from('spot_lists').delete().eq('id', listId)
    setDeleting(false)
    setShowDeleteConfirm(false)
    onListDeleted?.()
    onBack()
  }

  const handleShare = async () => {
    if (sharing) return
    setSharing(true)
    let token = shareToken
    if (!token) {
      token = generateShareToken()
      if (isFavorites) {
        const { data } = await supabase
          .from('spot_lists')
          .insert({ user_id: userId, name: 'Saved Spots', is_favorites: true, share_token: token })
          .select('id')
          .single()
        onTokenGenerated?.(token, data?.id)
      } else {
        await supabase.from('spot_lists').update({ share_token: token }).eq('id', listId)
        onTokenGenerated?.(token)
      }
    }
    const url = `${window.location.origin}/#/list/${token}`
    if (navigator.share) {
      try { await navigator.share({ title, url }) } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      } catch {}
    }
    setSharing(false)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FDF8F0', zIndex: 100, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div
          onClick={onBack}
          style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          {title}
        </div>
        {(isList || isFavorites) ? (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {isList && (
              <div
                onClick={() => setShowDeleteConfirm(true)}
                style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                  <path d="M1 4H13M5 4V2H9V4M2 4L3 14H11L12 4" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
            <div
              onClick={handleShare}
              style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: sharing ? 0.6 : 1 }}
            >
              <ShareIcon color="#d4785a" />
            </div>
          </div>
        ) : (
          <div style={{ width: 36 }} />
        )}
      </div>

      {copied && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#2a1e14', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          Link Copied!
        </div>,
        document.body
      )}

      {/* Delete confirmation popup */}
      {(showDeleteConfirm || deleteClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDeleteConfirm}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={deleteClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Delete List
            </div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Delete "{title}"? This cannot be undone.
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleDelete}
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
      {/* Fixed bottom toggle */}
      {createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 70px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, display: 'flex', background: '#d4785a', borderRadius: 50, padding: 3, pointerEvents: 'auto', boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
          <div onClick={() => setViewMode('list')} style={{ padding: '6px 18px', borderRadius: 50, background: viewMode === 'list' ? '#fff' : 'transparent', color: viewMode === 'list' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>LIST</div>
          <div onClick={() => setViewMode('map')} style={{ padding: '6px 18px', borderRadius: 50, background: viewMode === 'map' ? '#fff' : 'transparent', color: viewMode === 'map' ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}>MAP</div>
        </div>,
        document.body
      )}
      {viewMode === 'map' ? (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {spots.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No spots saved here yet</div>
          ) : (
            <MapView spots={spots} saved={saved} onSavePress={onSavePress} onSpotClick={handleSpotClick} showNav={false} showFilterChips={false} fitOnMount={true} />
          )}
        </div>
      ) : (
        <div className="scroll-area" ref={scrollRef} style={{ paddingTop: 14 }}>
          {spots.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No spots saved here yet</div>
          ) : (
            spots.map(spot => (
              <SpotCard key={spot.id} spot={spot} saved={saved.has(spot.id)} onSavePress={onSavePress} onClick={handleSpotClick} />
            ))
          )}
          <div style={{ height: BOTTOM_PAD }} />
        </div>
      )}
    </div>
  )
}

export default function SavedView({ spots, saved, onSavePress, onSpotClick, onAddSpot, onSearch, showNav = true, user }) {
  const [lists, setLists] = useState([])
  const [listSpotIds, setListSpotIds] = useState({})
  const [openCollection, setOpenCollection] = useState(_savedOpenCollection)
  const [showCreateList, setShowCreateList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user?.id) return
    fetchLists()
  }, [user?.id])

  const fetchLists = async () => {
    const { data: listsData } = await supabase
      .from('spot_lists').select('*').eq('user_id', user.id).order('created_at')
    setLists(listsData || [])
    if (listsData?.length > 0) {
      const { data: items } = await supabase
        .from('saved_spots')
        .select('list_id, spot_id')
        .eq('user_id', user.id)
        .not('list_id', 'is', null)
      const map = {}
      for (const item of (items || [])) {
        if (!map[item.list_id]) map[item.list_id] = new Set()
        map[item.list_id].add(item.spot_id)
      }
      setListSpotIds(map)
    }
  }

  const savedSpots = spots.filter(s => saved.has(s.id))

  const getListSpots = (listId) => {
    const ids = listSpotIds[listId] || new Set()
    return spots.filter(s => ids.has(s.id))
  }

  const handleCreateList = async () => {
    if (!newListName.trim() || !user?.id) return
    setCreating(true)
    const { data } = await supabase.from('spot_lists').insert({ user_id: user.id, name: newListName.trim() }).select().single()
    if (data) setLists(prev => [...prev, data])
    setNewListName('')
    setShowCreateList(false)
    setCreating(false)
  }

  const handleBackFromCollection = () => {
    _savedOpenCollection = null
    _savedCollectionScrollTop = 0
    setOpenCollection(null)
  }

  const handleSpotClickInCollection = (spot) => {
    _savedOpenCollection = openCollection
    onSpotClick(spot)
  }

  const handleTokenGenerated = (token, newListId) => {
    if (openCollection.type === 'favorites') {
      // A new spot_lists row was created for Saved Spots; update local state
      if (newListId) {
        const newEntry = { id: newListId, name: 'Saved Spots', is_favorites: true, share_token: token }
        setLists(prev => [...prev, newEntry])
      }
      setOpenCollection(prev => ({ ...prev, shareToken: token }))
      _savedOpenCollection = { ..._savedOpenCollection, shareToken: token }
    } else {
      setLists(prev => prev.map(l => l.id === openCollection.id ? { ...l, share_token: token } : l))
      setOpenCollection(prev => ({ ...prev, shareToken: token }))
      _savedOpenCollection = { ..._savedOpenCollection, shareToken: token }
    }
  }

  // Find any existing favorites share token from lists data
  const favoritesListEntry = lists.find(l => l.is_favorites)

  if (openCollection) {
    const collSpots = openCollection.type === 'favorites'
      ? savedSpots
      : getListSpots(openCollection.id)
    const favShareToken = openCollection.type === 'favorites'
      ? (openCollection.shareToken || favoritesListEntry?.share_token)
      : openCollection.shareToken
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <CollectionView
          title={openCollection.name}
          isList={openCollection.type === 'list'}
          isFavorites={openCollection.type === 'favorites'}
          userId={user?.id}
          listId={openCollection.type === 'list' ? openCollection.id : favoritesListEntry?.id}
          shareToken={favShareToken}
          onTokenGenerated={handleTokenGenerated}
          spots={collSpots}
          saved={saved}
          onSavePress={onSavePress}
          onSpotClick={handleSpotClickInCollection}
          onBack={handleBackFromCollection}
          initialScrollTop={_savedCollectionScrollTop}
          onSaveScrollTop={(v) => { _savedCollectionScrollTop = v }}
          onListDeleted={() => {
            _savedOpenCollection = null
            _savedCollectionScrollTop = 0
            setLists(prev => prev.filter(l => l.id !== openCollection.id))
            setListSpotIds(prev => { const n = {...prev}; delete n[openCollection.id]; return n })
          }}
        />
      </div>
    )
  }

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8DDD0', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Your Saved Spots
        </div>
        <div style={{ fontSize: 11, color: '#9a8878', fontWeight: 600, marginTop: 4 }}>
          Create and share lists to help plan a future skate sesh.
        </div>
      </div>
      <div className="scroll-area">
        <div style={{ padding: '8px 16px 0' }}>
        {/* Saved Spots (was Favorites) */}
        <div
          onClick={() => setOpenCollection({ type: 'favorites', name: 'Saved Spots' })}
          style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="20" viewBox="0 0 28 32" fill="none">
              <path d="M4,2 H24 V30 L14,22 L4,30 Z" fill="#d4785a" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Saved Spots</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{savedSpots.length} spot{savedSpots.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="arrow-btn"><ArrowIcon /></div>
        </div>

        {/* Custom lists */}
        {lists.map(list => {
          const count = listSpotIds[list.id]?.size || 0
          return (
            <div
              key={list.id}
              onClick={() => setOpenCollection({ type: 'list', id: list.id, name: list.name, shareToken: list.share_token })}
              style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="20" viewBox="0 0 28 32" fill="none">
                  <path d="M4,2 H24 V30 L14,22 L4,30 Z" fill="#d4785a" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{list.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{count} spot{count !== 1 ? 's' : ''}</div>
              </div>
              <div className="arrow-btn"><ArrowIcon /></div>
            </div>
          )
        })}

        {/* Create New List card */}
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
        </div>

        {!user && (
          <div style={{ padding: '40px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1.6 }}>
            Sign in to save spots and create lists
          </div>
        )}

        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </>
  )
}
