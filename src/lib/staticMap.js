const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Same zoom the spot page's Location static image uses (SpotDetail.jsx) —
// the old interactive map's zoom (15) + 1, capped at the Static Images
// API's own max of 19. Shared here so every static-map image in the app
// (spot page location, spot page/card no-photo cover) renders at the same
// zoom.
export const STATIC_MAP_ZOOM = Math.min(15 + 1, 19)

// The Static Images API requires width/height <= 1280 (before the @2x
// multiplier).
export function clampStaticMapDimension(px) {
  return Math.min(1280, Math.max(1, Math.round(px)))
}

// Deterministic for a given spot + container size, so the browser cache
// can reuse it — pass width/height already rounded to whole pixels and
// capped at 1280 (clampStaticMapDimension). No pin is ever baked into the
// image itself; callers that want one render it as a separate overlay.
//
// attribution=false removes the API's own gray attribution text (the
// Mapbox logo stays, logo=false is never passed) — Mapbox still requires
// attribution somewhere on screen for this, which every caller provides
// via the shared MapAttributionButton component.
export function buildStaticMapUrl(longitude, latitude, width, height) {
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${longitude},${latitude},${STATIC_MAP_ZOOM},0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}&attribution=false`
}
