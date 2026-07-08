import { BookmarkIcon, ArrowIcon } from './Icons'
import TagsRow from './TagsRow'

const normalizeType = (t) => (t === 'Park' ? 'Skatepark' : t)

function bustStyle(rating) {
  if (!rating) return null
  if (rating === 'No Bust') return { background: '#4a7a3a', color: '#ffffff', border: '1px solid #3d6830', borderRadius: 6 }
  if (rating === 'Bust') return { background: '#c0453a', color: '#ffffff', border: '1px solid #a83830', borderRadius: 6 }
  if (rating === 'Medium Bust' || rating === 'Weekends Only' || rating === 'Weekdays Only') return { background: '#c8a020', color: '#ffffff', border: '1px solid #b08818', borderRadius: 6 }
  return { background: '#3D4454', color: '#FFFFFF', border: '1px solid #2e3344', borderRadius: 6 }
}

export default function SpotCard({ spot, saved, onSavePress, onClick, highlighted, onHidePress, onUnhidePress }) {
  const handleSave = (e) => {
    e.stopPropagation()
    onSavePress?.(spot)
  }

  const bs = bustStyle(spot.bust_rating)
  const isShop = spot.type === 'Skate Shop'
  const displayType = normalizeType(spot.type)
  const cautionText = spot.most_recent_report === 'Other'
    ? (spot.most_recent_report_custom || 'Spot Reported')
    : spot.most_recent_report

  return (
    <div
      className="spot-card"
      data-spot-id={spot.id}
      style={{
        ...(highlighted ? { borderColor: '#d4785a', boxShadow: '0 0 0 2px rgba(212,120,90,0.2)' } : {}),
        ...(isShop ? { background: '#3D4454', border: '1px solid #2e3344' } : {}),
      }}
      onClick={() => onClick(spot)}
    >
      <div className="spot-card-img">
        {spot.photos?.[0] ? (
          <img src={spot.photos[0]} alt={spot.title} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: isShop ? '#2e3344' : '#F0E8DE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="60" height="34" viewBox="0 0 60 34" fill="none">
              <rect x="2" y="22" width="56" height="8" rx="1.5" fill={isShop ? '#3a3d50' : '#ddd0bc'} />
              <rect x="6" y="12" width="48" height="8" rx="1.5" fill={isShop ? '#434658' : '#e0cebc'} />
              <rect x="10" y="4" width="40" height="7" rx="1.5" fill={isShop ? '#4c5060' : '#e8d8c8'} />
            </svg>
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <div className="spot-badge">{displayType}</div>
          {bs && (
            <div style={{ ...bs, fontSize: 9, padding: '3px 7px', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              {spot.bust_rating}
            </div>
          )}
        </div>
        {spot.most_recent_report && spot.most_recent_report !== 'Skateable Again' && (
          <div style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 3, background: '#f5c518', borderRadius: 6, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4, maxWidth: 'calc(100% - 16px)' }}>
            <svg width="9" height="8" viewBox="0 0 18 16" fill="none">
              <path d="M9 1L17 15H1L9 1Z" stroke="#000" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
              <line x1="9" y1="5.5" x2="9" y2="10" stroke="#000" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="9" cy="12.5" r="0.9" fill="#000" />
            </svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#000', letterSpacing: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cautionText}</span>
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, display: 'flex', gap: 4 }}>
          {onHidePress && (
            <div
              style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onHidePress(spot) }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="#d4785a" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" stroke="#d4785a" strokeWidth="1.8" />
                <line x1="3" y1="3" x2="21" y2="21" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          )}
          {onUnhidePress && (
            <div
              style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onUnhidePress(spot) }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="#d4785a" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" stroke="#d4785a" strokeWidth="1.8" />
              </svg>
            </div>
          )}
          <div
            style={{ width: 34, height: 34, borderRadius: 6, background: '#f5e6e0', border: '1px solid #e8c0b0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            onClick={handleSave}
          >
            <BookmarkIcon color="#d4785a" size={18} filled={saved} />
          </div>
        </div>
      </div>
      <div className="spot-card-body">
        <div className="spot-title-row">
          <div className="spot-title" style={isShop ? { color: '#FFFFFF', fontWeight: 900 } : undefined}>{spot.title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {spot.avg_rating != null && spot.rating_count > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L14.5 9.5H22.5L16.1 13.9L18.5 21.5L12 17.2L5.5 21.5L7.9 13.9L1.5 9.5H9.5Z" fill="#3D4454" />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#3D4454' }}>{spot.avg_rating.toFixed(1)}</span>
              </div>
            )}
            {spot.avg_rating != null && spot.rating_count > 0 && spot.distance != null && (
              <span style={{ color: '#b0a090', fontSize: 10 }}>·</span>
            )}
            {spot.distance != null && <div className="dist-text">{spot.distance} mi</div>}
          </div>
        </div>
        <div className="spot-desc" style={isShop ? { color: 'rgba(255,255,255,0.85)' } : undefined}>{spot.description}</div>
        <div className="spot-footer">
          {isShop
            ? <span style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3, flex: 1 }}>Support Your Local Skate Shop</span>
            : <TagsRow features={[...(spot.features || []), ...(spot.lighting ? [spot.lighting] : [])]} />
          }
          <div className="arrow-btn" style={{ flexShrink: 0, marginLeft: 'auto' }}><ArrowIcon /></div>
        </div>
      </div>
    </div>
  )
}
