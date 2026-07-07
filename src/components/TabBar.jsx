import { useState } from 'react'
import { MapFoldedIcon, BookmarkIcon } from './Icons'

export default function TabBar({ active, onChange, user, profileAvatar, profileInitials }) {
  const [avatarError, setAvatarError] = useState(false)
  const tabs = [
    { id: 'spots', label: 'Spots', Icon: MapFoldedIcon },
    { id: 'saved', label: 'Saved', Icon: BookmarkIcon },
    { id: 'profile', label: 'Profile', Icon: null },
  ]

  return (
    <div className="tab-bar">
      {tabs.map(({ id, Icon }) => (
        <div
          key={id}
          className="tab-item"
          onClick={() => onChange(id)}
          style={{ opacity: 1 }}
        >
          {id === 'profile' ? (
            <div style={{
              width: 33, height: 33, borderRadius: '50%',
              background: (profileAvatar && !avatarError) ? 'transparent' : '#d4785a',
              border: active === 'profile' ? '2.5px solid #fff' : '2.5px solid rgba(255,255,255,0.3)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {profileAvatar && !avatarError ? (
                <img src={profileAvatar} alt="Profile" onError={() => setAvatarError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {profileInitials || user?.email?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
          ) : (
            <Icon color={active === id ? '#ffffff' : 'rgba(255,255,255,0.55)'} size={36} filled={active === id} />
          )}
        </div>
      ))}
    </div>
  )
}
