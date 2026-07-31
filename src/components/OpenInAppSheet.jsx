import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'

const APP_STORE_URL = 'https://apps.apple.com/app/id6779744364'
const SCHEME_PREFIX = 'seshwars://spot/'

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function canShow() {
  if (Capacitor.isNativePlatform()) return false
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches
}

export default function OpenInAppSheet({ spot, onHeight }) {
  const [visible, setVisible] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const timerRef = useRef(null)
  const containerRef = useRef(null)
  const onHeightRef = useRef(onHeight)
  onHeightRef.current = onHeight

  useEffect(() => {
    if (!canShow() || !spot) return
    const dismissed = sessionStorage.getItem('openInAppDismissed')
    if (dismissed) {
      setCollapsed(true)
    }
    setVisible(true)
  }, [spot])

  // Report height to parent so it can pad the scroll content
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      onHeightRef.current?.(entries[0].borderBoxSize?.[0]?.blockSize ?? entries[0].contentRect.height)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [visible]) // re-bind when visibility changes so ref is populated

  // Clear reported height when sheet hides
  useEffect(() => {
    if (!visible) onHeightRef.current?.(0)
  }, [visible])

  if (!visible || !spot) return null

  const slug = spot.slug || spot.id
  const appUrl = `${SCHEME_PREFIX}${slug}`

  function openInApp() {
    const hiddenAtClick = document.hidden
    const cleanup = () => {
      clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('pagehide', onFocus)
    }
    const onFocus = () => {
      if (document.hidden !== hiddenAtClick) cleanup()
    }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('pagehide', onFocus)
    window.location.href = appUrl
    timerRef.current = setTimeout(() => {
      cleanup()
      window.location.href = APP_STORE_URL
    }, 1200)
  }

  function dismiss() {
    sessionStorage.setItem('openInAppDismissed', '1')
    setCollapsed(true)
  }

  const safeBottom = 'max(env(safe-area-inset-bottom, 0px), 12px)'

  const containerStyle = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1100,
    background: '#FDF8F0',
    borderTop: '1.5px solid #EAD8C8',
    borderRadius: '16px 16px 0 0',
    boxShadow: '0 -4px 24px rgba(42,30,20,0.10)',
    animation: prefersReducedMotion ? 'none' : 'slideInUp 0.25s ease-out',
  }

  const logo = (
    <img
      src="/sw-webclip.png"
      alt="Sesh Wars"
      style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0 }}
    />
  )

  if (collapsed) {
    return createPortal(
      <div ref={containerRef} style={{ ...containerStyle, padding: `10px 14px`, paddingBottom: `calc(${safeBottom} + 10px)`, display: 'flex', alignItems: 'center', gap: 10 }}>
        {logo}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, fontWeight: 700, color: '#2a1e14', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {spot.title}
          </div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 10, fontWeight: 600, color: '#9a8878' }}>
            View in Sesh Wars app
          </div>
        </div>
        <button
          onClick={openInApp}
          style={{ background: '#d4785a', color: '#FDF8F0', border: 'none', borderRadius: 8, padding: '7px 16px', fontFamily: 'Barlow, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
        >
          Open
        </button>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div ref={containerRef} style={{ ...containerStyle, padding: '18px 16px 14px', paddingBottom: `calc(${safeBottom} + 14px)`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {logo}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 14, fontWeight: 700, color: '#2a1e14', lineHeight: 1.3 }}>
            Open In The App
          </div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 11, fontWeight: 600, color: '#9a8878', marginTop: 2 }}>
            Get the full experience with the Sesh Wars App.
          </div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9a8878', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={openInApp}
          style={{ flex: 1, background: '#d4785a', color: '#FDF8F0', border: 'none', borderRadius: 10, padding: '10px 0', fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Open App
        </button>
        <button
          onClick={dismiss}
          style={{ flex: 1, background: 'transparent', color: '#9a8878', border: '1.5px solid #EAD8C8', borderRadius: 10, padding: '10px 0', fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Continue in Browser
        </button>
      </div>
    </div>,
    document.body
  )
}
