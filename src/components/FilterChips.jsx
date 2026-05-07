const FILTERS = ['All', 'Street', 'DIY', 'Park', 'Ledges', 'Stairs', 'Banks', 'Hubba', 'Gap', 'Hand Rail', 'Flat Bar', 'No Bust', 'Bust', 'Weekends Only', 'Weekdays Only']

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
      {FILTERS.map(f => (
        <div
          key={f}
          className={`chip ${isActive(f) ? 'active' : ''}`}
          onClick={() => handleClick(f)}
        >
          {f}
        </div>
      ))}
    </div>
  )
}
