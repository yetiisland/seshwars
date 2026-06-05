const FILTERS = ['All', 'Street', 'DIY', 'Park', 'Ledges', 'Stairs', 'Banks', 'Hubba', 'Gap', 'Hand Rail', 'Flat Bar', 'No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only']
const BUST_RATINGS = new Set(['No Bust', 'Medium Bust', 'Bust', 'Weekends Only', 'Weekdays Only'])

function bustActiveStyle(f) {
  if (f === 'No Bust') return { background: '#4a7a3a', borderColor: '#3d6830', color: '#ffffff' }
  if (f === 'Medium Bust' || f === 'Weekends Only' || f === 'Weekdays Only') return { background: '#c8a020', borderColor: '#b08818', color: '#ffffff' }
  if (f === 'Bust') return { background: '#c0453a', borderColor: '#a83830', color: '#ffffff' }
  return {}
}

export default function FilterChips({ active, onChange, compact = false }) {
  const activeArr = Array.isArray(active) ? active : [active]

  const handleClick = (f) => {
    if (f === 'All') { onChange(['All']); return }
    let next
    if (activeArr.includes('All')) {
      next = [f]
    } else if (activeArr.includes(f)) {
      next = activeArr.filter(x => x !== f)
      if (next.length === 0) next = ['All']
    } else {
      next = [...activeArr, f]
    }
    onChange(next)
  }

  const isActive = (f) => activeArr.includes(f)

  return (
    <div
      style={{ display: 'flex', gap: 6, padding: compact ? '5px 16px 6px' : '10px 16px 12px', overflowX: 'auto' }}
      className="hide-scroll"
    >
      {FILTERS.map(f => {
        const active = isActive(f)
        const isBust = BUST_RATINGS.has(f)
        return (
          <div
            key={f}
            className={`chip ${active ? 'active' : ''}`}
            style={active && isBust ? bustActiveStyle(f) : undefined}
            onClick={() => handleClick(f)}
          >
            {f}
          </div>
        )
      })}
    </div>
  )
}
