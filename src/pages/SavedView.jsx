import SpotCard from '../components/SpotCard'
import Navbar from '../components/Navbar'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

export default function SavedView({ spots, saved, onToggleSave, onSpotClick, onAddSpot, onSearch, showNav = true }) {
  const savedSpots = spots.filter(s => saved.has(s.id))

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8DDD0', textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Saved Spots
        </div>
      </div>
      <div className="scroll-area" style={{ paddingTop: 14 }}>
        {savedSpots.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 32px', gap: 12 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M20 5L23.5 16H35L25.5 22.5L29 33.5L20 27L11 33.5L14.5 22.5L5 16H16.5L20 5Z" stroke="#C8CAD4" strokeWidth="2" strokeLinejoin="round" fill="none" />
            </svg>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textAlign: 'center', letterSpacing: 0.5 }}>
              No saved spots yet. Tap the star on any spot to save it.
            </div>
          </div>
        ) : (
          savedSpots.map(spot => (
            <SpotCard key={spot.id} spot={spot} saved={true} onToggleSave={onToggleSave} onClick={onSpotClick} />
          ))
        )}
        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </>
  )
}
