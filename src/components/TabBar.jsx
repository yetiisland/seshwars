import { ListIcon, MapPinIcon, BookmarkIcon, ProfileIcon } from './Icons'

export default function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'list', label: 'List', Icon: ListIcon },
    { id: 'map', label: 'Map', Icon: MapPinIcon },
    { id: 'saved', label: 'Saved', Icon: BookmarkIcon },
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
          <Icon color="#ffffff" size={36} filled={active === id} />
        </div>
      ))}
    </div>
  )
}
