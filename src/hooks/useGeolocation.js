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

// permissionState: 'granted' | 'denied' | 'prompt' | 'unsupported'
// Location is requested unconditionally on mount (the OS/browser handles the
// native permission prompt correctly on its own) — this hook does not defer
// the request to an explicit user action. 'unsupported' covers both "no
// navigator.geolocation at all" and "the Permissions API (or its
// 'geolocation' name) isn't queryable here" — in the latter case this falls
// back to the old unconditional watchPosition call so platforms without
// Permissions API support (older browsers, and possibly the Capacitor
// WebView — untested) keep working exactly as before.
export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [error, setError] = useState(null)
  const [permissionState, setPermissionState] = useState('unsupported')
  const watchIdRef = useRef(null)
  const permissionStateRef = useRef('unsupported')

  const updatePermissionState = (state) => {
    permissionStateRef.current = state
    setPermissionState(state)
  }

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) return
    if (watchIdRef.current !== null) return // already watching
    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        setError(null)
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading,
        })
      },
      err => {
        console.error('[useGeolocation] watchPosition error:', err.code, err.message)
        setError({ code: err.code, message: err.message })
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

  // Still exposed as a no-op-safe manual trigger for any other caller that
  // wants to re-request after a denial is lifted elsewhere, but is no longer
  // needed to kick off the initial request — that now happens on mount below.
  const requestLocation = useCallback(() => {
    if (permissionStateRef.current === 'denied') return
    startWatching()
  }, [startWatching])

  useEffect(() => {
    if (!navigator.geolocation) { updatePermissionState('unsupported'); return }
    if (!navigator.permissions?.query) {
      updatePermissionState('unsupported')
      startWatching()
      return
    }
    let permissionStatus = null
    let handleChange = null
    let cancelled = false
    navigator.permissions.query({ name: 'geolocation' }).then(status => {
      if (cancelled) return
      permissionStatus = status
      updatePermissionState(status.state)
      if (status.state !== 'denied') startWatching()
      handleChange = () => {
        updatePermissionState(status.state)
        if (status.state === 'granted') startWatching()
        else if (status.state === 'denied') stopWatching()
      }
      status.addEventListener('change', handleChange)
    }).catch(() => {
      updatePermissionState('unsupported')
      startWatching()
    })
    return () => {
      cancelled = true
      if (permissionStatus && handleChange) permissionStatus.removeEventListener('change', handleChange)
      stopWatching()
    }
  }, [startWatching, stopWatching])

  return { location, error, permissionState, requestLocation }
}
