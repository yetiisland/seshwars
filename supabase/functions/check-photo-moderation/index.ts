import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SIGHTENGINE_USER = Deno.env.get('SIGHTENGINE_USER')!
const SIGHTENGINE_SECRET = Deno.env.get('SIGHTENGINE_SECRET')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function checkOne(imageUrl: string) {
  const params = new URLSearchParams({
    url: imageUrl,
    models: 'nudity-2.1,gore-2.0',
    api_user: SIGHTENGINE_USER,
    api_secret: SIGHTENGINE_SECRET,
  })
  const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`)
  if (!res.ok) {
    const body = await res.text()
    console.error('Sightengine HTTP error:', res.status, body)
    throw new Error(`Sightengine HTTP ${res.status}`)
  }
  const data = await res.json()
  const nudity = data.nudity || {}
  const gore = data.gore || {}
  const scores = {
    sexual_activity: nudity.sexual_activity ?? 0,
    sexual_display: nudity.sexual_display ?? 0,
    erotica: nudity.erotica ?? 0,
    gore: gore.prob ?? 0,
  }
  const unsafe =
    scores.sexual_activity > 0.5 ||
    scores.sexual_display > 0.5 ||
    scores.erotica > 0.6 ||
    scores.gore > 0.5
  const autoReject =
    scores.sexual_activity > 0.9 ||
    scores.sexual_display > 0.9 ||
    scores.erotica > 0.9 ||
    scores.gore > 0.9
  return { safe: !unsafe, autoReject: unsafe && autoReject, scores }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { urls } = await req.json()
    if (!Array.isArray(urls) || urls.length === 0) {
      return new Response(JSON.stringify({ safe: true, autoReject: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const results = await Promise.all(urls.map((u: string) => checkOne(u)))
    const safe = results.every(r => r.safe)
    const autoReject = results.some(r => r.autoReject)
    return new Response(JSON.stringify({ safe, autoReject, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Moderation check failed:', e)
    return new Response(JSON.stringify({ safe: true, autoReject: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
