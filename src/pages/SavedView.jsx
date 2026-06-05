import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import SpotCard from '../components/SpotCard'
import Navbar from '../components/Navbar'
import { ArrowIcon } from '../components/Icons'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

function CollectionView({ title, spots, saved, onSavePress, onSpotClick, onBack }) {
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
        <div style={{ width: 36 }} />
      </div>
      <div className="scroll-area" style={{ paddingTop: 14 }}>
        {spots.length === 0 ? (
          <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            No spots saved here yet
          </div>
        ) : (
          spots.map(spot => (
            <SpotCard
              key={spot.id}
              spot={spot}
              saved={saved.has(spot.id)}
              onSavePress={onSavePress}
              onClick={onSpotClick}
            />
          ))
        )}
        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </div>
  )
}

export default function SavedView({ spots, saved, onSavePress, onSpotClick, onAddSpot, onSearch, showNav = true, user }) {
  const [lists, setLists] = useState([])
  const [listSpotIds, setListSpotIds] = useState({})
  const [openCollection, setOpenCollection] = useState(null)

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

  if (openCollection) {
    const collSpots = openCollection.type === 'favorites'
      ? savedSpots
      : getListSpots(openCollection.id)
    return (
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <CollectionView
          title={openCollection.name}
          spots={collSpots}
          saved={saved}
          onSavePress={onSavePress}
          onSpotClick={onSpotClick}
          onBack={() => setOpenCollection(null)}
        />
      </div>
    )
  }

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8DDD0', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Saved
        </div>
      </div>
      <div className="scroll-area">
        <div style={{ padding: '8px 16px 0' }}>
        {/* Favorites */}
        <div
          onClick={() => setOpenCollection({ type: 'favorites', name: 'Favorites' })}
          style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #EAD8C8', borderRadius: 8, padding: 14, cursor: 'pointer', marginBottom: 8 }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="20" viewBox="0 0 28 32" fill="none">
              <path d="M4,2 H24 V30 L14,22 L4,30 Z" fill="#d4785a" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>Favorites</div>
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
              onClick={() => setOpenCollection({ type: 'list', id: list.id, name: list.name })}
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
