import { useState } from 'react'
import { NAV_TABS } from '../lib/navTabs'

function formatCount(n) {
  if (n > 99) return '99+'
  return String(n)
}

export default function TabBar({ active, onChange, user, profileAvatar, profileInitials, notificationCount = 0 }) {
  const [avatarError, setAvatarError] = useState(false)

  return (
    <div className="tab-bar">
      {NAV_TABS.map(({ id, label, Icon }) => (
        <div
          key={id}
          className="tab-item"
          onClick={() => onChange(id)}
          style={{ opacity: 1 }}
        >
          {id === 'profile' ? (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 33, height: 33, borderRadius: '50%',
                background: (profileAvatar && !avatarError) ? 'transparent' : '#d4785a',
                border: active === 'profile' ? '2.5px solid #fff' : '2.5px solid rgba(255,255,255,0.3)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {profileAvatar && !avatarError ? (
                  <img src={profileAvatar} alt="Profile" onError={() => setAvatarError(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                    {profileInitials || user?.email?.[0]?.toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              {notificationCount > 0 && (
                <div style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: '#d4785a', border: '1.5px solid #3D4454',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  <span style={{ fontSize: 8, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                    {formatCount(notificationCount)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <Icon color={active === id ? '#ffffff' : 'rgba(255,255,255,0.55)'} size={36} filled={active === id} />
          )}
          <span className="tab-label" style={{ opacity: active === id ? 1 : 0.55 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
