import { createPortal } from 'react-dom'
import { LAYERS } from '../lib/layers'

// Shared by Drop a Spot and Edit Spot. Same bottom sheet component/styles
// as every other popup in the app (modal-overlay/modal-sheet/modal-handle,
// full width, slides up from the bottom) at LAYERS.CONFIRM so it sits
// above everything, including the keyboard-hidden fixed action button.
// `problems` is the list of plain-language lines shown as a bulleted
// list; rendering nothing when empty lets callers keep this mounted
// unconditionally.
const bodyTextStyle = { fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }

export default function SpotSaveErrorModal({ problems, onClose }) {
  if (!problems || problems.length === 0) return null
  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: LAYERS.CONFIRM }}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
