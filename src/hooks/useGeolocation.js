import { useState, useEffect, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

const IS_NATIVE = Capacitor.isNativePlatform()

// permissionState: 'granted' | 'denied' | 'prompt' | 'unsupported'
//
// On native (iOS/Android), permissionState comes directly from the
// @capacitor/geolocation plugin's own checkPermissions()/requestPermissions()
// — a real OS-level permission query, not a web API proxy, so unlike the web
// path below its 'prompt'/'denied' reports are trusted as-is.
//
// On web, permissionState is derived from the actual geolocation calls, never
// from navigator.permissions.query('geolocation') — that API is unreliable on
// Safari/iOS, which can report 'denied' (or 'prompt') even while
// watchPosition is successfully delivering real fixes, which was causing
// "Location is blocked" UI to show on devices where location was working
// fine. The only two signals that change permissionState there:
//   - any position arriving -> 'granted', regardless of what permissions.query said.
//   - a PERMISSION_DENIED (code 1) error from watchPosition -> 'denied'.
//     POSITION_UNAVAILABLE (2) and TIMEOUT (3) are transient and never
//     change permissionState.
// permissions.query is still consulted on web, but only as a hint to retry
// watchPosition when it reports 'granted' (e.g. the user enabled location
// in Settings while the app was open) — its 'denied'/'prompt' reports are
// never used to drive UI there.
//
// On both platforms, a received position always means 'granted' and only a
// true permission denial ever means 'denied' — transient errors never flip
// either state.
export function useGeolocation() {
  const [location, setLocation] = useState(null)
  const [error, setError] = useState(null)
  const [permissionState, setPermissionState] = useState('unsupported')
  const watchIdRef = useRef(null) // web: numeric id from watchPosition; native: string CallbackID
  const permissionStateRef = useRef(permissionState)
  useEffect(() => { permissionStateRef.current = permissionState }, [permissionState])

  // ── Native path — @capacitor/geolocation, real OS prompt/location ──────
  const startWatchingNative = useCallback(async () => {
    if (watchIdRef.current !== null) return
    try {
      const id = await Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 5000 }, (pos, err) => {
        if (err) {
          console.error('[useGeolocation] native watchPosition error:', err)
          if (/denied/i.test(err?.message || '')) setPermissionState('denied')
          return
        }
        if (!pos) return
        setError(null)
        setPermissionState('granted')
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, heading: pos.coords.heading })
      })
      watchIdRef.current = id
    } catch (err) {
      console.error('[useGeolocation] native watchPosition start failed:', err)
    }
  }, [])

  const stopWatchingNative = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {})
      watchIdRef.current = null
    }
  }, [])

  // The only path that ever shows the real OS permission prompt on native.
  // Called exclusively from the branded pre-prompt sheet's CONTINUE button
  // (App.jsx) — never automatically — so that sheet always shows first
  // whenever permissionState is 'prompt'.
  const requestNativePermission = useCallback(async () => {
    try {
      const result = await Geolocation.requestPermissions({ permissions: ['location'] })
      if (result.location === 'granted') {
        setPermissionState('granted')
        startWatchingNative()
      } else if (result.location === 'denied') {
        setPermissionState('denied')
      } else {
        setPermissionState('prompt')
      }
    } catch (err) {
      console.error('[useGeolocation] native requestPermissions failed:', err)
    }
  }, [startWatchingNative])

  // ── Web path (unchanged) ────────────────────────────────────────────
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
  // always safe to call. On web this is identical to before: startWatching
  // no-ops if a watch is already active, and if permission was previously
  // denied this simply retries, which is how a genuinely-fixed permission
  // (changed in Settings) is ever discovered without a full reload. On
  // native it never itself shows the OS prompt — it only retries
  // watchPosition if permission is already granted — so it stays safe to
  // call from anywhere; the OS prompt only ever fires from
  // requestNativePermission above.
  const requestLocation = useCallback(() => {
    if (IS_NATIVE) {
      if (permissionStateRef.current === 'granted') startWatchingNative()
      return
    }
    startWatching()
  }, [startWatchingNative, startWatching])

  useEffect(() => {
    if (IS_NATIVE) {
      let cancelled = false
      Geolocation.checkPermissions().then(result => {
        if (cancelled) return
        const state = result.location
        if (state === 'granted') {
          setPermissionState('granted')
          startWatchingNative()
        } else if (state === 'denied') {
          setPermissionState('denied')
        } else {
          // 'prompt' or 'prompt-with-rationale' — leave it to the branded
          // pre-prompt sheet (App.jsx) to call requestNativePermission.
          setPermissionState('prompt')
        }
      }).catch(err => {
        console.error('[useGeolocation] native checkPermissions failed:', err)
        setPermissionState('unsupported')
      })
      return () => { cancelled = true; stopWatchingNative() }
    }

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
  }, [startWatching, stopWatching, startWatchingNative, stopWatchingNative])

  return {
    location,
    error,
    permissionState,
    requestLocation,
    // Only meaningful on native — the branded pre-prompt sheet's CONTINUE
    // action. undefined on web, where there's no separate "trigger the OS
    // prompt" step to expose.
    requestNativePermission: IS_NATIVE ? requestNativePermission : undefined,
  }
}
