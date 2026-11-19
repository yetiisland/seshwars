// Shared by the Spot Credit edit sheet (SpotCreditSheet.jsx) and the
// admin-only Spot Credit section on Drop a Spot / Edit Spot, so every
// place that saves credit_name/credit_url normalizes identically.

// Trims the link and prepends https:// when it has no protocol. Returns
// '' for an empty/whitespace-only input.
export function normalizeCreditUrl(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

// The text SpotDetail.jsx links: credit_name if set, otherwise derived
// from credit_url — an Instagram profile/post link becomes "@<handle>",
// anything else becomes its hostname with a leading "www." stripped.
export function deriveCreditLabel(creditName, creditUrl) {
  if (creditName) return creditName
  if (!creditUrl) return ''
  try {
    const { hostname, pathname } = new URL(creditUrl)
    const host = hostname.replace(/^www\./i, '')
    if (host === 'instagram.com') {
      const handle = pathname.split('/').filter(Boolean)[0]
      if (handle) return `@${handle}`
    }
    return host
  } catch {
    return creditUrl
  }
}
