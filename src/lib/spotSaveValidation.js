// Shared by Drop a Spot (AddSpot.jsx) and Edit Spot (SpotDetail.jsx) so the
// save-error popup reads identically in both places. Collects every problem
// at once (not just the first) so the popup can list them all together.
export function validateSpotForm(form, addrStatus) {
  const fieldErrors = {}
  if (!form.title) fieldErrors.title = 'Add a title'
  if (!form.type) fieldErrors.type = 'Pick a spot type'
  if (addrStatus !== 'confirmed') fieldErrors.location = 'Pick a location from the list or drop a pin'
  return fieldErrors
}

// Never show a raw database error to the user. Add a case here only for an
// error that's actually been seen and confirmed — everything else, known or
// not, falls back to the generic message.
export function friendlySaveErrorMessage(error) {
  if (!error) return 'Something went wrong. Try again.'
  const code = error.code
  const message = (error.message || '').toLowerCase()
  if (code === '23505' || message.includes('duplicate key')) return 'A spot already exists at this location.'
  if (message.includes('row-level security') || message.includes('permission denied')) return 'You do not have permission to save this spot.'
  if (message.includes('failed to fetch') || message.includes('network')) return 'Could not connect. Check your connection and try again.'
  return 'Something went wrong. Try again.'
}
