import { useState, useEffect, useRef, useCallback } from 'react'

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// permissionState: 'granted' | 'denied' | 'unsupported'
// Location is requested unconditionally on mount (the OS/browser handles the
// native permission prompt correctly on its own) — this hook does not defer
// the request to an explicit user action.
//
// permissionState is derived from the actual geolocation calls, never from
// navigator.permissions.query('geolocation') — that API is unreliable on
// Safari/iOS, which can report 'denied' (or 'prompt') even while
// watchPosition is successfully delivering real fixes, which was causing
// "Location is blocked" UI to show on devices where location was working
// fine. The only two signals that change permissionState now:
//   - any position arriving -> 'granted', regardless of what permissions.query said.
//   - a PERMISSION_DENIED (code 1) error from watchPosition -> 'denied'.
//     POSITION_UNAVAILABLE (2) and TIMEOUT (3) are transient and never
//     change permissionState.
// permissions.query is still consulted, but only as a hint to retry
// watchPosition when it reports 'granted' (e.g. the user enabled location
// in Settings while the app was open) — its 'denied'/'prompt' reports are
// never used to drive UI.
export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [error, setError] = useState(null)
  const [permissionState, setPermissionState] = useState('unsupported')
  const watchIdRef = useRef(null)

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) return
    if (watchIdRef.current !== null) return // already watching
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        setError(null)
        setPermissionState('granted')
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading,
        })
      },
      err => {
        console.error('[useGeolocation] watchPosition error:', err.code, err.message)
        setError({ code: err.code, message: err.message })
        if (err.code === err.PERMISSION_DENIED) setPermissionState('denied')
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }, [])

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  // Manual re-trigger (map tab activation, Friends search focus, etc.) —
  // always safe to call: startWatching no-ops if a watch is already active,
  // and if permission was previously denied this simply retries, which is
  // how a genuinely-fixed permission (changed in Settings) is ever
  // discovered without a full reload.
  const requestLocation = useCallback(() => {
    startWatching()
  }, [startWatching])

  useEffect(() => {
    if (!navigator.geolocation) { setPermissionState('unsupported'); return }
    startWatching()
    if (!navigator.permissions?.query) return
    let permissionStatus = null
    let handleChange = null
    let cancelled = false
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (cancelled) return
      permissionStatus = status
      // Hint-only: a 'granted' report is a legitimate signal to retry a
      // dropped/never-started watch. Anything else from this API is never
      // acted on — see the module comment above.
      handleChange = () => {
        if (status.state === 'granted') {
          stopWatching()
          startWatching()
        }
      }
      status.addEventListener('change', handleChange)
    }).catch(() => {})
    return () => {
      cancelled = true
      if (permissionStatus && handleChange) permissionStatus.removeEventListener('change', handleChange)
      stopWatching()
    }
  }, [startWatching, stopWatching])

  return { location, error, permissionState, requestLocation }
}
