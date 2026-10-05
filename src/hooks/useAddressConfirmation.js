import { useState, useRef, useEffect, useCallback } from 'react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Accepts "39.7392, -104.9903", "39.7392,-104.9903", and "39.7392 -104.9903"
// (optional whitespace around a comma, or bare whitespace with no comma) —
// anchored so a normal address/place search ("123 Main St, Denver") can
// never accidentally match.
const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*|\s+)(-?\d+(?:\.\d+)?)\s*$/

function formatCoords(lat, lng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export async function reverseGeocode(lng, lat) {
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    )
    const data = await res.json()
    return data.features?.[0]?.place_name || ''
  } catch {
    return ''
  }
}

// CORE RULE (shared by AddSpot and SpotDetail's Edit Spot location section):
// the pin is the single source of truth for the address. Typing only ever
// drives the search query and moves status to 'unconfirmed' (or 'empty') —
// addressText is set to a resolved value ONLY by applyConfirmed, which is
// only reached via a suggestion pick, a valid typed coordinate pair, a pin
// drag, or a map tap. It is therefore impossible to save text that didn't
// come from the current pin position: callers must check status === 'confirmed'
// before submitting.
// onConfirm(lat, lng, source), source one of 'suggestion' | 'coordinates' |
// 'pin' — lets a caller recenter the map only for the two sources where the
// user hasn't already navigated there themselves (picking a suggestion or
// typing coordinates can land somewhere entirely outside the current
// viewport); a pin drag or map tap is already exactly where the user is
// looking, so callers should leave those two alone.
export function useAddressConfirmation(onConfirm) {
  const [addressText, setAddressText] = useState('')
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [status, setStatus] = useState('empty') // 'empty' | 'unconfirmed' | 'confirmed'
  const [geoResults, setGeoResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [rangeError, setRangeError] = useState('')

  const skipSearchRef = useRef(false)
  const geocodeTimer = useRef(null)
  const inputFocusedRef = useRef(false)
  const onConfirmRef = useRef(onConfirm)
  onConfirmRef.current = onConfirm

  const applyConfirmed = useCallback((lat, lng, address, source) => {
    skipSearchRef.current = true
    setLatitude(lat)
    setLongitude(lng)
    setAddressText(address)
    setStatus('confirmed')
    setRangeError('')
    setGeoResults([])
    setShowDropdown(false)
    onConfirmRef.current?.(lat, lng, source)
  }, [])

  // Shared by pin drag, map tap, and a valid typed coordinate pair. Falls
  // back to the coordinates themselves (formatted) on reverse-geocode
  // failure, still CONFIRMED — a spot in a parking lot with no street
  // address must still be savable.
  const confirmFromPin = useCallback(async (lat, lng, source) => {
    const address = await reverseGeocode(lng, lat)
    applyConfirmed(lat, lng, address || formatCoords(lat, lng), source)
  }, [applyConfirmed])

  const selectSuggestion = useCallback((feature) => {
    const [lng, lat] = feature.geometry.coordinates
    applyConfirmed(lat, lng, feature.place_name, 'suggestion')
  }, [applyConfirmed])

  // Pin drag and map tap are handled identically: move the pin immediately,
  // discard whatever text was there before, then reverse geocode.
  const handlePinMove = useCallback((lat, lng) => {
    skipSearchRef.current = true
    setLatitude(lat)
    setLongitude(lng)
    setAddressText('')
    setRangeError('')
    setStatus('unconfirmed')
    confirmFromPin(lat, lng, 'pin')
  }, [confirmFromPin])

  // Typing always clears any existing pin and returns to UNCONFIRMED/EMPTY —
  // editing after CONFIRMED must never leave the old pin paired with new
  // text (rule D), and UNCONFIRMED is defined as "no pin set" (rule A).
  const handleTextChange = useCallback((value) => {
    setAddressText(value)
    setRangeError('')
    setLatitude(null)
    setLongitude(null)
    setStatus(value.trim() ? 'unconfirmed' : 'empty')
  }, [])

  useEffect(() => {
    if (skipSearchRef.current) { skipSearchRef.current = false; return }
    const trimmed = addressText.trim()
    if (!trimmed) { setGeoResults([]); setShowDropdown(false); return }

    const coordMatch = trimmed.match(COORD_RE)
    if (coordMatch) {
      setGeoResults([])
      setShowDropdown(false)
      const lat = parseFloat(coordMatch[1])
      const lng = parseFloat(coordMatch[2])
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setRangeError('Latitude must be between -90 and 90, longitude between -180 and 180.')
        return
      }
      setRangeError('')
      confirmFromPin(lat, lng, 'coordinates')
      return
    }

    setRangeError('')
    clearTimeout(geocodeTimer.current)
    geocodeTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?access_token=${MAPBOX_TOKEN}&limit=5`
        )
        const data = await res.json()
        setGeoResults(data.features || [])
        if (inputFocusedRef.current) setShowDropdown(true)
      } catch {
        setGeoResults([])
      }
    }, 300)
    return () => clearTimeout(geocodeTimer.current)
  }, [addressText, confirmFromPin])

  const onInputFocus = useCallback(() => {
    inputFocusedRef.current = true
    if (geoResults.length > 0) setShowDropdown(true)
  }, [geoResults])

  const onInputBlur = useCallback(() => {
    inputFocusedRef.current = false
    setTimeout(() => setShowDropdown(false), 150)
  }, [])

  // For restoring a saved draft (AddSpot) or an existing spot's address
  // (Edit Spot) without going through the typing/confirm flow. `confirmed`
  // must be explicitly true — anything restored as merely "had some text"
  // comes back as UNCONFIRMED, consistent with the core rule.
  const hydrate = useCallback(({ address, latitude: lat, longitude: lng, confirmed }) => {
    skipSearchRef.current = true
    setAddressText(address || '')
    setLatitude(lat ?? null)
    setLongitude(lng ?? null)
    setRangeError('')
    setStatus(confirmed && lat != null && lng != null ? 'confirmed' : (address ? 'unconfirmed' : 'empty'))
  }, [])

  return {
    addressText, latitude, longitude, status, geoResults, showDropdown, rangeError,
    handleTextChange, selectSuggestion, handlePinMove, hydrate,
    onInputFocus, onInputBlur,
  }
}
