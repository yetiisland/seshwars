import { useState, useEffect, useRef, useMemo } from 'react'
import Navbar from '../components/Navbar'
import FiltersModal from '../components/FiltersModal'
import SpotCard from '../components/SpotCard'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

// Module-level scroll cache — survives App unmount/remount so position is restored on return from spot page
let _savedScrollTop = 0

const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)

export default function ListView({ spots, loading, saved, onSavePress, onSpotClick, onAddSpot, onSearch, searchLocation, onClearSearch, showNav = true, filters: propFilters, onFiltersChange, distance, onDistanceChange, onHidePress, sortMode, onSortModeChange }) {
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

  // ListView now stays mounted across the map<->list toggle (App.jsx just
  // hides it via display:none), so scroll position survives that for free —
  // no restore logic needed there. But a filter/sort/search change is a new
  // result set, and should land the user at the top of it rather than
  // wherever they happened to be scrolled to in the old one. Skip the very
  // first run so this doesn't fight the mount-restore effect above.
  const isFirstFilterRun = useRef(true)
  useEffect(() => {
    if (isFirstFilterRun.current) { isFirstFilterRun.current = false; return }
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [filters, sortMode, searchLocation])

  // Desktop: on wide viewports the list column is centered with empty margin
  // on either side, and that margin isn't itself scrollable — the wheel does
  // nothing unless the cursor is directly over the narrow list. Forward wheel
  // input from anywhere on screen into the list's own scroll position. Native
  // in-bounds scrolling (over the list itself) is left alone. Wheel events
  // aren't fired by touch scrolling, and the width check gates out mobile/
  // Capacitor explicitly, so this can't affect either.
  useEffect(() => {
    const handleWheel = (e) => {
      if (window.innerWidth < 769) return
      const el = scrollRef.current
      if (!el || el.contains(e.target)) return
      el.scrollTop += e.deltaY
    }
    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  const handleSpotClick = (spot) => {
    if (scrollRef.current) _savedScrollTop = scrollRef.current.scrollTop
    onSpotClick(spot)
  }

  const filtered = useMemo(() => spots.filter(s => {
    if (filters.includes('All') || filters.length === 0) return true
    const _TYPES = new Set(['Street', 'DIY', 'Skatepark', 'Skate Shop'])
    const _BUSTS = new Set(['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only'])
    const _LIGHTING = new Set(['Lights', 'No Lights'])
    const selTypes = filters.filter(f => _TYPES.has(f))
    const selBusts = filters.filter(f => _BUSTS.has(f))
    const selLighting = filters.filter(f => _LIGHTING.has(f))
    const selFeats = filters.filter(f => !_TYPES.has(f) && !_BUSTS.has(f) && !_LIGHTING.has(f) && f !== 'All')
    if (selTypes.length > 0 && !selTypes.some(t => normalizeType(s.type) === normalizeType(t))) return false
    if (selFeats.length > 0 && !selFeats.some(f => (s.features || []).map(x => x.toLowerCase()).includes(f.toLowerCase()))) return false
    if (selBusts.length > 0 && !selBusts.includes(s.bust_rating)) return false
    if (selLighting.length > 0 && !selLighting.includes(s.lighting)) return false
    return true
  }), [spots, filters])

  const sorted = useMemo(() => {
    if (!sortMode) return filtered
    if (sortMode === 'new') {
      return [...filtered].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return tb - ta
      })
    }
    if (sortMode === 'rated') {
      return [...filtered].sort((a, b) => {
        const aRated = (a.rating_count || 0) > 0
        const bRated = (b.rating_count || 0) > 0
        if (aRated && bRated) return (b.avg_rating || 0) - (a.avg_rating || 0)
        if (aRated) return -1
        if (bRated) return 1
        // Both unrated: fall back to distance sort
        const ad = a.distance ?? Infinity
        const bd = b.distance ?? Infinity
        return ad - bd
      })
    }
    return filtered
  }, [filtered, sortMode])

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      <FiltersModal active={filters} onChange={handleFiltersChange} distance={distance} onDistanceChange={onDistanceChange} sortMode={sortMode} onSortModeChange={onSortModeChange} searchLocation={searchLocation} onClearSearch={onClearSearch} />
      <div className="scroll-area" ref={scrollRef}>
        <div style={{ padding: '0 0 2px', fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', paddingLeft: 16, marginBottom: 8 }}>
          {loading ? 'Loading...' : `${sorted.length} spot${sorted.length !== 1 ? 's' : ''}`}
        </div>
        {loading ? (
          <div className="loading">Loading spots...</div>
        ) : sorted.length === 0 ? (
          <div className="loading">No spots found</div>
        ) : (
          <div className="spots-list-grid">
            {sorted.map(spot => (
              <SpotCard key={spot.id} spot={spot} saved={saved.has(spot.id)} onSavePress={onSavePress} onClick={handleSpotClick} onHidePress={onHidePress} />
            ))}
          </div>
        )}
        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </>
  )
}
