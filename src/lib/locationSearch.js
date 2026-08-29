// Single source of truth for location-search suggestions, shared by
// SearchPage (mobile, full-screen) and DesktopSearchBar (App.jsx, inline
// dropdown) so the two surfaces can't drift on region detection or spot
// counts the way they previously did — desktop's own copy never computed
// isRegion/spotCount at all, which is why desktop search couldn't fit-all
// or show a count: MapView's auto-fit and App.jsx's region-address filter
// both key off searchLocation.isRegion.
import { haversineDistance } from '../hooks/useGeolocation'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const KM_PER_MILE = 1.60934
export const SEARCH_RADIUS_MILES = 50 / KM_PER_MILE // ~31 miles = 50km

function countSpotsNear(spots, lat, lng) {
  return spots.filter(s => {
    if (!s.latitude || !s.longitude) return false
    return haversineDistance(lat, lng, s.latitude, s.longitude) <= SEARCH_RADIUS_MILES
  }).length
}

function countSpotsInState(spots, stateName) {
  const lower = stateName.toLowerCase()
  return spots.filter(s => s.address && s.address.toLowerCase().includes(lower)).length
}

function getState(context = []) {
  return context.find(c => c.id?.startsWith('region'))?.text || ''
}

// Fetches Mapbox place suggestions and shapes each into the entry shape
// both search surfaces (and App.jsx's searchLocation consumers) expect:
// { id, name, placeName, stateName, longitude, latitude, isRegion, spotCount }
export async function fetchLocationSuggestions(query, spots) {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?types=place,region,postcode&country=US&access_token=${MAPBOX_TOKEN}&limit=5`
  )
  const data = await res.json()
  return (data.features || []).map(f => {
    const isRegion = f.id?.startsWith('region.')
    return {
      id: f.id,
      name: f.text,
      placeName: f.place_name,
      stateName: getState(f.context),
      longitude: f.geometry.coordinates[0],
      latitude: f.geometry.coordinates[1],
      isRegion,
      spotCount: isRegion
        ? countSpotsInState(spots, f.text)
        : countSpotsNear(spots, f.geometry.coordinates[1], f.geometry.coordinates[0]),
    }
  })
}

// Shapes a selected suggestion into the searchLocation entry stored in
// App.jsx state — same shape regardless of which surface picked it.
export function toSearchLocationEntry(item) {
  return {
    name: item.name,
    placeName: item.placeName,
    stateName: item.stateName || '',
    longitude: item.longitude,
    latitude: item.latitude,
    spotCount: item.spotCount ?? 0,
    isRegion: item.isRegion || false,
  }
}
