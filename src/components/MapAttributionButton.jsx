import { useState, useEffect, useRef } from 'react'
import { LAYERS } from '../lib/layers'

// Required attribution for every static Mapbox image rendered with
// attribution=false (src/lib/staticMap.js) — the API's own gray
// attribution text is removed there (the Mapbox logo stays), so Mapbox
// requires the credit to be shown some other way. This is that other
// way: a small "i" button in the bottom-right corner of the image, that
// toggles a small pill with the required links. The caller positions it
// via bottom/right (matching whatever MULTI-SPOT chip inset applies in
// that spot, or shifted further right of it — see SpotCoverImage.jsx —
// when that chip is also showing on the same image, so the two never
// overlap). Tapping anywhere else closes it; tapping the button or a
// link never reaches an ancestor's own onClick (e.g. a SpotCard opening
// the spot), since every tap here stops propagation.
export default function MapAttributionButton({ bottom = 8, right = 8 }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [open])

  const stop = (e) => e.stopPropagation()

  return (
    <div
      ref={rootRef}
      style={{ position: 'absolute', bottom, right, zIndex: LAYERS.PAGE_CONTENT + 1 }}
      onClick={stop}
    >
      {open && (
        <div
          style={{
            position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
            background: '#2a1e14', borderRadius: 20, padding: '5px 10px',
            whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center',
          }}
        >
          <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" onClick={stop} style={{ fontSize: 9, fontWeight: 700, color: '#fff', textDecoration: 'underline', fontFamily: 'Barlow, sans-serif' }}>© Mapbox</a>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" onClick={stop} style={{ fontSize: 9, fontWeight: 700, color: '#fff', textDecoration: 'underline', fontFamily: 'Barlow, sans-serif' }}>© OpenStreetMap</a>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>© Maxar</span>
        </div>
      )}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <circle cx="5" cy="5" r="4.25" stroke="#2a1e14" strokeWidth="1.2" />
          <line x1="5" y1="4.5" x2="5" y2="7" stroke="#2a1e14" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="5" cy="3" r="0.6" fill="#2a1e14" />
        </svg>
      </div>
    </div>
  )
}
