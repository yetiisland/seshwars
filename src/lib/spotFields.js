export const SPOT_FIELDS = [
  {
    key: 'title',
    label: 'Spot Name',
    type: 'text',
    placeholder: 'e.g. Civic Center Ledges',
    options: null,
    showForTypes: null,
    filterable: false,
    clearable: false,
  },
  {
    key: 'type',
    label: 'Type',
    type: 'single',
    options: ['Street', 'DIY', 'Skatepark', 'Skate Shop'],
    showForTypes: null,
    filterable: true,
    clearable: false,
  },
  {
    key: 'features',
    label: 'Features',
    type: 'multi',
    options: ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Rail', 'Bump', 'Hip', 'Ride On Grind', 'Pole Jam', 'Bowl', 'Halfpipe', 'Step Up', 'Barrier', 'Hill Bomb'],
    showForTypes: ['Street', 'DIY', 'Skatepark'],
    filterable: true,
    clearable: false,
  },
  {
    key: 'lighting',
    label: 'Lights',
    type: 'single',
    options: ['Lights', 'No Lights'],
    showForTypes: ['Street', 'DIY', 'Skatepark'],
    filterable: true,
    clearable: true,
  },
  {
    key: 'bust_rating',
    label: 'Bust Rating',
    type: 'single',
    options: ['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only'],
    showForTypes: ['Street', 'DIY'],
    filterable: true,
    clearable: true,
  },
  {
    key: 'is_multi_spot',
    label: 'Multiple Spots?',
    type: 'single',
    options: ['Yes', 'No'],
    showForTypes: ['Street', 'DIY'],
    filterable: false,
    clearable: false,
  },
  {
    key: 'description',
    label: 'Description',
    type: 'text',
    placeholder: 'What makes this spot sick? Security? Best time to skate?',
    options: null,
    showForTypes: null,
    filterable: false,
    clearable: false,
  },
]

// Single source of truth for the Skate Shop dark-navy treatment, shared by
// SpotCard (ListView + desktop map peek card) and MapView (pins + mobile peek card).
export const SHOP_STYLE = { bg: '#3D4454', border: '#2e3344' }

// Features scoped to a single type rather than the whole field (unlike
// showForTypes, which gates the entire Features field for Street/DIY/
// Skatepark together) — keep this narrow; if more type-scoped options show
// up later, promote this into a per-option showForTypes array instead of
// accreting special cases here.
const STREET_ONLY_FEATURES = new Set(['Hill Bomb'])

// The effective Features option list for a given set of spot types —
// used by both the add/edit forms (a single current type) and the filters
// modal (every currently-selected type) so Street-only options like Hill
// Bomb show up everywhere Street features appear, and nowhere else.
export function featureOptionsForTypes(types) {
  const options = SPOT_FIELDS.find(f => f.key === 'features').options
  if (types.some(t => t === 'Street')) return options
  return options.filter(o => !STREET_ONLY_FEATURES.has(o))
}

export function bustChipActiveStyle(rating) {
  if (rating === 'No Bust') return { background: '#4a7a3a', borderColor: '#3d6830', color: '#ffffff' }
  if (rating === 'Bust') return { background: '#c0453a', borderColor: '#a83830', color: '#ffffff' }
  // Same style as the MULTI-SPOT chip: lighter fill, border/text in the
  // same gold instead of white-on-gold.
  if (rating === 'Medium Bust') return { background: '#fff3cd', borderColor: '#b08818', color: '#b08818' }
  if (rating === 'Weekends Only' || rating === 'Weekdays Only')
    return { background: '#c8a020', borderColor: '#b08818', color: '#ffffff' }
  return {}
}

// Same trick-checkmark tokens as the MULTI-SPOT chip (SpotCard/SpotDetail).
// "No" keeps the default selected chip style — not a fresh exception, just
// no override here, same as bustChipActiveStyle's unmatched ratings.
export function multiSpotChipActiveStyle(opt) {
  if (opt === 'Yes') return { background: '#DFEEDF', borderColor: '#4E9A51', color: '#3d6830' }
  return {}
}

// Same yellow as the LIGHTS image chip (SpotCard/SpotDetail) and the
// report-a-spot button. "No Lights" keeps the default selected chip style.
export function lightsChipActiveStyle(opt) {
  if (opt === 'Lights') return { background: '#f5c518', borderColor: '#f5c518', color: '#000000' }
  return {}
}
