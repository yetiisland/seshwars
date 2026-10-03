// Full-screen loading popup — extracted verbatim from the photo-upload
// progress overlay that used to live only in AddSpot.jsx, so every
// loading state that needs this treatment (photo upload, spot submission)
// renders through the same component instead of re-implementing it.
export default function LoadingOverlay({ title, subtitle, current = 0, total = 0 }) {
  const frac = total > 0 ? current / total : 0
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ background: '#FDF8F0', borderRadius: 12, padding: '32px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center', width: '100%', maxWidth: 300 }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="20" stroke="#EAD8C8" strokeWidth="3" fill="none" />
          <circle cx="24" cy="24" r="20" stroke="#d4785a" strokeWidth="3" fill="none"
            strokeDasharray={`${frac * 125.6} 125.6`}
            strokeDashoffset="0" strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dasharray 0.4s' }} />
        </svg>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{subtitle}</div>
        </div>
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: '#EAD8C8', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: '#d4785a', transition: 'width 0.4s',
            width: `${frac * 100}%`,
          }} />
        </div>
      </div>
    </div>
  )
}
