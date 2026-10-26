import useKeyboardOpen from './useKeyboardOpen'

// While the keyboard is open, a full-screen page's own position:fixed,
// inset:0 container does not shrink with it (the layout viewport stays
// full height on iOS) — its scroll container's bottom edge ends up behind
// the keyboard, and iOS pans the whole page (rubber-banding) instead of
// letting the scroll container itself scroll. Sizing the scroll container
// to the actual visible area (visualViewport.height, offset by
// visualViewport.offsetTop) while the keyboard is open — reverting to its
// normal flex-child sizing once it closes — keeps the list itself as the
// one thing that scrolls. zIndex should match whatever LAYERS tier the
// enclosing page already renders at, since position:fixed here anchors to
// the viewport directly rather than any stacking context the page wrapper
// set up.
export default function useKeyboardAwareScrollStyle(zIndex) {
  const { isOpen } = useKeyboardOpen()
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!isOpen || !vv) return undefined
  return {
    position: 'fixed',
    top: vv.offsetTop,
    left: 0,
    right: 0,
    height: vv.height,
    zIndex,
  }
}
