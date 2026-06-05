import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const { slug } = req.query

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  )

  let spot = null
  const { data: bySlug } = await supabase.from('spots').select('title,description,photos,slug,id').eq('slug', slug).maybeSingle()
  if (bySlug) {
    spot = bySlug
  } else {
    const { data: byId } = await supabase.from('spots').select('title,description,photos,slug,id').eq('id', slug).maybeSingle()
    spot = byId
  }

  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['host'] || 'seshwars.com'
  const origin = `${proto}://${host}`

  const title = spot ? `${spot.title} — Seshwars` : 'Seshwars'
  const description = spot?.description || 'Discover and share skate spots near you.'
  const image = spot?.photos?.[0] || `${origin}/sw-webclip.png`
  const shareUrl = `${origin}/api/spot/${slug}`
  const appUrl = `${origin}/#/spots/${spot?.slug || slug}`

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
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(spot?.title || 'Seshwars')}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
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
