import { useState, useEffect, useRef } from 'react'
import Navbar from '../components/Navbar'
import FiltersModal from '../components/FiltersModal'
import SpotCard from '../components/SpotCard'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

// Module-level scroll cache — survives App unmount/remount so position is restored on return from spot page
let _savedScrollTop = 0

function LocationChip({ location, onClear }) {
  return (
    <div style={{ padding: '6px 16px', flexShrink: 0 }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', borderRadius: 6, padding: '5px 10px 5px 8px' }}>
        <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
          <path d="M5 0C2.25 0 0 2.25 0 5C0 7.75 5 12 5 12C5 12 10 7.75 10 5C10 2.25 7.75 0 5 0Z" fill="#d4785a" />
          <circle cx="5" cy="5" r="2" fill="#fff" />
        </svg>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#d4785a', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Near {location.name}
        </span>
        <div onClick={onClear} style={{ marginLeft: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" fill="rgba(212,120,90,0.15)" />
            <line x1="4" y1="4" x2="8" y2="8" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
            <line x1="8" y1="4" x2="4" y2="8" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}

const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)

export default function ListView({ spots, loading, saved, onSavePress, onSpotClick, onAddSpot, onSearch, searchLocation, onClearSearch, showNav = true, filters: propFilters, onFiltersChange, distance, onDistanceChange, onHidePress }) {
  const [localFilters, setLocalFilters] = useState(['All'])
  const filters = propFilters ?? localFilters
  const handleFiltersChange = onFiltersChange ?? setLocalFilters
  const scrollRef = useRef(null)

  // Restore scroll position on mount (e.g. returning from a spot page)
  useEffect(() => {
    if (scrollRef.current && _savedScrollTop > 0) {
      scrollRef.current.scrollTop = _savedScrollTop
    }
  }, [])

  const handleSpotClick = (spot) => {
    if (scrollRef.current) _savedScrollTop = scrollRef.current.scrollTop
    onSpotClick(spot)
  }

  const filtered = spots.filter(s => {
    if (filters.includes('All') || filters.length === 0) return true
    const _TYPES = new Set(['Street', 'DIY', 'Skatepark', 'Skate Shop'])
    const _BUSTS = new Set(['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only'])
    const selTypes = filters.filter(f => _TYPES.has(f))
    const selBusts = filters.filter(f => _BUSTS.has(f))
    const selFeats = filters.filter(f => !_TYPES.has(f) && !_BUSTS.has(f) && f !== 'All')
    if (selTypes.length > 0 && !selTypes.some(t => normalizeType(s.type) === normalizeType(t))) return false
    if (selFeats.length > 0 && !selFeats.some(f => (s.features || []).map(x => x.toLowerCase()).includes(f.toLowerCase()))) return false
    if (selBusts.length > 0 && !selBusts.includes(s.bust_rating)) return false
    return true
  })

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      {searchLocation && <LocationChip location={searchLocation} onClear={onClearSearch} />}
      <FiltersModal active={filters} onChange={handleFiltersChange} distance={distance} onDistanceChange={onDistanceChange} />
      <div className="scroll-area" ref={scrollRef}>
        <div style={{ padding: '0 0 2px', fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', paddingLeft: 16, marginBottom: 8 }}>
          {loading ? 'Loading...' : `${filtered.length} spot${filtered.length !== 1 ? 's' : ''}`}
        </div>
        {loading ? (
          <div className="loading">Loading spots...</div>
        ) : filtered.length === 0 ? (
          <div className="loading">No spots found</div>
        ) : (
          <div className="spots-list-grid">
            {filtered.map(spot => (
              <SpotCard key={spot.id} spot={spot} saved={saved.has(spot.id)} onSavePress={onSavePress} onClick={handleSpotClick} onHidePress={onHidePress} />
            ))}
          </div>
        )}
        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </>
  )
}
