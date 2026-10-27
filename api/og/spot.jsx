import { ImageResponse } from '@vercel/og'
import { createClient } from '@supabase/supabase-js'
import { transformImageUrl } from '../../src/utils/imageUrl.js'
import { buildStaticMapUrl, clampStaticMapDimension } from '../../src/lib/staticMap.js'

export const config = { runtime: 'edge' }

const WIDTH = 1200
const HEIGHT = 630
const INSET = 32 // docs/design-tokens.md spacing scale
const LOGO_SIZE = 60 // docs/design-tokens.md spacing scale (largest unit)
const LOGO_ASPECT = 140 / 127 // sesh-wars_logo_stacked_white.svg's own viewBox
const BAND_HEIGHT = INSET + LOGO_SIZE + INSET
const IMAGE_WIDTH = WIDTH - INSET * 2
const IMAGE_HEIGHT = HEIGHT - INSET - BAND_HEIGHT
const SALMON = '#d4785a' // docs/design-tokens.md --salmon
const NAME_FONT_SIZE = 28 // docs/design-tokens.md largest documented font size
const NAME_GAP = 18 // docs/design-tokens.md spacing scale

// Vercel's edge bundler detects this new URL(..., import.meta.url) form and
// bundles the referenced repo file with the function, so it can be read at
// request time via fetch() — there's no filesystem access on the edge
// runtime otherwise.
const logoUrl = new URL('../../public/sesh-wars_logo_stacked_white.svg', import.meta.url)

// btoa() on a huge string built via one spread can blow the call stack, so
// this encodes in fixed-size chunks instead.
function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function fetchAsDataUri(url, forcedContentType) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const contentType = forcedContentType || res.headers.get('content-type') || 'application/octet-stream'
    return `data:${contentType};base64,${arrayBufferToBase64(buf)}`
  } catch {
    return null
  }
}

// No Barlow font file exists anywhere in this repo (confirmed — only a
// Google Fonts @import in src/index.css for the app's own UI), so this
// fetches the same family/weight from the same provider at request time
// instead. Falls back to the renderer's default sans-serif if it fails.
async function loadBarlowBold() {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Barlow:wght@700&display=swap')).text()
  const match = css.match(/src: url\(([^)]+)\) format\('[^']+'\)/)
  if (!match) throw new Error('Barlow font URL not found in Google Fonts CSS')
  const fontRes = await fetch(match[1])
  if (!fontRes.ok) throw new Error('Barlow font file fetch failed')
  return fontRes.arrayBuffer()
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  // Same lookup as api/spot/[slug].js: try slug first, then id.
  let spot = null
  if (slug) {
    const { data: bySlug } = await supabase.from('spots').select('title,photos,slug,id,longitude,latitude').eq('slug', slug).maybeSingle()
    spot = bySlug
    if (!spot) {
      const { data: byId } = await supabase.from('spots').select('title,photos,slug,id,longitude,latitude').eq('id', slug).maybeSingle()
      spot = byId
    }
  }

  const name = spot?.title || 'Sesh Wars'

  const [logoDataUri, fontData] = await Promise.all([
    fetchAsDataUri(logoUrl, 'image/svg+xml'),
    loadBarlowBold().catch(() => null),
  ])

  let imageDataUri = null
  if (spot?.photos?.[0]) {
    imageDataUri = await fetchAsDataUri(transformImageUrl(spot.photos[0], IMAGE_WIDTH))
  }
  if (!imageDataUri && spot?.longitude != null && spot?.latitude != null) {
    const w = clampStaticMapDimension(IMAGE_WIDTH)
    const h = clampStaticMapDimension(IMAGE_HEIGHT)
    imageDataUri = await fetchAsDataUri(buildStaticMapUrl(spot.longitude, spot.latitude, w, h, process.env.VITE_MAPBOX_TOKEN))
  }

  const fonts = fontData ? [{ name: 'Barlow', data: fontData, weight: 700, style: 'normal' }] : []

  return new ImageResponse(
    (
      <div style={{ width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column', background: SALMON }}>
        {/* Image/map area — a fixed-size box regardless of whether the
            image inside it loaded, so the layout below never shifts. */}
        <div
          style={{
            display: 'flex',
            width: IMAGE_WIDTH,
            height: IMAGE_HEIGHT,
            margin: `${INSET}px ${INSET}px 0 ${INSET}px`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {imageDataUri && (
            <img src={imageDataUri} width={IMAGE_WIDTH} height={IMAGE_HEIGHT} style={{ objectFit: 'cover' }} />
          )}
        </div>

        {/* Bottom band — logo, then the spot name, left-aligned. */}
        <div style={{ display: 'flex', alignItems: 'center', height: BAND_HEIGHT, paddingLeft: INSET, paddingRight: INSET }}>
          {logoDataUri && (
            <img
              src={logoDataUri}
              width={Math.round(LOGO_SIZE * LOGO_ASPECT)}
              height={LOGO_SIZE}
              style={{ flexShrink: 0 }}
            />
          )}
          <div
            style={{
              display: 'flex',
              marginLeft: NAME_GAP,
              color: '#fff',
              fontSize: NAME_FONT_SIZE,
              fontWeight: 700,
              fontFamily: fontData ? 'Barlow' : undefined,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}
          >
            {name}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, immutable',
      },
    }
  )
}
