import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { supabase } from '../lib/supabase'
import { transformImageUrl } from '../utils/imageUrl'
import TrickCheckmark from '../components/TrickCheckmark'

const FILTERS = [['all', 'All'], ['landed', 'Landed'], ['todo', 'To Do']]

function notifyTricksChanged() {
  window.dispatchEvent(new Event('seshwars:tricks-changed'))
}

export default function TrickListPage({ user, spots, onSpotClick }) {
  const [tricks, setTricks] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const filterTrackRef = useRef(null)
  const filterThumbRef = useRef(null)
  const filterSegmentRefs = useRef({})
  const positionFilterThumb = () => {
    const track = filterTrackRef.current
    const thumb = filterThumbRef.current
    const activeEl = filterSegmentRefs.current[filter]
    if (!track || !thumb || !activeEl) return
    const trackRect = track.getBoundingClientRect()
    const elRect = activeEl.getBoundingClientRect()
    thumb.style.width = `${elRect.width}px`
    thumb.style.transform = `translateX(${elRect.left - trackRect.left}px)`
  }
  useLayoutEffect(() => { positionFilterThumb() })
  useEffect(() => {
    window.addEventListener('resize', positionFilterThumb)
    return () => window.removeEventListener('resize', positionFilterThumb)
  }, [filter])

  const fetchTricks = async () => {
    if (!user?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('user_tricks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
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

  useEffect(() => { fetchTricks() }, [user?.id])

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

  const filtered = tricks.filter(t => filter === 'landed' ? t.landed : filter === 'todo' ? !t.landed : true)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 4px' }}>
        <div ref={filterTrackRef} style={{ position: 'relative', display: 'flex', background: '#d4785a', borderRadius: 50, padding: 3, boxShadow: '0 3px 14px rgba(0,0,0,0.28)' }}>
          <div ref={filterThumbRef} style={{ position: 'absolute', top: 3, bottom: 3, left: 0, borderRadius: 50, background: '#fff', transition: 'transform 340ms cubic-bezier(.32,.9,.36,1)', zIndex: 0 }} />
          {FILTERS.map(([key, label]) => (
            <div
              key={key}
              ref={el => { filterSegmentRefs.current[key] = el }}
              onClick={() => setFilter(key)}
              style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', padding: '6px 16px', borderRadius: 50, color: filter === key ? '#d4785a' : 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 14px 0', maxWidth: 480, margin: '0 auto' }}>
        {!loading && tricks.length === 0 ? (
          <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            No tricks yet. Add tricks from any spot's page.
          </div>
        ) : !loading && filtered.length === 0 ? (
          <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            {filter === 'landed' ? 'No landed tricks yet.' : 'Nothing left to do!'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(trick => (
              <div
                key={trick.id}
                onClick={() => handleCardClick(trick)}
                style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              >
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
      </div>
    </div>
  )
}
