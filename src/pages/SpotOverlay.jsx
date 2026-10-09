import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import { isAdminUser } from '../lib/admin'
import SpotDetail from './SpotDetail'
import OpenInAppSheet from '../components/OpenInAppSheet'

// Renders a spot's detail page ON TOP OF App (position:fixed, full screen,
// above the tab content but below App's own TabBar) instead of replacing
// it — see main.jsx: /spot/:slug and /spots/:slug both fall through to the
// same catch-all route App already renders, so App (and its kept-alive
// ListView/MapView) never unmounts for this. Auth, saved/hidden spots, and
// the save/sign-in modals are App's own already-loaded state, passed down
// as props — this component only owns the spot fetch itself and the
// header chrome SpotPage.jsx used to render standalone.
export default function SpotOverlay({ slug, user, saved, hiddenIds, unhideSpot, onBack, onGoProfile, onGoAuth, onSavePress, sheetPad, onSheetPad }) {
  const location = useLocation()
  const stateSpot = location.state?.spot?.title ? location.state.spot : null
  const [spot, setSpot] = useState(stateSpot)
  const [loading, setLoading] = useState(!stateSpot)
  const spotDetailRef = useRef(null)

  useEffect(() => {
    if (stateSpot) return
    let cancelled = false
    async function fetchSpot() {
      let { data } = await supabase.from('spots').select('*').eq('slug', slug).single()
      if (!data) {
        const res = await supabase.from('spots').select('*').eq('id', slug).single()
        data = res.data
      }
      if (!cancelled) { setSpot(data); setLoading(false) }
    }
    fetchSpot()
    return () => { cancelled = true }
  }, [slug, location.state?.spot])

  useEffect(() => {
    if (!spot || Capacitor.isNativePlatform()) return
    const canonicalSlug = spot.slug || slug
    const appArgument = `https://seshwars.com/spot/${canonicalSlug}`
    let meta = document.querySelector('meta[name="apple-itunes-app"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'apple-itunes-app'
      document.head.appendChild(meta)
    }
    meta.content = `app-id=6779744364, app-argument=${appArgument}`
    return () => { meta?.remove() }
  }, [spot, slug])

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FDF8F0', fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#9a8878', fontWeight: 700 }}>
        Loading...
      </div>
    )
  }

  if (!spot) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#FDF8F0' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14', fontFamily: 'Barlow, sans-serif' }}>This spot is no longer available.</div>
        <button onClick={onBack} style={{ fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif' }}>
          ← Back
        </button>
      </div>
    )
  }

  const isOwner = !!user && user.id === spot.added_by
  const isAdmin = isAdminUser(user)

  if (spot.visibility === 'private' && !isOwner && !isAdmin) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 32px', textAlign: 'center', background: '#FDF8F0' }}>
        <svg width="36" height="42" viewBox="0 0 14 16" fill="none">
          <rect x="3" y="7" width="8" height="8" rx="1.5" stroke="#b0906a" strokeWidth="1.4" />
          <path d="M4.5 7V5a2.5 2.5 0 015 0v2" stroke="#b0906a" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2a1e14', fontFamily: 'Barlow, sans-serif' }}>This spot is private.</div>
        <div style={{ fontSize: 11, color: '#9a8878', fontFamily: 'Barlow, sans-serif', fontWeight: 600 }}>Only the owner can view this spot.</div>
        <button onClick={onBack} style={{ fontSize: 11, color: '#d4785a', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'Barlow, sans-serif', marginTop: 4 }}>
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div className="desktop-page-root" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#FDF8F0', overflow: 'hidden' }}>
      {/* Cream navbar with back button + spot title */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 14px 10px',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        background: '#FDF8F0',
        borderBottom: '1px solid rgba(212,120,90,0.12)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div
          onClick={onBack}
          style={{ width: 32, height: 32, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {spot.title}
        </div>
        {(isOwner || isAdmin) ? (
          <div
            onClick={() => spotDetailRef.current?.handleEditClick()}
            style={{ width: 32, height: 32, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 2L12 4.5L5 11.5H2.5V9L9.5 2Z" stroke="#d4785a" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div style={{ width: 32 }} />
        )}
      </div>

      {/* Spot detail content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <SpotDetail
          ref={spotDetailRef}
          spot={spot}
          saved={saved.has(spot.id)}
          onSavePress={onSavePress}
          onBack={onBack}
          onEditSuccess={(updatedSpot) => {
            // Edit success passes the saved row — merge it and stay on this page.
            // Reject/delete call with no argument — the spot is gone, navigate away.
            if (updatedSpot) setSpot(prev => ({ ...prev, ...updatedSpot }))
            else onBack()
          }}
          user={user}
          onGoProfile={onGoProfile}
          isHidden={hiddenIds.has(spot.id)}
          onHidePress={() => { if (!user) onGoAuth?.() }}
          onUnhidePress={() => unhideSpot(spot.id)}
          sheetPad={sheetPad}
          scrollToCommentId={location.state?.scrollToCommentId}
        />
      </div>

      <OpenInAppSheet spot={spot} onHeight={onSheetPad} />
    </div>
  )
}
