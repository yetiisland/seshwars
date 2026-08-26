import { useState } from 'react'
import { createPortal } from 'react-dom'
import { SPOT_FIELDS, bustChipActiveStyle } from '../lib/spotFields'

const typeField = SPOT_FIELDS.find(f => f.key === 'type')
const TYPE_OPTIONS = ['All', ...typeField.options]
const filterableFields = SPOT_FIELDS.filter(f => f.filterable && f.key !== 'type')
const DISTANCE_OPTIONS = [null, 5, 10, 25, 50, 100]
export default function FiltersModal({ active, onChange, compact = false, distance, onDistanceChange, sortMode, onSortModeChange }) {
  const [open, setOpen] = useState(false)
  const [distanceOpen, setDistanceOpen] = useState(false)
  const [filterClosing, setFilterClosing] = useState(false)
  const [distClosing, setDistClosing] = useState(false)

  const closeFilter = () => { setFilterClosing(true); setTimeout(() => { setFilterClosing(false); setOpen(false) }, 180) }
  const closeDist = () => { setDistClosing(true); setTimeout(() => { setDistClosing(false); setDistanceOpen(false) }, 180) }
  const activeArr = Array.isArray(active) ? active : [active]
  const activeFilters = activeArr.filter(f => f !== 'All')
  const hasActive = activeFilters.length > 0

  const toggle = (f) => {
    let next
    if (f === 'All') {
      next = ['All']
    } else if (activeArr.includes(f)) {
      next = activeArr.filter(x => x !== f)
      if (next.length === 0) next = ['All']
    } else {
      next = [...activeArr.filter(x => x !== 'All'), f]
    }
    onChange(next)
  }

  const clearAll = () => onChange(['All'])
  const isActive = (f) => activeArr.includes(f)

  const selectedTypes = activeArr.filter(f => typeField.options.includes(f))
  const isFieldVisible = (field) => field.showForTypes.some(t => selectedTypes.includes(t))

  const chipColor = (active) => active ? '#fff' : '#d4785a'

  return (
    <>
      <div
        className="hide-scroll"
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: compact ? '5px 16px 6px' : '8px 16px 10px' }}
      >
        {/* FILTERS button with count badge */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            onClick={() => setOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: hasActive ? '#d4785a' : '#FDF8F0',
              border: '1.5px solid #d4785a',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <line x1="0" y1="1.5" x2="12" y2="1.5" stroke={chipColor(hasActive)} strokeWidth="1.3" strokeLinecap="round" />
              <line x1="2" y1="5" x2="10" y2="5" stroke={chipColor(hasActive)} strokeWidth="1.3" strokeLinecap="round" />
              <line x1="4" y1="8.5" x2="8" y2="8.5" stroke={chipColor(hasActive)} strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: chipColor(hasActive), letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
              Filters
            </span>
          </div>
          {hasActive && (
            <div style={{
              position: 'absolute', top: -7, right: -7,
              width: 17, height: 17, borderRadius: '50%',
              background: '#2a1e14', border: '2px solid #FDF8F0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#fff', lineHeight: 1,
              pointerEvents: 'none',
            }}>
              {activeFilters.length}
            </div>
          )}
        </div>

        {/* Distance chip */}
        <div
          onClick={() => setDistanceOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            background: distance ? '#d4785a' : '#FDF8F0',
            border: '1.5px solid #d4785a',
            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
          }}
        >
          <svg width="8" height="10" viewBox="0 0 10 12" fill="none">
            <path d="M5 0C2.25 0 0 2.25 0 5C0 7.75 5 12 5 12C5 12 10 7.75 10 5C10 2.25 7.75 0 5 0Z" fill={chipColor(!!distance)} />
            <circle cx="5" cy="5" r="2" fill={distance ? '#d4785a' : '#FDF8F0'} />
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: chipColor(!!distance), letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
            {distance ? `${distance}mi` : 'Distance'}
          </span>
        </div>

        {onSortModeChange && (
          <>
            <div
              onClick={() => onSortModeChange(sortMode === 'new' ? null : 'new')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                background: sortMode === 'new' ? '#d4785a' : '#FDF8F0',
                border: '1.5px solid #d4785a',
                borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: sortMode === 'new' ? '#fff' : '#d4785a', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
                New Spots
              </span>
            </div>
            <div
              onClick={() => onSortModeChange(sortMode === 'rated' ? null : 'rated')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                background: sortMode === 'rated' ? '#d4785a' : '#FDF8F0',
                border: '1.5px solid #d4785a',
                borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 700, color: sortMode === 'rated' ? '#fff' : '#d4785a', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
                Top Rated
              </span>
            </div>
          </>
        )}
      </div>

      {/* Filters sheet */}
      {(open || filterClosing) && createPortal(
        <div className="modal-overlay" onClick={closeFilter}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '75vh', overflowY: 'auto', ...(filterClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : {}) }}>
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
                  {TYPE_OPTIONS.map(f => (
                    <div key={f} className={`chip ${isActive(f) ? 'active' : ''}`} onClick={() => toggle(f)}>{f}</div>
                  ))}
                </div>
              </div>

              {filterableFields.map(field => {
                if (!isFieldVisible(field)) return null
                return (
                  <div key={field.key}>
                    <div className="section-label" style={{ marginBottom: 8 }}>{field.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {field.options.map(f => {
                        const active = isActive(f)
                        return (
                          <div
                            key={f}
                            className={`chip ${active ? 'active' : ''}`}
                            style={field.key === 'bust_rating' && active ? bustChipActiveStyle(f) : undefined}
                            onClick={() => toggle(f)}
                          >{f}</div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ padding: '0 16px 28px' }}>
              <button
                onClick={closeFilter}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Distance sheet */}
      {(distanceOpen || distClosing) && createPortal(
        <div className="modal-overlay" onClick={closeDist}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={distClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Distance</div>
              {distance && (
                <div onClick={() => { onDistanceChange?.(null); closeDist() }} style={{ fontSize: 11, color: 'var(--salmon)', fontWeight: 700, cursor: 'pointer' }}>Clear</div>
              )}
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column' }}>
              {DISTANCE_OPTIONS.map(opt => {
                const isSelected = distance === opt
                return (
                  <div
                    key={opt ?? 'any'}
                    onClick={() => { onDistanceChange?.(opt); closeDist() }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 4px', borderBottom: '1px solid #f0e8de',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 600, color: isSelected ? '#d4785a' : 'var(--text-primary)', fontFamily: 'Barlow, sans-serif' }}>
                      {opt === null ? 'Any distance' : `${opt} miles`}
                    </span>
                    {isSelected && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7L6 11L12 3" stroke="#d4785a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

    </>
  )
}
