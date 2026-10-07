import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { transformImageUrl } from '../utils/imageUrl'
import { sortTricks } from '../lib/trickSort'
import TrickCheckmark from '../components/TrickCheckmark'
import TabBar from '../components/TabBar'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

function formatLandedDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

// Public, read-only trick list share link — modelled on SharedListPage.jsx
// (the saved-list equivalent), loaded through get_shared_trick_list, the
// one RPC callable without login. Grouped by spot, same shape as the
// authenticated trick list detail page, minus anything editable.
export default function SharedTrickListPage() {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const [listName, setListName] = useState('')
  const [ownerUsername, setOwnerUsername] = useState('')
  const [rows, setRows] = useState([])
  const [spotDetails, setSpotDetails] = useState({}) // spot_id -> { title, slug, photos } — best-effort, see note below
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc('get_shared_trick_list', { p_token: shareToken })
      if (error || !data || data.length === 0) { setNotFound(true); setLoading(false); return }
      setListName(data[0].list_name || '')
      setOwnerUsername(data[0].owner_username || '')
      setRows(data)

      // get_shared_trick_list doesn't carry spot title/photo (only
      // spot_id) — this is a best-effort direct read of the spots table,
      // not a RLS-sanctioned public RPC the way get_shared_list_spots is
      // for saved lists. Unconfirmed whether spots RLS allows anonymous
      // reads; if it doesn't, these cards fall back to a bare "Spot" label
      // with no thumbnail rather than failing the whole page.
      const spotIds = [...new Set(data.map(r => r.spot_id).filter(Boolean))]
      if (spotIds.length > 0) {
        const { data: spotsData } = await supabase.from('spots').select('id, title, slug, photos').in('id', spotIds)
        const map = {}
        for (const s of spotsData || []) map[s.id] = s
        setSpotDetails(map)
      }
      setLoading(false)
    }
    load()
  }, [shareToken])

  const handleSpotClick = (spotId) => {
    const detail = spotDetails[spotId]
    navigate(`/spots/${detail?.slug || spotId}`)
  }

  const handleTabChange = (tabId) => {
    sessionStorage.setItem('activeTab', tabId)
    navigate('/')
  }

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
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14' }}>This trick list isn't available.</div>
        <div style={{ fontSize: 11, color: '#9a8878', fontWeight: 600 }}>The link may be invalid or the list was deleted.</div>
        <button onClick={() => navigate('/')} style={{ marginTop: 8, fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
          ← Open Sesh Wars
        </button>
      </div>
    )
  }

  // Same grouping convention as get_trick_list_view: one row per trick; a
  // spot with no tricks returns one row with null trick fields; an empty
  // list returns one row with a null spot_id (skipped).
  const grouped = (() => {
    if (rows.length === 0 || (rows.length === 1 && !rows[0].spot_id)) return []
    const order = []
    const map = new Map()
    for (const r of rows) {
      if (!r.spot_id) continue
      if (!map.has(r.spot_id)) { map.set(r.spot_id, []); order.push(r.spot_id) }
      if (r.trick_name) map.get(r.spot_id).push(r)
    }
    return order.map(spotId => ({
      spotId,
      tricks: sortTricks(map.get(spotId).map(t => ({ name: t.trick_name, landed: t.landed, landed_at: t.landed_at, created_at: t.created_at }))),
    }))
  })()

  return (
    <div className="desktop-page-root" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div
          onClick={() => navigate('/')}
          style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0, padding: '0 8px' }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listName}</div>
          {ownerUsername && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, marginTop: 2 }}>@{ownerUsername}</div>}
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className="scroll-area" style={{ paddingTop: 10 }}>
        <div style={{ padding: '0 14px', maxWidth: 480, margin: '0 auto' }}>
          {grouped.length === 0 ? (
            <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: '#9a8878', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
              No spots in this list yet.
            </div>
          ) : (
            grouped.map(group => {
              const detail = spotDetails[group.spotId]
              return (
                <div key={group.spotId} style={{ marginBottom: 18 }}>
                  <div onClick={() => handleSpotClick(group.spotId)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 6, background: '#F0E8DE', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {detail?.photos?.[0] && (
                        <img src={transformImageUrl(detail.photos[0], 88)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {detail?.title || 'Spot'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {group.tricks.length === 0 ? (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>No tricks yet.</div>
                    ) : group.tricks.map((trick, i) => (
                      <div key={`${trick.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '8px 12px' }}>
                        <TrickCheckmark landed={trick.landed} />
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

      <TabBar active="" onChange={handleTabChange} user={user} />
    </div>
  )
}
