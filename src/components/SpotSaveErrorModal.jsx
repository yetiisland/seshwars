import { createPortal } from 'react-dom'
import { LAYERS } from '../lib/layers'

// Shared by Drop a Spot and Edit Spot — same centered confirmation dialog
// markup/styles used everywhere else in the app (modal-overlay/modal-sheet/
// modal-handle), just with a single OK button instead of two. `problems` is
// a list of plain-language lines (one per line); rendering nothing when
// empty lets callers keep this mounted unconditionally.
export default function SpotSaveErrorModal({ problems, onClose }) {
  if (!problems || problems.length === 0) return null
  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: LAYERS.CONFIRM }}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div style={{ padding: '4px 16px 10px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Can't save this spot yet
        </div>
        <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {problems.map((problem, i) => <div key={i}>{problem}</div>)}
        </div>
        <div style={{ padding: '0 16px 28px' }}>
          <button className="btn-salmon" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
