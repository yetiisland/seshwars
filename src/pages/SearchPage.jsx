import { useState, useEffect, useRef } from 'react'
import { haversineDistance } from '../hooks/useGeolocation'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const LS_RECENT_KEY = 'seshwars_recent_searches'
const KM_PER_MILE = 1.60934
const SEARCH_RADIUS_MILES = 50 / KM_PER_MILE // ~31 miles = 50km

function countSpotsNear(spots, lat, lng) {
  return spots.filter(s => {
    if (!s.latitude || !s.longitude) return false
    return haversineDistance(lat, lng, s.latitude, s.longitude) <= SEARCH_RADIUS_MILES
  }).length
}

function getState(context = []) {
  return context.find(c => c.id?.startsWith('region'))?.text || ''
}

function PinSVG({ filled }) {
  return filled ? (
    <svg width="18" height="22" viewBox="-2 -2 24 28" fill="none" style={{ overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
      <circle cx="10" cy="10" r="4" fill="#fff" />
    </svg>
  ) : (
    <svg width="16" height="20" viewBox="-2 -2 24 28" fill="none" style={{ overflow: 'visible' }}>
      <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" stroke="#d4785a" strokeWidth="1.6" fill="none" />
      <circle cx="10" cy="10" r="4" stroke="#d4785a" strokeWidth="1.6" fill="none" />
    </svg>
  )
}

function ClockSVG() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="#d4785a" strokeWidth="1.2" />
      <path d="M7 4V7L9 9" stroke="#d4785a" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const BOTTOM_PAD = 'calc(72px + env(safe-area-inset-bottom))'

export default function SearchPage({ spots, onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [recentSearches, setRecentSearches] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const timer = useRef(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]')
      setRecentSearches(stored)
    } catch {}
    setTimeout(() => inputRef.current?.focus(), 150)
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setSuggestions([]); setLoading(false); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,region,postcode&country=US&access_token=${MAPBOX_TOKEN}&limit=5`
        )
        const data = await res.json()
        setSuggestions((data.features || []).map(f => ({
          id: f.id,
          name: f.text,
          placeName: f.place_name,
          stateName: getState(f.context),
          longitude: f.geometry.coordinates[0],
          latitude: f.geometry.coordinates[1],
          spotCount: countSpotsNear(spots, f.geometry.coordinates[1], f.geometry.coordinates[0]),
        })))
      } catch { setSuggestions([]) }
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query, spots])

  const handleSelect = (item) => {
    const entry = {
      name: item.name,
      placeName: item.placeName,
      stateName: item.stateName || '',
      longitude: item.longitude,
      latitude: item.latitude,
      spotCount: item.spotCount ?? 0,
    }
    try {
      const prev = JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]')
      const updated = [entry, ...prev.filter(r => r.placeName !== entry.placeName)].slice(0, 5)
      localStorage.setItem(LS_RECENT_KEY, JSON.stringify(updated))
    } catch {}
    onSelect(entry)
  }

  const showSuggestions = query.trim().length > 0
  const items = showSuggestions ? suggestions : recentSearches

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FDF8F0', zIndex: 500, display: 'flex', flexDirection: 'column' }}>
      {/* Header — no borderBottom since the Navbar above provides separation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px 12px', paddingTop: 'calc(env(safe-area-inset-top) + 10px)',
        background: '#FDF8F0', flexShrink: 0,
      }}>
        <div style={{ width: 36 }} />
        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Search an Area
        </div>
        <div onClick={onClose} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Search input */}
      <div style={{ padding: '14px 16px 8px', flexShrink: 0 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: 10, pointerEvents: 'none', display: 'flex' }}>
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4" stroke="#d4785a" strokeWidth="1.3" />
              <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="#d4785a" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="City, state or zip code..."
            style={{
              width: '100%', background: '#FFFFFF', border: '1.5px solid #d4785a',
              borderRadius: 6, padding: '10px 36px 10px 32px',
              fontSize: 13, color: 'var(--text-primary)', fontFamily: 'Barlow, sans-serif', outline: 'none',
            }}
          />
          {query.length > 0 && (
            <div onClick={() => setQuery('')} style={{ position: 'absolute', right: 10, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#ECEDF2" />
                <line x1="5" y1="5" x2="11" y2="11" stroke="#6a6c7a" strokeWidth="1.3" strokeLinecap="round" />
                <line x1="11" y1="5" x2="5" y2="11" stroke="#6a6c7a" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Section label */}
      <div style={{ padding: '4px 16px 4px', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#6a6c7a', flexShrink: 0 }}>
        {showSuggestions ? (loading ? 'Searching…' : 'Suggestions') : 'Recent Searches'}
      </div>

      {/* Results */}
      <div className="scroll-area">
        {!showSuggestions && recentSearches.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 14 14" fill="none" style={{ marginBottom: 12, opacity: 0.35 }}>
              <circle cx="7" cy="7" r="5.5" stroke="#d4785a" strokeWidth="1.2" />
              <path d="M7 4V7L9 9" stroke="#d4785a" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.3 }}>
              No recent searches yet
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
              Search for a city to find spots nearby
            </div>
          </div>
        )}
        {items.map((item, i) => (
          <div
            key={item.placeName || item.name || i}
            onClick={() => handleSelect(item)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 16px', cursor: 'pointer',
              borderBottom: '1px solid #ECEDF2',
              background: (showSuggestions && i === 0) ? '#FDF8F0' : 'transparent',
            }}
          >
            <div style={{ flexShrink: 0, width: 22, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
              {showSuggestions ? <PinSVG filled={i === 0} /> : <ClockSVG />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </div>
              {(item.stateName || item.placeName) && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.stateName || item.placeName?.split(', ').slice(1).join(', ')}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#d4785a', flexShrink: 0 }}>
              {(item.spotCount ?? 0)} spot{item.spotCount !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
        {showSuggestions && !loading && suggestions.length === 0 && query.trim() && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>
            No results for "{query}"
          </div>
        )}
        <div style={{ height: BOTTOM_PAD }} />
      </div>
    </div>
  )
}
