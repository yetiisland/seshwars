const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

// Shared everywhere a trick row's secondary-text date line renders (spot
// page trick sheet, trick list pages, shared trick lists, the public trick
// list page): "Added <date>" unchecked, "Added <date> · Landed <date>"
// checked. created_at is user_tricks.created_at, landed_at is
// user_tricks.landed_at — short month + day, year only when not the
// current year.
export function formatTrickDates({ created_at, landed, landed_at }) {
  if (!created_at) return ''
  const added = `Added ${shortDate(created_at)}`
  if (!landed || !landed_at) return added
  return `${added} · Landed ${shortDate(landed_at)}`
}
