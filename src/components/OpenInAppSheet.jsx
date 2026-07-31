import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'

const APP_STORE_URL = 'https://apps.apple.com/app/id6779744364'
const SCHEME_PREFIX = 'seshwars://spot/'

function canShow() {
  if (Capacitor.isNativePlatform()) return false
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia('(max-width: 767px) and (pointer: coarse)')
  return mq.matches
}

export default function OpenInAppSheet({ spot }) {
  const [visible, setVisible] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!canShow() || !spot) return
    const dismissed = sessionStorage.getItem('openInAppDismissed')
    if (dismissed) {
      setCollapsed(true)
      setVisible(true)
    } else {
      setVisible(true)
    }
  }, [spot])

  if (!visible || !spot) return null

  const slug = spot.slug || spot.id
  const appUrl = `${SCHEME_PREFIX}${slug}`

  function openInApp() {
    const hidden = document.hidden

    const onVisibility = () => {
      if (document.hidden !== hidden) {
        clearTimeout(timerRef.current)
        document.removeEventListener('visibilitychange', onVisibility)
        window.removeEventListener('pagehide', onVisibility)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onVisibility)

    window.location.href = appUrl
    timerRef.current = setTimeout(() => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onVisibility)
      window.location.href = APP_STORE_URL
    }, 1200)
  }

  function dismiss() {
    sessionStorage.setItem('openInAppDismissed', '1')
    setCollapsed(true)
  }

  const logo = (
    <img
      src="/sw-webclip.png"
      alt="Sesh Wars"
      style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
    />
  )

  if (collapsed) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        left: 12,
        right: 12,
        zIndex: 200,
        background: '#FDF8F0',
        border: '1.5px solid #EAD8C8',
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        boxShadow: '0 2px 12px rgba(42,30,20,0.10)',
      }}>
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
          style={{
            background: '#d4785a',
            color: '#FDF8F0',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            fontFamily: 'Barlow, sans-serif',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Open
        </button>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
      left: 12,
      right: 12,
      zIndex: 200,
      background: '#FDF8F0',
      border: '1.5px solid #EAD8C8',
      borderRadius: 16,
      padding: '18px 16px 14px',
      boxShadow: '0 4px 24px rgba(42,30,20,0.13)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {logo}
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 14, fontWeight: 700, color: '#2a1e14', lineHeight: 1.3 }}>
            Open in Sesh Wars
          </div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontSize: 11, fontWeight: 600, color: '#9a8878', marginTop: 2 }}>
            Get the full experience — offline maps, save spots & more.
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
          style={{
            flex: 1,
            background: '#d4785a',
            color: '#FDF8F0',
            border: 'none',
            borderRadius: 10,
            padding: '10px 0',
            fontFamily: 'Barlow, sans-serif',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Open App
        </button>
        <button
          onClick={dismiss}
          style={{
            flex: 1,
            background: 'transparent',
            color: '#9a8878',
            border: '1.5px solid #EAD8C8',
            borderRadius: 10,
            padding: '10px 0',
            fontFamily: 'Barlow, sans-serif',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Continue in Browser
        </button>
      </div>
    </div>
  )
}
