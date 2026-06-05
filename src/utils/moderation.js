export async function checkImageModeration(imageUrl) {
  const apiUser = import.meta.env.VITE_SIGHTENGINE_USER
  const apiSecret = import.meta.env.VITE_SIGHTENGINE_SECRET

  if (!apiUser || !apiSecret) {
    console.warn('[moderation] credentials not configured, defaulting to pending')
    return { safe: false, scores: null }
  }

  try {
    const params = new URLSearchParams({
      url: imageUrl,
      models: 'nudity-2.1,gore-2.0',
      api_user: apiUser,
      api_secret: apiSecret,
    })
    const res = await fetch(`https://api.sightengine.com/1.0/check.json?${params}`)
    if (!res.ok) {
      console.warn('[moderation] API HTTP error:', res.status, '- defaulting to pending')
      return { safe: false, scores: null }
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
    console.log('[moderation] scores for', imageUrl.slice(-50), scores)
    const unsafe =
      scores.sexual_activity > 0.5 ||
      scores.sexual_display > 0.5 ||
      scores.erotica > 0.6 ||
      scores.gore > 0.5
    // Extreme scores bypass pending review and trigger immediate auto-rejection
    const autoReject =
      scores.sexual_activity > 0.9 ||
      scores.sexual_display > 0.9 ||
      scores.erotica > 0.9 ||
      scores.gore > 0.9
    return { safe: !unsafe, autoReject: !unsafe ? false : autoReject, scores }
  } catch (err) {
    console.warn('[moderation] check failed, defaulting to pending:', err)
    return { safe: false, autoReject: false, scores: null }
  }
}

export async function checkPhotosSafe(urls) {
  if (!urls || urls.length === 0) return { safe: true, autoReject: false }
  const results = await Promise.all(urls.map(url => checkImageModeration(url)))
  const safe = results.every(r => r.safe)
  const autoReject = results.some(r => r.autoReject)
  return { safe, autoReject }
}
