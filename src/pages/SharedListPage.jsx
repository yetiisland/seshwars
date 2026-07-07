import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SpotCard from '../components/SpotCard'

export default function SharedListPage() {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const [list, setList] = useState(null)
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      // Use select('*') so missing columns (e.g. is_favorites if not yet added) don't 400
      const { data: listData, error: listError } = await supabase
        .from('spot_lists')
        .select('*')
        .eq('share_token', shareToken)
        .maybeSingle()

      if (listError || !listData) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setList(listData)

      // Favorites lists (is_favorites = true) use user_id + null list_id; others use list_id
      const savedQuery = listData.is_favorites
        ? supabase.from('saved_spots').select('spot_id').eq('user_id', listData.user_id).is('list_id', null)
        : supabase.from('saved_spots').select('spot_id').eq('list_id', listData.id)

      const { data: items } = await savedQuery

      const ids = (items || []).map(i => i.spot_id)
      if (ids.length === 0) { setLoading(false); return }

      const [spotsRes, reviewsRes] = await Promise.all([
        supabase.from('spots').select('*').in('id', ids),
        supabase.from('spot_reviews').select('spot_id, rating').in('spot_id', ids),
      ])

      if (spotsRes.data) {
        const rMap = {}
        for (const r of (reviewsRes.data || [])) {
          if (!rMap[r.spot_id]) rMap[r.spot_id] = { sum: 0, count: 0 }
          rMap[r.spot_id].sum += r.rating
          rMap[r.spot_id].count++
        }

        const merged = spotsRes.data.map(s => ({
          ...s,
          avg_rating: rMap[s.id] ? parseFloat((rMap[s.id].sum / rMap[s.id].count).toFixed(1)) : null,
          rating_count: rMap[s.id]?.count || 0,
        }))

        // Public + unlisted + approved only, never private
        const visible = merged.filter(s => {
          const vis = s.visibility || 'public'
          const mod = s.moderation_status
          const okMod = !mod || mod === 'approved'
          const okVis = vis === 'public' || vis === 'unlisted'
          return okMod && okVis
        })

        setSpots(visible)
      }
      setLoading(false)
    }
    load()
  }, [shareToken])

  const handleSpotClick = (spot) => {
    navigate(`/spots/${spot.slug || spot.id}`)
  }

  const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDF8F0', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#9a8878', fontWeight: 700 }}>
        Loading...
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#FDF8F0', gap: 12, padding: '0 32px', textAlign: 'center', fontFamily: 'Barlow, sans-serif' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14' }}>This list isn't available.</div>
        <div style={{ fontSize: 11, color: '#9a8878', fontWeight: 600 }}>The link may be invalid or the list was deleted.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
          ← Open Sesh Wars
        </button>
      </div>
    )
  }

  return (
    <div className="desktop-page-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px 12px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        background: '#FDF8F0',
        borderBottom: '1px solid #E8DDD0',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, fontWeight: 900, color: '#d4785a', letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', marginBottom: 6 }}>
          Sesh Wars
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#2a1e14', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center' }}>
          {list?.name}
        </div>
        <div style={{ fontSize: 10, color: '#9a8878', fontWeight: 700, textAlign: 'center', marginTop: 3 }}>
          {spots.length} spot{spots.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Spots */}
      <div className="scroll-area" style={{ paddingTop: 8 }}>
        {spots.length === 0 ? (
          <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: '#9a8878', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
            No spots in this list yet.
          </div>
        ) : (
          spots.map(spot => (
            <SpotCard
              key={spot.id}
              spot={spot}
              saved={false}
              onSavePress={() => {}}
              onClick={handleSpotClick}
            />
          ))
        )}

        {/* CTA */}
        <div style={{ margin: '20px 16px', padding: '20px 16px', background: '#fff', border: '1px solid #EAD8C8', borderRadius: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#2a1e14', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Sesh Wars
          </div>
          <div style={{ fontSize: 12, color: '#9a8878', lineHeight: 1.6, marginBottom: 14 }}>
            Discover & share skate spots with your crew.
          </div>
          <button
            onClick={() => navigate('/')}
            style={{ padding: '11px 28px', borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
          >
            Open App
          </button>
        </div>

        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </div>
  )
}
