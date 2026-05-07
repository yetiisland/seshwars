import { StarFilledIcon, StarIcon, ArrowIcon } from './Icons'
import TagsRow from './TagsRow'

function bustStyle(rating) {
  if (!rating) return null
  return { background: '#3D4454', color: '#FFFFFF', border: '1px solid #2e3344', borderRadius: 6 }
}

export default function SpotCard({ spot, saved, onToggleSave, onClick, highlighted }) {
  const handleSave = (e) => {
    e.stopPropagation()
    onToggleSave(spot.id)
  }

  const bs = bustStyle(spot.bust_rating)

  return (
    <div
      className="spot-card"
      data-spot-id={spot.id}
      style={highlighted ? { borderColor: '#d4785a', boxShadow: '0 0 0 2px rgba(212,120,90,0.2)' } : undefined}
      onClick={() => onClick(spot)}
    >
      <div className="spot-card-img">
        {spot.photos?.[0] ? (
          <img src={spot.photos[0]} alt={spot.title} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#F0E8DE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
              <rect x="2" y="22" width="56" height="8" rx="1.5" fill="#ddd0bc" />
              <rect x="6" y="12" width="48" height="8" rx="1.5" fill="#e0cebc" />
              <rect x="10" y="4" width="40" height="7" rx="1.5" fill="#e8d8c8" />
            </svg>
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <div className="spot-badge">{spot.type}</div>
          {bs && (
            <div style={{ ...bs, fontSize: 9, padding: '3px 7px', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              {spot.bust_rating}
            </div>
          )}
        </div>
        <div className={`star-btn ${saved ? 'star-btn--saved' : ''}`} style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} onClick={handleSave}>
          {saved ? <StarFilledIcon /> : <StarIcon />}
        </div>
      </div>
      <div className="spot-card-body">
        <div className="spot-title-row">
          <div className="spot-title">{spot.title}</div>
          {spot.distance != null && <div className="dist-text">{spot.distance} mi</div>}
        </div>
        <div className="spot-desc">{spot.description}</div>
        <div className="spot-footer">
          <TagsRow features={spot.features || []} />
          <div className="arrow-btn" style={{ flexShrink: 0 }}><ArrowIcon /></div>
        </div>
      </div>
    </div>
  )
}
