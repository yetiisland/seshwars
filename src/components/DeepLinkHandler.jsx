import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

function extractSlug(url) {
  if (!url) return null
  // Custom scheme: seshwars://spot/[slug]
  const custom = url.match(/^seshwars:\/\/spot\/([^?#/]+)/)
  if (custom) return custom[1]
  // Universal link: https://seshwars.com/spot/[slug] or /spots/[slug]
  const universal = url.match(/https?:\/\/[^/]+\/spots?\/([^?#/]+)/)
  if (universal) return universal[1]
  return null
}

export default function DeepLinkHandler() {
  const navigate = useNavigate()
  // Stable ref so the listener callback always calls the latest navigate without
  // being listed as a dependency (which would cause the effect to re-run on every
  // navigation, re-calling getLaunchUrl() and forcing the user back to the spot).
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let handle
    let cancelled = false

    ;(async () => {
      // Cold start — app opened via a link.
      // getLaunchUrl() returns the same URL for the life of the session on iOS,
      // so we guard with `cancelled` and only act on it once.
      const launch = await CapApp.getLaunchUrl()
      if (!cancelled && launch?.url) {
        const slug = extractSlug(launch.url)
        if (slug) navigateRef.current(`/spots/${slug}`, { replace: true })
      }

      // Warm resume — link tapped while app is already running.
      handle = await CapApp.addListener('appUrlOpen', ({ url }) => {
        const slug = extractSlug(url)
        if (slug) navigateRef.current(`/spots/${slug}`)
      })
    })()

    // Empty dep array — runs once on mount. cancelled flag stops getLaunchUrl()
    // from acting if the component somehow unmounts before the async resolves.
    return () => {
      cancelled = true
      handle?.remove()
    }
  }, []) // intentionally empty — navigate is accessed via ref

  return null
}
