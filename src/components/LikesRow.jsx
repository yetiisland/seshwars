import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getProfiles } from '../utils/profileCache'

function Heart({ filled, color = '#d4785a', size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 18" fill="none" style={{ display: 'block' }}>
      {filled
        ? <path d="M10 16S1 10.5 1 5.5A4.5 4.5 0 0 1 10 3.2A4.5 4.5 0 0 1 19 5.5C19 10.5 10 16 10 16Z" fill={color} />
        : <path d="M10 16S1 10.5 1 5.5A4.5 4.5 0 0 1 10 3.2A4.5 4.5 0 0 1 19 5.5C19 10.5 10 16 10 16Z" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      }
    </svg>
  )
}

export default function LikesRow({ spotId, user }) {
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(0)
  const [likers, setLikers] = useState([])
  const [animating, setAnimating] = useState(false)
  const [signInPrompt, setSignInPrompt] = useState(false)
  const channelRef = useRef(null)

  const fetchLikes = useCallback(async () => {
    const { data } = await supabase.from('spot_likes').select('user_id').eq('spot_id', spotId)
    if (!data) return
    const ids = data.map(l => l.user_id)
    setCount(ids.length)
    if (user?.id) setLiked(ids.includes(user.id))
    if (ids.length > 0) {
      const profiles = await getProfiles(ids.slice(0, 5))
      setLikers(ids.slice(0, 5).map(id => profiles[id]).filter(Boolean))
    } else {
      setLikers([])
    }
  }, [spotId, user?.id])

  useEffect(() => { fetchLikes() }, [fetchLikes])

  useEffect(() => {
    channelRef.current = supabase
      .channel(`spot-likes-${spotId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spot_likes', filter: `spot_id=eq.${spotId}` }, () => fetchLikes())
      .subscribe()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [spotId, fetchLikes])

  const toggle = async () => {
    if (!user) { setSignInPrompt(true); return }
    setSignInPrompt(false)
    const { data: { user: cu } } = await supabase.auth.getUser()
    if (!cu) return
    setAnimating(true)
    setTimeout(() => setAnimating(false), 300)
    if (liked) {
      setLiked(false); setCount(c => Math.max(0, c - 1))
      await supabase.from('spot_likes').delete().eq('spot_id', spotId).eq('user_id', cu.id)
    } else {
      setLiked(true); setCount(c => c + 1)
      await supabase.from('spot_likes').insert({ spot_id: spotId, user_id: cu.id })
    }
    fetchLikes()
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Heart + count */}
        <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', userSelect: 'none' }}>
          <div style={{ transform: animating ? 'scale(1.35)' : 'scale(1)', transition: 'transform 0.18s ease', display: 'flex' }}>
            <Heart filled={liked} color="#d4785a" size={20} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: liked ? '#d4785a' : 'var(--text-secondary)', fontFamily: 'Barlow, sans-serif' }}>
            {count > 0 ? `${count} like${count !== 1 ? 's' : ''}` : 'Like'}
          </span>
        </div>

        {/* Liked-by avatars */}
        {likers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {likers.map((p, i) => (
              <div
                key={p.id}
                style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid #FDF8F0', overflow: 'hidden', marginLeft: i === 0 ? 0 : -6, background: '#3D4454', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: likers.length - i }}
              >
                {p.avatar_url
                  ? <img src={p.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 7, fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>{(p.username || p.full_name || '?')[0].toUpperCase()}</span>
                }
              </div>
            ))}
            {count > 5 && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, marginLeft: 5, fontFamily: 'Barlow, sans-serif' }}>+{count - 5} more</span>
            )}
          </div>
        )}

        {signInPrompt && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>Sign in to like.</span>
        )}
      </div>
    </div>
  )
}
