import { useState, useEffect } from 'react'

// On-screen keyboard detection with no native plugin — @capacitor/keyboard
// isn't installed, and the task that added this was told not to add one.
// window.visualViewport shrinks to exclude the keyboard on platforms that
// report it (iOS WKWebView/Safari, Chrome/Android); treated as open once it
// eats more than 150px of window.innerHeight, same threshold already used
// for the composer-scroll heuristic elsewhere in the app.
const KEYBOARD_HEIGHT_THRESHOLD_PX = 150

export default function useKeyboardOpen() {
  const [state, setState] = useState({ isOpen: false, height: 0 })

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const diff = window.innerHeight - vv.height
      setState(diff > KEYBOARD_HEIGHT_THRESHOLD_PX ? { isOpen: true, height: diff } : { isOpen: false, height: 0 })
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return state
}
