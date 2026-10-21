import { NAV_TABS } from '../lib/navTabs'
import InitialsAvatar from './InitialsAvatar'

function formatCount(n) {
  if (n > 99) return '99+'
  return String(n)
}

export default function TabBar({ active, onChange, user, profileAvatar, profileInitials, notificationCount = 0 }) {
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
            <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <InitialsAvatar
                  avatarUrl={profileAvatar}
                  initials={profileInitials || 'U'}
                  size={33}
                  bg="#d4785a"
                  ring={active === 'profile' ? '0 0 0 2.5px #fff' : '0 0 0 2.5px rgba(255,255,255,0.3)'}
                />
                {notificationCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -4, right: -4,
                    minWidth: 16, height: 16, borderRadius: 8,
                    background: '#d4785a', border: '2px solid #FDF8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 3px',
                  }}>
                    <span style={{ fontSize: 8, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                      {formatCount(notificationCount)}
                    </span>
                  </div>
                )}
              </div>
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
