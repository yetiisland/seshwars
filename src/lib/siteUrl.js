// Inside the native app, window.location.origin is capacitor://localhost (or
// http://localhost), which is useless in a shared link or an email redirect.
// Fall back to the canonical public origin in that case, but keep using the
// real origin on the web so preview deploys and localhost still work.
const CANONICAL_ORIGIN = 'https://www.seshwars.com'

export function siteOrigin() {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (!origin) return CANONICAL_ORIGIN
  if (!/^https?:/i.test(origin)) return CANONICAL_ORIGIN          // capacitor://, ionic://, file://
  if (/^https?:\/\/localhost(:\d+)?$/i.test(origin)) return CANONICAL_ORIGIN  // Capacitor's localhost server
  return origin
}
