import { ListIcon, MapPinIcon, StarIcon, ProfileIcon } from './Icons'

export default function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'list', label: 'List', Icon: ListIcon },
    { id: 'map', label: 'Map', Icon: MapPinIcon },
    { id: 'saved', label: 'Saved', Icon: StarIcon },
    { id: 'profile', label: 'Profile', Icon: ProfileIcon },
  ]

  return (
    <div className="tab-bar">
      {tabs.map(({ id, label, Icon }) => (
        <div
          key={id}
          className={`tab-item ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          <div className="tab-icon">
            <Icon color="#ffffff" size={22} filled={active === id} />
          </div>
          <div className="tab-label">{label}</div>
        </div>
      ))}
    </div>
  )
}
