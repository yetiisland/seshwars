import { useState, useEffect } from 'react'
import { LAYERS } from '../lib/layers'

// Satellite/street map-style toggle — the single shared instance for
// every map that offers it (the Spots tab map, the spot page's
// full-screen map). Bottom-right floating button, clearing the bottom
// nav on mobile the same way the LIST/MAP toggle does.
export default function SatelliteToggle({ active, onClick }) {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769)
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 769)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <div style={{ position: 'fixed', bottom: isDesktop ? 'var(--desktop-nav-clearance)' : 'calc(max(env(safe-area-inset-bottom), 24px) + 84px)', left: 0, right: 0, zIndex: LAYERS.FLOATING_CONTROL, pointerEvents: 'none' }}>
      <div style={{ maxWidth: isDesktop ? 1200 : '100%', margin: '0 auto', display: 'flex', justifyContent: 'flex-end', paddingRight: 10, pointerEvents: 'auto' }}>
        <div
          onClick={onClick}
          title={active ? 'Default map' : 'Satellite view'}
          style={{
            width: 38, height: 38,
            background: active ? '#FDF8F0' : '#d4785a',
            border: active ? '2px solid #d4785a' : 'none',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            pointerEvents: 'auto',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 4L20 9L12 14L4 9L12 4Z"
              stroke={active ? '#d4785a' : '#fff'} strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M4 13L12 18L20 13"
              stroke={active ? '#d4785a' : '#fff'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="19" cy="5" r="2" fill={active ? '#d4785a' : '#fff'} />
          </svg>
        </div>
      </div>
    </div>
  )
}
