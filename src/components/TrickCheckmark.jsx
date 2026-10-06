// Exact spec, approved as a one-off exception to the usual design-tokens-only
// rule (see docs/design-tokens.md's "Trick checkmark" entry): 32px rounded
// square (radius 6), unchecked fill #DFEEDF / stroke #4E9A51 at 1.7, checked
// fill #4E9A51 with no stroke and a white check. Same 0.85px inset the
// previous circle (r=15.15 in a 32px box) used, so the stroke doesn't clip.
// The check path's own coordinates are given in a 24x24 space, so it's
// nested as its own <svg> (x=4,y=4,24x24) inside the 32x32 outer square
// rather than rescaled into the square's own coordinates.
export default function TrickCheckmark({ landed, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ width: 32, height: 32, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect
          x="0.85" y="0.85" width="30.3" height="30.3" rx="6"
          fill={landed ? '#4E9A51' : '#DFEEDF'}
          stroke={landed ? 'none' : '#4E9A51'}
          strokeWidth={landed ? 0 : 1.7}
        />
        {landed && (
          <svg x="4" y="4" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M6.6 11.8 L10.5 15.8 L17.5 6.8" stroke="#fff" strokeWidth="2.8" strokeLinecap="butt" strokeLinejoin="miter" fill="none" />
          </svg>
        )}
      </svg>
    </div>
  )
}
