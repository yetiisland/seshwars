import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

function BookmarkSVG({ filled }) {
  return (
    <div style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width="14" height="16" viewBox="0 0 28 34" fill="none">
        {filled
          ? <path d="M4,2 H24 V32 L14,24 L4,32 Z" fill="#d4785a" />
          : <path d="M4,2 H24 V32 L14,24 L4,32 Z" stroke="#d4785a" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
        }
      </svg>
    </div>
  )
}

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

export default function SaveToListModal({ spot, user, onClose }) {
  const [lists, setLists] = useState([])
  const [listItems, setListItems] = useState(new Set()) // set of list_ids this spot is in
  const [isFav, setIsFav] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creatingList, setCreatingList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user || !spot) return
    fetchData()
  }, [user?.id, spot?.id])

  const fetchData = async () => {
    setLoading(true)
    const [listsRes, itemsRes, favRes] = await Promise.all([
      supabase.from('spot_lists').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('saved_spots').select('list_id').eq('spot_id', spot.id).eq('user_id', user.id).not('list_id', 'is', null),
      supabase.from('saved_spots').select('id').eq('spot_id', spot.id).eq('user_id', user.id).is('list_id', null),
    ])
    setLists(listsRes.data || [])
    setListItems(new Set((itemsRes.data || []).map(i => i.list_id)))
    setIsFav((favRes.data || []).length > 0)
    setLoading(false)
  }

  const toggleFavorites = async () => {
    if (isFav) {
      await supabase.from('saved_spots')
        .delete().eq('user_id', user.id).eq('spot_id', spot.id).is('list_id', null)
      setIsFav(false)
    } else {
      await supabase.from('saved_spots')
        .insert({ user_id: user.id, spot_id: spot.id })
      setIsFav(true)
    }
  }

  const toggleList = async (listId) => {
    if (listItems.has(listId)) {
      await supabase.from('saved_spots')
        .delete()
        .eq('user_id', user.id)
        .eq('spot_id', spot.id)
        .eq('list_id', listId)
      setListItems(prev => { const s = new Set(prev); s.delete(listId); return s })
    } else {
      await supabase.from('saved_spots')
        .insert({ user_id: user.id, spot_id: spot.id, list_id: listId })
      setListItems(prev => new Set([...prev, listId]))
    }
  }

  const createList = async () => {
    if (!newListName.trim()) return
    setCreating(true)
    const { data } = await supabase
      .from('spot_lists')
      .insert({ user_id: user.id, name: newListName.trim() })
      .select().single()
    if (data) {
      await supabase.from('saved_spots')
        .insert({ user_id: user.id, spot_id: spot.id, list_id: data.id })
      setLists(prev => [...prev, data])
      setListItems(prev => new Set([...prev, data.id]))
    }
    setNewListName('')
    setCreatingList(false)
    setCreating(false)
  }

  if (!user) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-sheet" onClick={e => e.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-title">Save to List</div>
          <div style={{ padding: '0 20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Sign in to save spots to your lists.
            </div>
          </div>
          <div className="modal-cancel" onClick={onClose}>Close</div>
        </div>
      </div>
    )
  }

  const anySelected = isFav || listItems.size > 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-title">Save to</div>

        {/* Favorites */}
        <div className="modal-row" onClick={toggleFavorites}>
          <BookmarkSVG filled={isFav} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Favorites</div>
          </div>
          <SquareToggle selected={isFav} />
        </div>

        {/* Custom lists */}
        {!loading && lists.map(list => {
          const isIn = listItems.has(list.id)
          return (
            <div key={list.id} className="modal-row" onClick={() => toggleList(list.id)}>
              <BookmarkSVG filled={isIn} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{list.name}</div>
              </div>
              <SquareToggle selected={isIn} />
            </div>
          )
        })}

        {/* Create new list */}
        {creatingList ? (
          <div style={{ padding: '12px 20px' }}>
            <input
              className="form-input"
              placeholder="List name..."
              value={newListName}
              onChange={e => setNewListName(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') createList() }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn-salmon" onClick={createList} disabled={creating} style={{ flex: 1, padding: 10 }}>
                {creating ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={() => { setCreatingList(false); setNewListName('') }}
                style={{ flex: 1, padding: 10, borderRadius: 6, background: '#ECEDF2', border: 'none', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-row" onClick={() => setCreatingList(true)}>
            <div style={{ width: 34, height: 34, borderRadius: 6, background: '#f5ede0', border: '1px solid #e8d0c0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <line x1="7" y1="2" x2="7" y2="12" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="2" y1="7" x2="12" y2="7" stroke="#d4785a" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Create New List</div>
          </div>
        )}

        {/* Save Spot button */}
        <div style={{ padding: '10px 14px 0' }}>
          <button
            className="btn-salmon"
            onClick={onClose}
            style={{ background: anySelected ? '#d4785a' : '#C8CAD4', transition: 'background 0.2s' }}
          >
            Save Spot
          </button>
        </div>
      </div>
    </div>
  )
}
