import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const CROP_PX = 280

export default function ImageCropModal({ imageFile, onConfirm, onCancel }) {
  const [imgSrc, setImgSrc] = useState(null)
  const natRef = useRef(null)
  const txRef = useRef({ scale: 1, x: 0, y: 0 })
  const [tick, setTick] = useState(0)
  const cropRef = useRef(null)
  const touchRef = useRef(null)
  const mouseRef = useRef(null)

  const clamp = ({ scale, x, y }) => {
    const nat = natRef.current
    if (!nat) return { scale, x, y }
    const imgW = nat.w * scale
    const imgH = nat.h * scale
    return {
      scale,
      x: Math.min(0, Math.max(x, CROP_PX - imgW)),
      y: Math.min(0, Math.max(y, CROP_PX - imgH)),
    }
  }

  const getMinScale = () => {
    const nat = natRef.current
    if (!nat) return 1
    return CROP_PX / Math.min(nat.w, nat.h)
  }

  useEffect(() => {
    const url = URL.createObjectURL(imageFile)
    const img = new Image()
    img.onload = () => {
      natRef.current = { w: img.naturalWidth, h: img.naturalHeight }
      const ms = CROP_PX / Math.min(img.naturalWidth, img.naturalHeight)
      txRef.current = clamp({
        scale: ms,
        x: (CROP_PX - img.naturalWidth * ms) / 2,
        y: (CROP_PX - img.naturalHeight * ms) / 2,
      })
      setImgSrc(url)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  // Attach non-passive touch listeners so we can call preventDefault
  useEffect(() => {
    const el = cropRef.current
    if (!el || !imgSrc) return

    const getDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const onStart = (e) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        touchRef.current = { type: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY }
      } else if (e.touches.length >= 2) {
        touchRef.current = { type: 'pinch', dist: getDist(e.touches) }
      }
    }

    const onMove = (e) => {
      e.preventDefault()
      if (!touchRef.current) return
      const tx = txRef.current
      if (touchRef.current.type === 'pan' && e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchRef.current.x
        const dy = e.touches[0].clientY - touchRef.current.y
        touchRef.current.x = e.touches[0].clientX
        touchRef.current.y = e.touches[0].clientY
        txRef.current = clamp({ ...tx, x: tx.x + dx, y: tx.y + dy })
        setTick(n => n + 1)
      } else if (touchRef.current.type === 'pinch' && e.touches.length >= 2) {
        const d = getDist(e.touches)
        const ratio = d / touchRef.current.dist
        touchRef.current.dist = d
        const minS = getMinScale()
        const newScale = Math.min(10, Math.max(minS, tx.scale * ratio))
        const newX = CROP_PX / 2 - (CROP_PX / 2 - tx.x) * (newScale / tx.scale)
        const newY = CROP_PX / 2 - (CROP_PX / 2 - tx.y) * (newScale / tx.scale)
        txRef.current = clamp({ scale: newScale, x: newX, y: newY })
        setTick(n => n + 1)
      }
    }

    const onEnd = () => { touchRef.current = null }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [imgSrc])

  const handleMouseDown = (e) => {
    mouseRef.current = { x: e.clientX, y: e.clientY }
  }
  const handleMouseMove = (e) => {
    if (!mouseRef.current) return
    const dx = e.clientX - mouseRef.current.x
    const dy = e.clientY - mouseRef.current.y
    mouseRef.current.x = e.clientX
    mouseRef.current.y = e.clientY
    txRef.current = clamp({ ...txRef.current, x: txRef.current.x + dx, y: txRef.current.y + dy })
    setTick(n => n + 1)
  }
  const handleMouseUp = () => { mouseRef.current = null }

  const handleWheel = (e) => {
    e.preventDefault()
    const ratio = e.deltaY < 0 ? 1.1 : 0.9
    const tx = txRef.current
    const minS = getMinScale()
    const newScale = Math.min(10, Math.max(minS, tx.scale * ratio))
    const newX = CROP_PX / 2 - (CROP_PX / 2 - tx.x) * (newScale / tx.scale)
    const newY = CROP_PX / 2 - (CROP_PX / 2 - tx.y) * (newScale / tx.scale)
    txRef.current = clamp({ scale: newScale, x: newX, y: newY })
    setTick(n => n + 1)
  }

  const handleConfirm = () => {
    if (!imgSrc || !natRef.current) return
    const { scale, x, y } = txRef.current
    const srcX = -x / scale
    const srcY = -y / scale
    const srcSize = CROP_PX / scale
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = CROP_PX
      canvas.height = CROP_PX
      canvas.getContext('2d').drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, CROP_PX, CROP_PX)
      canvas.toBlob(blob => {
        if (blob) onConfirm(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.95)
    }
    img.src = imgSrc
  }

  const { scale, x, y } = txRef.current

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#fff', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1.5 }}>
        Crop Photo
      </div>

      {/* Circular crop frame */}
      <div
        ref={cropRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          width: CROP_PX, height: CROP_PX,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid rgba(255,255,255,0.85)',
          position: 'relative',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
          flexShrink: 0,
        }}
      >
        {imgSrc && natRef.current && (
          <img
            src={imgSrc}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: natRef.current.w * scale,
              height: natRef.current.h * scale,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          />
        )}
        {!imgSrc && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a1e14' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Loading…</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 14, fontWeight: 700, letterSpacing: 0.5, textAlign: 'center' }}>
        drag · pinch to zoom
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button
          onClick={onCancel}
          style={{ padding: '12px 28px', borderRadius: 6, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.35)', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!imgSrc}
          style={{ padding: '12px 28px', borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: imgSrc ? 1 : 0.5 }}
        >
          Use Photo
        </button>
      </div>
    </div>,
    document.body
  )
}
