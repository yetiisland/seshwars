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

// Below this, the visual viewport counts as genuinely back at full height
// (not just "no longer past the open threshold") — small enough to absorb
// only subpixel/rounding noise between window.innerHeight samples and
// visualViewport.height's float values, never an actual keyboard.
const FULL_HEIGHT_EPSILON_PX = 2

// A viewport reading that's dropped below the open threshold but hasn't
// yet reached full height (mid keyboard-dismiss animation, or similar
// transient resize noise) is ambiguous — it might still bounce back above
// the threshold. Only while a text input is still focused is that worth
// waiting out; an explicit blur, a tap outside the focused field, or the
// viewport actually reaching full height all close immediately regardless,
// overriding this.
const CLOSE_DEBOUNCE_MS = 300

// Input types that never bring up a text keyboard.
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden'])

function isTextEntryElement(el) {
  if (!el) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((el.type || 'text').toLowerCase())
  return false
}

export default function useKeyboardOpen() {
  const [state, setState] = useState({ isOpen: false, height: 0 })
  const maxHeightRef = useRef(typeof window !== 'undefined' ? window.innerHeight : 0)
  const closeTimerRef = useRef(null)

  useEffect(() => {
    const vv = window.visualViewport

    // Keeps focus and keyboard state from drifting apart (requirement 3):
    // once we're actually closing, a focused text input no longer has an
    // open keyboard behind it, so drop its focus too.
    const closeNow = () => {
      clearTimeout(closeTimerRef.current)
      setState(prev => {
        if (prev.isOpen && isTextEntryElement(document.activeElement)) document.activeElement.blur()
        return { isOpen: false, height: 0 }
      })
    }

    const commit = () => {
      const viewportHeight = vv ? vv.height : window.innerHeight
      const diff = Math.max(0, maxHeightRef.current - viewportHeight)
      const viewportOpen = diff > KEYBOARD_HEIGHT_THRESHOLD_PX

      clearTimeout(closeTimerRef.current)
      if (viewportOpen) {
        setState({ isOpen: true, height: diff })
        return
      }

      const viewportFullHeight = diff <= FULL_HEIGHT_EPSILON_PX
      if (viewportFullHeight || !isTextEntryElement(document.activeElement)) {
        closeNow()
        return
      }
      // Below the open threshold but not yet confirmed fully recovered,
      // and a text input is still focused — could still bounce back up.
      closeTimerRef.current = setTimeout(closeNow, CLOSE_DEBOUNCE_MS)
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
    // Any blur of a text input closes immediately — never debounced, even
    // if the viewport hasn't visibly caught up yet.
    const onFocusOut = (e) => {
      if (!isTextEntryElement(e.target)) return
      closeNow()
    }
    // A tap landing outside the currently-focused text input closes
    // immediately too, without waiting for the resulting blur to land.
    // Capture phase so this runs before the tap's own click handler —
    // which also means it runs before that handler's own preventDefault,
    // so anything meant to keep focus on tap (a mention chip) must be
    // exempted here directly rather than relying on preventDefault to
    // stop it downstream. data-keyboard-zone marks exactly that: the
    // comment composer card (textarea, mention chip row, POST COMMENT),
    // tagged in CommentsSection.jsx, is the whole reason this exemption
    // exists — tapping a chip must never close the keyboard or blur the
    // textarea, since the chip row itself hides on blur.
    const onPointerDownCapture = (e) => {
      if (isTextEntryElement(e.target)) return
      if (e.target.closest?.('[data-keyboard-zone]')) return
      if (isTextEntryElement(document.activeElement)) closeNow()
    }

    commit()
    window.addEventListener('resize', onWindowResize)
    window.addEventListener('orientationchange', onOrientationChange)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('pointerdown', onPointerDownCapture, true)
    vv?.addEventListener('resize', commit)
    vv?.addEventListener('scroll', commit)
    return () => {
      clearTimeout(closeTimerRef.current)
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('orientationchange', onOrientationChange)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPointerDownCapture, true)
      vv?.removeEventListener('resize', commit)
      vv?.removeEventListener('scroll', commit)
    }
  }, [])

  return state
}
