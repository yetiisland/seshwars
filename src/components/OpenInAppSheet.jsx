import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'

const APP_STORE_URL = 'https://apps.apple.com/app/id6779744364'
const ANDROID_STORE_URL = null
const SCHEME_PREFIX = 'seshwars://spot/'

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function detectOS() {
  const ua = navigator.userAgent
  if (/ipad|iphone|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'unknown'
}

function canShow() {
  if (Capacitor.isNativePlatform()) return false
  if (typeof window === 'undefined') return false
  // Only show on direct arrival — if App.jsx has mounted, user arrived via in-app navigation
  if (sessionStorage.getItem('seshwars:appMounted')) return false
  return window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches
}

export default function OpenInAppSheet({ spot, onHeight }) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)
  const containerRef = useRef(null)
  const onHeightRef = useRef(onHeight)
  onHeightRef.current = onHeight

  useEffect(() => {
    if (!canShow() || !spot) return
    if (sessionStorage.getItem('openInAppDismissed')) return
    setVisible(true)
  }, [spot])

  useEffect(() => {
    if (!containerRef.current || !visible) return
    const ro = new ResizeObserver(entries => {
      onHeightRef.current?.(entries[0].borderBoxSize?.[0]?.blockSize ?? entries[0].contentRect.height)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) onHeightRef.current?.(0)
  }, [visible])

  if (!visible || !spot) return null

  const slug = spot.slug || spot.id
  const appUrl = `${SCHEME_PREFIX}${slug}`
  const os = detectOS()

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

  function openAndroid() {
    if (ANDROID_STORE_URL) window.open(ANDROID_STORE_URL, '_blank')
  }

  function dismiss() {
    sessionStorage.setItem('openInAppDismissed', '1')
    setVisible(false)
  }

  const safeBottom = 'max(env(safe-area-inset-bottom, 0px), 16px)'

  const showIos = os === 'ios' || os === 'unknown'
  const showAndroid = (os === 'android' || os === 'unknown') && ANDROID_STORE_URL

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}
      onClick={dismiss}
    >
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: 'calc(100% - 16px)',
          margin: '0 8px',
          background: '#FDF8F0',
          borderRadius: '26px 26px 0 0',
          boxShadow: '0 -4px 24px rgba(42,30,20,0.15)',
          animation: prefersReducedMotion ? 'none' : 'slideInUp 0.25s ease-out',
          padding: '24px 20px',
          paddingBottom: `calc(${safeBottom} + 24px)`,
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.08)', border: 'none', cursor: 'pointer', width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a8878', padding: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <img
          src="/sw-webclip.png"
          alt="Sesh Wars"
          style={{ width: 80, height: 80, borderRadius: 18, marginBottom: 16, display: 'block' }}
        />

        <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 22, fontWeight: 900, color: '#2a1e14', lineHeight: 1.15, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          Open In The App
        </div>

        <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 13, fontWeight: 600, color: '#9a8878', marginBottom: 22, lineHeight: 1.5 }}>
          Get the full experience with the Sesh Wars App.
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {showIos && (
            <button
              onClick={openInApp}
              style={{ flex: 1, background: '#d4785a', color: '#FDF8F0', border: 'none', borderRadius: 10, padding: '13px 0', fontFamily: 'Barlow, sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }}
            >
              App Store
            </button>
          )}
          {showAndroid && (
            <button
              onClick={openAndroid}
              style={{ flex: 1, background: '#3D4454', color: '#FDF8F0', border: 'none', borderRadius: 10, padding: '13px 0', fontFamily: 'Barlow, sans-serif', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }}
            >
              Google Play
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
