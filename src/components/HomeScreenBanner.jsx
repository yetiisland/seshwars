import { useState, useEffect } from 'react'

const STORAGE_KEY = 'seshwars_banner_dismissed'

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone
}

export default function HomeScreenBanner() {
  const [visible, setVisible] = useState(false)
  const [animIn, setAnimIn] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(STORAGE_KEY)) return
    const t = setTimeout(() => {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)))
    }, 900)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    setAnimIn(false)
    setTimeout(() => setVisible(false), 320)
    localStorage.setItem(STORAGE_KEY, '1')
  }

  if (!visible) return null

  return (
    <div style={{
      background: '#FFF6E6',
      borderTop: '1px solid rgba(212,120,90,0.2)',
      padding: '10px 14px 11px',
      flexShrink: 0,
      transform: animIn ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 0.35s cubic-bezier(0.25,0.1,0.25,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2a352a', lineHeight: 1.4 }}>
            📲 Add to your home screen for the best experience
          </div>
          <div style={{ fontSize: 10, color: '#4d6348', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1.3 }}>
            Tap the share button on your web browser, then 'Add to Home Screen'
          </div>
        </div>
        <div
          onClick={dismiss}
          style={{ width: 26, height: 26, borderRadius: 4, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 1 }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="1" y1="1" x2="9" y2="9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}
