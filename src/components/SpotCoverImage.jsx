import { useState, useRef, useEffect } from 'react'
import { buildStaticMapUrl, clampStaticMapDimension } from '../lib/staticMap'
import MapAttributionButton from './MapAttributionButton'

// Estimated rendered width of the MULTI-SPOT chip (icon + gap + "MULTI-SPOT"
// label + its own padding, at the fixed size/font it's always drawn at) —
// not measurable without a browser, so this is a judgment-call estimate,
// deliberately generous. Used only to keep the attribution button clear of
// the chip when both are shown on the same image; MULTI_SPOT_CHIP_GAP_PX is
// the 6px gap the task asked for between them.
const MULTI_SPOT_CHIP_WIDTH_ESTIMATE_PX = 105
const MULTI_SPOT_CHIP_GAP_PX = 6

// Cover image for a spot with no photos — a static satellite image of its
// location (no pin), used everywhere a cover appears (the spot page hero,
// every SpotCard). Measures its own rendered size so the Static Images API
// request — and its URL, and the browser's cache entry for it — is
// deterministic per spot + container size. Shows `placeholderBg` (the
// same solid color the old no-photo placeholder used) until the image
// loads, and keeps showing it instead of a broken-image icon if the
// request fails.
//
// chipBottom/chipRight are the exact bottom/right inset the caller's own
// MULTI-SPOT chip uses in that spot — the attribution button sits there
// too when the chip isn't showing, and shifts further right of it (chip
// width estimate + 6px) when the chip is showing, so they never overlap.
// Default matches SpotCard.jsx's chip; SpotDetail.jsx's hero passes its
// own (different) chip inset.
export default function SpotCoverImage({ spot, placeholderBg, chipBottom = 8, chipRight = 8 }) {
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

  const url = hasCoords && size ? buildStaticMapUrl(spot.longitude, spot.latitude, size.width, size.height, import.meta.env.VITE_MAPBOX_TOKEN) : null
  const showsMultiSpotChip = Boolean(spot?.is_multi_spot) && (spot?.type === 'Street' || spot?.type === 'DIY')
  const attributionRight = showsMultiSpotChip ? chipRight + MULTI_SPOT_CHIP_WIDTH_ESTIMATE_PX + MULTI_SPOT_CHIP_GAP_PX : chipRight

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
      {url && !error && loaded && <MapAttributionButton bottom={chipBottom} right={attributionRight} />}
    </div>
  )
}
