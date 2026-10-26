import { useRef, useMemo } from 'react'

// Spread the returned handlers onto a suggestions/results list so the
// first touchmove that moves more than 8px vertically dismisses the
// keyboard (by blurring the given input) instead of letting iOS try to
// rubber-band the whole page to make room for the scroll. Never calls
// preventDefault — the list keeps scrolling normally either way.
export default function useBlurOnScroll(inputRef) {
  const startYRef = useRef(null)
  const firedRef = useRef(false)

  return useMemo(() => ({
    onTouchStart: (e) => {
      startYRef.current = e.touches[0]?.clientY ?? null
      firedRef.current = false
    },
    onTouchMove: (e) => {
      if (firedRef.current || startYRef.current == null) return
      const y = e.touches[0]?.clientY
      if (y == null) return
      if (Math.abs(y - startYRef.current) > 8) {
        firedRef.current = true
        inputRef.current?.blur()
      }
    },
  }), [inputRef])
}
