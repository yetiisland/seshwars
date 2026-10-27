import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { slug } = req.query

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  let spot = null
  const { data: bySlug } = await supabase.from('spots').select('title,description,slug,id').eq('slug', slug).maybeSingle()
  if (bySlug) {
    spot = bySlug
  } else {
    const { data: byId } = await supabase.from('spots').select('title,description,slug,id').eq('id', slug).maybeSingle()
    spot = byId
  }

  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['host'] || 'seshwars.com'
  const origin = `${proto}://${host}`

  const canonicalSlug = spot?.slug || slug
  const title = spot ? `${spot.title} - Seshwars` : 'Seshwars'
  const description = spot?.description || 'Discover and share skate spots near you.'
  // Branded preview image (api/og/spot.jsx) instead of the raw spot photo —
  // the raw photo had no Seshwars branding and Messages tinted its caption
  // bar gray without one. `v=1` is a manual cache-buster: bump it to
  // invalidate every previously-cached copy of this image at once.
  const image = `${origin}/api/og/spot?slug=${encodeURIComponent(canonicalSlug)}&v=1`
  const canonicalUrl = `https://seshwars.com/spot/${canonicalSlug}`
  const appUrl = `/spots/${canonicalSlug}`

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Seshwars" />
  <meta property="og:title" content="${esc(spot?.title || 'Seshwars')}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(spot?.title || 'Seshwars')}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta name="apple-itunes-app" content="app-id=6779744364, app-argument=${esc(canonicalUrl)}" />
  <link rel="canonical" href="${esc(canonicalUrl)}" />
  <meta http-equiv="refresh" content="0;url=${esc(appUrl)}" />
  <script>window.location.replace(${JSON.stringify(appUrl)})</script>
</head>
<body style="font-family:sans-serif;padding:20px">
  <p>Redirecting to <a href="${esc(appUrl)}">${esc(spot?.title || 'Seshwars')}</a>…</p>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
  res.status(200).send(html)
}
