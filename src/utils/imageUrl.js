// Rewrites a Supabase Storage public object URL to the on-the-fly image
// transformation endpoint, so callers can request a smaller render instead
// of always downloading the full-resolution stored file. Never touches
// avatars/clips/Cloudinary URLs (anything without /object/public/), and
// never modifies the stored URL itself — only the URL used at render time.
export function transformImageUrl(url, width, quality = 75) {
  if (!url) return url
  if (!url.includes('/object/public/')) return url
  const base = url.replace('/object/public/', '/render/image/public/')
  return `${base}?width=${width}&quality=${quality}`
}
