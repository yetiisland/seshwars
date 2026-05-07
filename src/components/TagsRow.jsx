import { useRef, useState, useLayoutEffect } from 'react'

export default function TagsRow({ features = [] }) {
  const containerRef = useRef(null)
  const [visibleCount, setVisibleCount] = useState(features.length)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !features.length) return

    const tagEls = [...container.querySelectorAll('[data-tag-item]')]
    if (!tagEls.length) return

    const available = container.offsetWidth
    const TAG_GAP = 4
    const OVERFLOW_CHIP_WIDTH = 34

    let usedWidth = 0
    let count = 0

    for (let i = 0; i < tagEls.length; i++) {
      const tagW = tagEls[i].offsetWidth
      const gapBefore = i > 0 ? TAG_GAP : 0
      const isLast = i === tagEls.length - 1
      const widthWithThis = usedWidth + gapBefore + tagW
      // Reserve space for overflow chip unless this is the last tag
      const required = isLast ? widthWithThis : widthWithThis + TAG_GAP + OVERFLOW_CHIP_WIDTH

      if (required <= available) {
        usedWidth = widthWithThis
        count = i + 1
      } else {
        break
      }
    }

    setVisibleCount(Math.max(features.length > 0 ? 1 : 0, count))
  }, [features])

  if (!features.length) return null

  const visible = features.slice(0, visibleCount)
  const hiddenCount = features.length - visibleCount

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', gap: 4, overflow: 'hidden', flex: 1, minWidth: 0, alignItems: 'center' }}
    >
      {features.map((f, i) => (
        <span
          key={f}
          data-tag-item=""
          className="tag"
          style={{ flexShrink: 0, display: i < visibleCount ? undefined : 'none' }}
        >
          {f}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="tag" style={{ flexShrink: 0 }}>+{hiddenCount}</span>
      )}
    </div>
  )
}
