// Exact spec, approved as a one-off exception to the usual design-tokens-only
// rule (see docs/design-tokens.md's "Trick checkmark" entry): 32px circle,
// unchecked fill #DFEEDF / stroke #4E9A51 at 1.7, checked fill #4E9A51 with
// no stroke and a white check. The check path's own coordinates are given in
// a 24x24 space, so it's nested as its own <svg> (x=4,y=4,24x24) inside the
// 32x32 outer circle rather than rescaled into the circle's own coordinates.
export default function TrickCheckmark({ landed, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ width: 32, height: 32, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle
          cx="16" cy="16" r="15.15"
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
