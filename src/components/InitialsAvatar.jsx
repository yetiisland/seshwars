const PALETTE = ['#d4785a', '#5a85c4', '#6ab87a', '#c45a7a', '#8a6ac4', '#c4a05a', '#5ab0c4']

function hashColor(id) {
  if (!id) return '#3D4454'
  let h = 0
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0
  return PALETTE[Math.abs(h) % PALETTE.length]
}

function deriveInitials(profile, user) {
  if (!profile && !user) return 'U'
  const first = (profile?.first_name || '').trim()
  const last = (profile?.last_name || '').trim()
  const username = (profile?.username || '').trim()
  const f0 = first[0]?.toUpperCase() || ''
  const l0 = last[0]?.toUpperCase() || ''
  if (f0 && l0) return f0 + l0
  if (f0) return f0
  if (username) return username[0].toUpperCase()
  if (user?.email) return user.email[0].toUpperCase()
  return 'U'
}

export default function InitialsAvatar({ profile, user, size = 32 }) {
  const id = profile?.id || user?.id
  const bg = hashColor(id)
  const text = deriveInitials(profile, user)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: Math.max(7, Math.round(size * 0.38)), fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif', lineHeight: 1 }}>{text}</span>
    </div>
  )
}
