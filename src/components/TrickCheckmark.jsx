// Approved final spec (see docs/design-tokens.md's "Trick checkmark"
// entry): 32px rounded square (radius 6). Unchecked: fill #FFFFFF, stroke
// #EAD8C8 at 1.7. Checked: fill #DFEEDF, stroke #4E9A51 at 2, check path
// stroke #3d6830 at 3.4. The rect is inset 1px on each side (not 0.85) so
// the thicker checked-state stroke (2px, half extends 1px outside the
// rect) doesn't clip against the 32px viewBox. The check path's own
// coordinates are given in a 24x24 space, so it's nested as its own <svg>
// (x=4,y=4,24x24) inside the 32x32 outer square rather than rescaled into
// the square's own coordinates.
export default function TrickCheckmark({ landed, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ width: 32, height: 32, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect
          x="1" y="1" width="30" height="30" rx="6"
          fill={landed ? '#DFEEDF' : '#FFFFFF'}
          stroke={landed ? '#4E9A51' : '#EAD8C8'}
          strokeWidth={landed ? 2 : 1.7}
        />
        {landed && (
          <svg x="4" y="4" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M6.6 11.8 L10.5 15.8 L17.5 6.8" stroke="#3d6830" strokeWidth="3.4" strokeLinecap="butt" strokeLinejoin="miter" fill="none" />
          </svg>
        )}
      </svg>
    </div>
  )
}
