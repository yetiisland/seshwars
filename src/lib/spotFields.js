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
    options: ['Stairs', 'Hubba', 'Ledges', 'Banks', 'Gap', 'Manual Pad', 'Curb', 'Wall Ride', 'Hand Rail', 'Rail', 'Bump', 'Hip', 'Ride On Grind', 'Pole Jam', 'Bowl', 'Halfpipe', 'Step Up', 'Barrier'],
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

export function bustChipActiveStyle(rating) {
  if (rating === 'No Bust') return { background: '#4a7a3a', borderColor: '#3d6830', color: '#ffffff' }
  if (rating === 'Bust') return { background: '#c0453a', borderColor: '#a83830', color: '#ffffff' }
  if (rating === 'Medium Bust' || rating === 'Weekends Only' || rating === 'Weekdays Only')
    return { background: '#c8a020', borderColor: '#b08818', color: '#ffffff' }
  return {}
}
