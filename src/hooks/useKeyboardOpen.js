import { useState, useEffect, useRef } from 'react'

// On-screen keyboard detection with no native plugin — @capacitor/keyboard
// isn't installed, and the task that added this was told not to add one.
//
// window.innerHeight is not a stable baseline to diff visualViewport.height
// against: on iOS Safari (not the native app's own WKWebView, which keeps
// innerHeight fixed) innerHeight shrinks right along with the keyboard, so
// the two move together and the diff never crosses the threshold there.
// Tracking the largest height actually seen since load instead — something
// only Safari's own chrome collapsing, never the keyboard, can push the
// live height below — fixes detection on both.
const KEYBOARD_HEIGHT_THRESHOLD_PX = 150

// A blur on one field followed by a focus on the next (e.g. tapping a
// mention chip, or tabbing between inputs) can report a brief instant with
// no focused text input before the next focus event lands. Debouncing the
// close (never the open, which should react immediately) absorbs that gap
// instead of flashing the nav/padding back on mid-interaction.
const CLOSE_DEBOUNCE_MS = 300

// Input types that never bring up a text keyboard.
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'])

function isTextEntryElement(el) {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
  return false
}

const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)

export default function useKeyboardOpen() {
  const [state, setState] = useState({ isOpen: false, height: 0 })
  const maxHeightRef = useRef(typeof window !== 'undefined' ? window.innerHeight : 0)
  const focusedRef = useRef(false)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    const vv = window.visualViewport

    const commit = () => {
      const viewportHeight = vv ? vv.height : window.innerHeight
      const diff = Math.max(0, maxHeightRef.current - viewportHeight)
      const viewportOpen = diff > KEYBOARD_HEIGHT_THRESHOLD_PX
      // Fallback for platforms/contexts where neither innerHeight nor
      // visualViewport ever reports the keyboard eating space.
      const shouldBeOpen = viewportOpen || (isTouchDevice && focusedRef.current)

      clearTimeout(closeTimerRef.current)
      if (shouldBeOpen) {
        setState({ isOpen: true, height: diff })
        return
      }
      closeTimerRef.current = setTimeout(() => setState({ isOpen: false, height: 0 }), CLOSE_DEBOUNCE_MS)
    }

    const onWindowResize = () => {
      maxHeightRef.current = Math.max(maxHeightRef.current, window.innerHeight)
      commit()
    }
    // Width/height swap on rotate, so the pre-rotation max no longer
    // describes "full height, no keyboard" in the new orientation — reset
    // it to the current height rather than keep comparing against a max
    // that belongs to the other orientation.
    const onOrientationChange = () => {
      maxHeightRef.current = window.innerHeight
      commit()
    }
    const onFocusIn = (e) => {
      if (!isTextEntryElement(e.target)) return
      focusedRef.current = true
      commit()
    }
    const onFocusOut = (e) => {
      if (!isTextEntryElement(e.target)) return
      focusedRef.current = false
      commit()
    }

    commit()
    window.addEventListener('resize', onWindowResize)
    window.addEventListener('orientationchange', onOrientationChange)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    vv?.addEventListener('resize', commit)
    vv?.addEventListener('scroll', commit)
    return () => {
      clearTimeout(closeTimerRef.current)
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('orientationchange', onOrientationChange)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', commit)
      vv?.removeEventListener('scroll', commit)
    }
  }, [])

  return state
}
