import { useState, useRef } from 'react'

function DragHandle() {
  return (
    <div style={{ position: 'absolute', top: 3, left: 3, padding: 2, zIndex: 3, cursor: 'grab', background: 'rgba(0,0,0,0.45)', borderRadius: 3 }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="3" cy="2" r="1" fill="#fff" />
        <circle cx="7" cy="2" r="1" fill="#fff" />
        <circle cx="3" cy="5" r="1" fill="#fff" />
        <circle cx="7" cy="5" r="1" fill="#fff" />
        <circle cx="3" cy="8" r="1" fill="#fff" />
        <circle cx="7" cy="8" r="1" fill="#fff" />
      </svg>
    </div>
  )
}

export default function DraggablePhotos({ photos, setPhotos, onAdd, uploading, uploadingText = 'Uploading...' }) {
  const [desktopDragIdx, setDesktopDragIdx] = useState(null)
  const [touchFromIdx, setTouchFromIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  const itemRefs = useRef([])
  const longPressTimer = useRef(null)
  const isLongPress = useRef(false)
  const cloneEl = useRef(null)
  const touchStartPos = useRef(null)
  const touchDragInfo = useRef(null)

  const applyReorder = (from, to) => {
    if (from === to || to == null) return
    const next = [...photos]
    const [removed] = next.splice(from, 1)
    next.splice(to, 0, removed)
    setPhotos(next)
  }

  // ── Desktop HTML5 drag ────────────────────────────────────────
  const onDragStart = (i) => setDesktopDragIdx(i)
  const onDragEnd = () => { setDesktopDragIdx(null); setDropIdx(null) }
  const onDragOver = (e, i) => { e.preventDefault(); setDropIdx(i) }
  const onDrop = (e, i) => {
    e.preventDefault()
    if (desktopDragIdx !== null && desktopDragIdx !== i) applyReorder(desktopDragIdx, i)
    setDesktopDragIdx(null)
    setDropIdx(null)
  }

  // ── Touch long-press drag ─────────────────────────────────────
  const cleanupClone = () => {
    if (cloneEl.current) {
      cloneEl.current.parentNode?.removeChild(cloneEl.current)
      cloneEl.current = null
    }
  }

  const onTouchStart = (e, i) => {
    const touch = e.touches[0]
    touchStartPos.current = { x: touch.clientX, y: touch.clientY }
    isLongPress.current = false

    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      const el = itemRefs.current[i]
      if (!el) return
      const rect = el.getBoundingClientRect()

      const clone = el.cloneNode(true)
      clone.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        z-index: 9999;
        pointer-events: none;
        transform: scale(1.07);
        box-shadow: 0 10px 28px rgba(0,0,0,0.35);
        opacity: 0.92;
        border-radius: 4px;
        overflow: hidden;
        transition: transform 0.12s, box-shadow 0.12s;
      `
      document.body.appendChild(clone)
      cloneEl.current = clone

      touchDragInfo.current = {
        fromIdx: i,
        startX: touch.clientX,
        startY: touch.clientY,
        rectLeft: rect.left,
        rectTop: rect.top,
      }
      setTouchFromIdx(i)
      setDropIdx(i)
    }, 500)
  }

  const onTouchMove = (e) => {
    const touch = e.touches[0]

    if (!isLongPress.current) {
      // Cancel long press if finger moved significantly before timer fires
      if (touchStartPos.current) {
        const dx = Math.abs(touch.clientX - touchStartPos.current.x)
        const dy = Math.abs(touch.clientY - touchStartPos.current.y)
        if (dx > 8 || dy > 8) clearTimeout(longPressTimer.current)
      }
      return
    }

    e.preventDefault()
    const info = touchDragInfo.current
    if (!info || !cloneEl.current) return

    // Move floating clone with finger
    const dx = touch.clientX - info.startX
    const dy = touch.clientY - info.startY
    cloneEl.current.style.left = (info.rectLeft + dx) + 'px'
    cloneEl.current.style.top = (info.rectTop + dy) + 'px'

    // Find which photo the finger is over
    for (let j = 0; j < itemRefs.current.length; j++) {
      const el = itemRefs.current[j]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (
        touch.clientX >= rect.left && touch.clientX <= rect.right &&
        touch.clientY >= rect.top && touch.clientY <= rect.bottom
      ) {
        setDropIdx(j)
        return
      }
    }
  }

  const onTouchEnd = () => {
    clearTimeout(longPressTimer.current)
    if (isLongPress.current && touchDragInfo.current) {
      applyReorder(touchDragInfo.current.fromIdx, dropIdx ?? touchDragInfo.current.fromIdx)
    }
    cleanupClone()
    isLongPress.current = false
    touchDragInfo.current = null
    touchStartPos.current = null
    setTouchFromIdx(null)
    setDropIdx(null)
  }

  const dragFromIdx = desktopDragIdx ?? touchFromIdx

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {photos.map((url, i) => (
          <div
            key={url + i}
            ref={el => { itemRefs.current[i] = el }}
            draggable
            onDragStart={() => onDragStart(i)}
            onDragEnd={onDragEnd}
            onDragOver={e => onDragOver(e, i)}
            onDrop={e => onDrop(e, i)}
            onTouchStart={e => onTouchStart(e, i)}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              width: 72, height: 72, borderRadius: 4, overflow: 'hidden', position: 'relative',
              flexShrink: 0,
              border: dropIdx === i && dragFromIdx !== i ? '2px solid #d4785a' : '1px solid #EAD8C8',
              opacity: dragFromIdx === i ? 0.35 : 1,
              cursor: 'grab',
              touchAction: 'none',
              transition: 'opacity 0.15s',
            }}
          >
            <img src={url} alt="spot" style={{ width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none', pointerEvents: 'none', display: 'block' }} draggable={false} />
            <DragHandle />
            {i === 0 && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', fontSize: 7, color: '#fff', textAlign: 'center', padding: '2px 0', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', pointerEvents: 'none' }}>
                Cover
              </div>
            )}
            <div
              onClick={e => { e.stopPropagation(); setPhotos(prev => prev.filter((_, j) => j !== i)) }}
              style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 4 }}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /><line x1="7" y1="1" x2="1" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
            </div>
          </div>
        ))}
        <div
          onClick={uploading ? undefined : onAdd}
          style={{ width: 72, height: 72, borderRadius: 4, background: '#ECEDF2', border: '1px solid #C8CAD4', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: uploading ? 'default' : 'pointer', flexShrink: 0, opacity: uploading ? 0.7 : 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#6a6c7a" strokeWidth="1.2" /><line x1="8" y1="5" x2="8" y2="11" stroke="#6a6c7a" strokeWidth="1.2" strokeLinecap="round" /><line x1="5" y1="8" x2="11" y2="8" stroke="#6a6c7a" strokeWidth="1.2" strokeLinecap="round" /></svg>
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2 }}>
            {uploading ? uploadingText : 'Add'}
          </span>
        </div>
      </div>
      {photos.length > 1 && !dragFromIdx && (
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 5, fontWeight: 700 }}>
          HOLD TO DRAG · FIRST PHOTO = COVER
        </div>
      )}
    </div>
  )
}
