import { ListIcon, BookmarkIcon } from './Icons'

export default function TabBar({ active, onChange, user, profileAvatar }) {
  const tabs = [
    { id: 'spots', label: 'Spots', Icon: ListIcon },
    { id: 'saved', label: 'Saved', Icon: BookmarkIcon },
    { id: 'profile', label: 'Profile', Icon: null },
  ]

  const initial = user?.email?.[0]?.toUpperCase() || '?'

  return (
    <div className="tab-bar">
      {tabs.map(({ id, Icon }) => (
        <div
          key={id}
          className={`tab-item ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {id === 'profile' ? (
            <div style={{
              width: 33, height: 33, borderRadius: '50%',
              background: profileAvatar ? 'transparent' : 'rgba(255,255,255,0.25)',
              border: active === 'profile' ? '2.5px solid #fff' : '2.5px solid rgba(255,255,255,0.3)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {profileAvatar ? (
                <img src={profileAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                  {initial}
                </span>
              )}
            </div>
          ) : (
            <Icon color="#ffffff" size={36} filled={active === id} />
          )}
        </div>
      ))}
    </div>
  )
}
