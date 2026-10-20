import { useState } from 'react'

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

// Shared avatar — renders a profile photo or a colored initials circle,
// always to this exact structure so misalignment (off-center photos/
// initials, rings that nudge the content) can't happen again:
// - Outer div is the only element with a size; a ring (if any) is a
//   box-shadow on it, never a border, so it can never change the box.
// - The photo is an absolutely-positioned img, the only child, filling
//   the outer div — never sized/placed relative to the initials span.
// - Initials are a plain centered span — no transform/nudge of any kind.
// `profile`/`user` drive the hash-based background + derived initials by
// default (same as before); `avatarUrl`, `initials`, `bg`, `textColor` and
// `ring` override those for call sites that already have the value some
// other way (TabBar's precomputed profileInitials, ProfileView/SpotDetail's
// gray "ECEDF2" theme, a ring color that depends on local state, etc).
export default function InitialsAvatar({ profile, user, size = 32, avatarUrl, initials, bg, textColor, ring }) {
  const [imgError, setImgError] = useState(false)
  const id = profile?.id || user?.id
  const resolvedUrl = avatarUrl !== undefined ? avatarUrl : profile?.avatar_url
  const showPhoto = !!resolvedUrl && !imgError
  const resolvedBg = bg || hashColor(id)
  const resolvedInitials = initials !== undefined ? initials : deriveInitials(profile, user)

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', overflow: 'hidden',
      boxSizing: 'border-box', flexShrink: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', position: 'relative', margin: 0, padding: 0,
      background: showPhoto ? 'transparent' : resolvedBg,
      boxShadow: ring || 'none',
    }}>
      {showPhoto ? (
        <img
          src={resolvedUrl}
          alt=""
          onError={() => setImgError(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', objectFit: 'cover', objectPosition: 'center', margin: 0, padding: 0 }}
        />
      ) : (
        <span style={{
          lineHeight: 1, margin: 0, padding: 0, display: 'block', textAlign: 'center',
          fontSize: Math.max(7, Math.round(size * 0.38)), fontWeight: 900, color: textColor || '#fff',
          fontFamily: 'Barlow, sans-serif',
        }}>{resolvedInitials}</span>
      )}
    </div>
  )
}
