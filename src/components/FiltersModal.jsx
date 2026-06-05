import { useState } from 'react'
import { createPortal } from 'react-dom'

const TYPES = ['Street', 'DIY', 'Skatepark', 'Skate Shop']
const FEATURES = ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Flat Bar']
const BUST_RATINGS = ['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only']

function bustActiveStyle(f) {
  if (f === 'No Bust') return { background: '#4a7a3a', borderColor: '#3d6830', color: '#ffffff' }
  if (f === 'Medium Bust' || f === 'Weekends Only' || f === 'Weekdays Only') return { background: '#c8a020', borderColor: '#b08818', color: '#ffffff' }
  if (f === 'Bust') return { background: '#c0453a', borderColor: '#a83830', color: '#ffffff' }
  return {}
}

export default function FiltersModal({ active, onChange, compact = false }) {
  const [open, setOpen] = useState(false)
  const activeArr = Array.isArray(active) ? active : [active]
  const activeFilters = activeArr.filter(f => f !== 'All')
  const hasActive = activeFilters.length > 0

  const toggle = (f) => {
    let next
    if (activeArr.includes(f)) {
      next = activeArr.filter(x => x !== f)
      if (next.length === 0) next = ['All']
    } else {
      next = [...activeArr.filter(x => x !== 'All'), f]
    }
    onChange(next)
  }

  const clearAll = () => onChange(['All'])
  const isActive = (f) => activeArr.includes(f)

  return (
    <>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '5px 16px 6px' : '8px 16px 10px', overflowX: 'auto' }}
        className="hide-scroll"
      >
        {/* FILTERS button — always salmon outline, filled when active */}
        <div
          onClick={() => setOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            background: hasActive ? '#d4785a' : '#FDF8F0',
            border: '1.5px solid #d4785a',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
          }}
        >
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <line x1="0" y1="1.5" x2="12" y2="1.5" stroke={hasActive ? '#fff' : '#d4785a'} strokeWidth="1.3" strokeLinecap="round" />
            <line x1="2" y1="5" x2="10" y2="5" stroke={hasActive ? '#fff' : '#d4785a'} strokeWidth="1.3" strokeLinecap="round" />
            <line x1="4" y1="8.5" x2="8" y2="8.5" stroke={hasActive ? '#fff' : '#d4785a'} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: hasActive ? '#fff' : '#d4785a', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
            Filters{hasActive ? ` (${activeFilters.length})` : ''}
          </span>
        </div>

        {/* Active filter chips shown inline */}
        {activeFilters.map(f => {
          const isBust = BUST_RATINGS.includes(f)
          const bStyle = isBust ? bustActiveStyle(f) : {}
          return (
            <div
              key={f}
              className="chip active"
              style={{ flexShrink: 0, ...bStyle, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => toggle(f)}
            >
              {f}
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
          )
        })}
      </div>

      {open && createPortal(
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Filters</div>
              {hasActive && (
                <div onClick={clearAll} style={{ fontSize: 11, color: 'var(--salmon)', fontWeight: 700, cursor: 'pointer' }}>Clear All</div>
              )}
            </div>

            <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Type</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TYPES.map(f => (
                    <div key={f} className={`chip ${isActive(f) ? 'active' : ''}`} onClick={() => toggle(f)}>{f}</div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Features</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {FEATURES.map(f => (
                    <div key={f} className={`chip ${isActive(f) ? 'active' : ''}`} onClick={() => toggle(f)}>{f}</div>
                  ))}
                </div>
              </div>

              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>Bust Rating</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {BUST_RATINGS.map(f => (
                    <div
                      key={f}
                      className={`chip ${isActive(f) ? 'active' : ''}`}
                      style={isActive(f) ? bustActiveStyle(f) : undefined}
                      onClick={() => toggle(f)}
                    >{f}</div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: '0 16px 28px' }}>
              <button
                onClick={() => setOpen(false)}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
