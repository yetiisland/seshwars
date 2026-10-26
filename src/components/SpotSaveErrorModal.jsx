import { createPortal } from 'react-dom'
import { LAYERS } from '../lib/layers'

// Shared by Drop a Spot and Edit Spot. Reuses .modal-overlay/.modal-sheet
// (same markup/colors as every other confirmation dialog in the app) but
// as a genuinely centered dialog, not the bottom sheet those classes
// default to on mobile: alignItems overridden to center on the overlay,
// and the sheet's own bottom-sheet specifics (flat top corners, top
// border, slide-up animation, safe-area bottom padding) overridden since
// none of them apply to something floating in the middle of the screen.
// No modal-handle either — that's a drag-to-dismiss affordance for a
// sheet, not this. `problems` is the list of plain-language lines shown
// as a bulleted list; rendering nothing when empty lets callers keep this
// mounted unconditionally.
const bodyTextStyle = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }

export default function SpotSaveErrorModal({ problems, onClose }) {
  if (!problems || problems.length === 0) return null
  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: LAYERS.CONFIRM, alignItems: 'center' }}>
      <div
        className="modal-sheet"
        onClick={e => e.stopPropagation()}
        style={{ width: 'calc(100% - 48px)', maxWidth: 'var(--desktop-content-max-width)', borderRadius: 12, borderTop: 'none', paddingBottom: 0, animation: 'none' }}
      >
        <div style={{ padding: '20px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Missing Spot Information
        </div>
        <div style={{ padding: '0 16px 10px', ...bodyTextStyle }}>
          Please add the following in order to save this spot:
        </div>
        <ul style={{ margin: 0, padding: '0 16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {problems.map((problem, i) => (
            <li key={i} style={bodyTextStyle}>{problem}</li>
          ))}
        </ul>
        <div style={{ padding: '0 16px 28px' }}>
          <button className="btn-salmon" onClick={onClose}>Update Spot Info</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
