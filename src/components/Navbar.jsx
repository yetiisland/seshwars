import Logo from './Logo'
import { PlusIcon } from './Icons'

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4" stroke="#d4785a" strokeWidth="1.3" />
      <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export default function Navbar({ onAddSpot, onSearch }) {
  return (
    <div className="navbar-cream">
      <Logo />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onSearch && (
          <div
            onClick={onSearch}
            style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <SearchIcon />
          </div>
        )}
        <button className="btn-drop-spot" onClick={onAddSpot}>
          <PlusIcon color="#fff" />
          <span>DROP A SPOT</span>
        </button>
      </div>
    </div>
  )
}
