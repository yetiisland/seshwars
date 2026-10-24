import { useState, useRef, useEffect } from 'react'
import { buildStaticMapUrl, clampStaticMapDimension } from '../lib/staticMap'
import MapAttributionButton from './MapAttributionButton'

// Cover image for a spot with no photos — a static satellite image of its
// location (no pin), used everywhere a cover appears (the spot page hero,
// every SpotCard). Measures its own rendered size so the Static Images API
// request — and its URL, and the browser's cache entry for it — is
// deterministic per spot + container size. Shows `placeholderBg` (the
// same solid color the old no-photo placeholder used) until the image
// loads, and keeps showing it instead of a broken-image icon if the
// request fails.
export default function SpotCoverImage({ spot, placeholderBg }) {
  const ref = useRef(null)
  const [size, setSize] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const hasCoords = spot?.latitude != null && spot?.longitude != null

  useEffect(() => {
    const el = ref.current
    if (!el || !hasCoords) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const width = clampStaticMapDimension(rect.width)
      const height = clampStaticMapDimension(rect.height)
      setSize(prev => (prev && prev.width === width && prev.height === height) ? prev : { width, height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasCoords])

  const url = hasCoords && size ? buildStaticMapUrl(spot.longitude, spot.latitude, size.width, size.height) : null

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative', background: placeholderBg }}>
      {url && !error && (
        <img
          src={url}
          alt=""
          draggable={false}
          onContextMenu={e => e.preventDefault()}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block',
            objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.15s',
            userSelect: 'none', WebkitTouchCallout: 'none', pointerEvents: 'none',
          }}
        />
      )}
      {url && !error && loaded && <MapAttributionButton />}
    </div>
  )
}
