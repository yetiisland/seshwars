import { useEffect } from 'react'
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let handle

    ;(async () => {
      // Cold start — app opened via a link
      const launch = await CapApp.getLaunchUrl()
      if (launch?.url) {
        const slug = extractSlug(launch.url)
        if (slug) navigate(`/spots/${slug}`, { replace: true })
      }

      // Warm resume — link tapped while app is running
      handle = await CapApp.addListener('appUrlOpen', ({ url }) => {
        const slug = extractSlug(url)
        if (slug) navigate(`/spots/${slug}`)
      })
    })()

    return () => { handle?.remove() }
  }, [navigate])

  return null
}
