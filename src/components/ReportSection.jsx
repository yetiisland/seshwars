import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

const REPORT_TYPES = [
  'No Longer Skateable',
  'Skate Stopped',
  'Spot Destroyed',
  'Temporarily Closed',
  "Spot Doesn't Exist",
  'Chance of Getting Arrested',
  'Nudity',
  'Gore',
  'Other',
]

const CONTENT_REPORT_TYPES = new Set(['Nudity', 'Gore'])

function CautionSVG({ size = 13, color = '#c8a020' }) {
  return (
    <svg width={size} height={Math.round(size * 0.88)} viewBox="0 0 18 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M9 1L17 15H1L9 1Z" fill={color} />
      <line x1="9" y1="5.5" x2="9" y2="10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="9" cy="12.5" r="1" fill="#fff" />
    </svg>
  )
}

export default function ReportSection({ spotId, spot, user, onGoProfile, onReported }) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [customText, setCustomText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const closeModal = () => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      setOpen(false)
      setSelectedType(null)
      setCustomText('')
      setError('')
    }, 180)
  }

  const handleSubmit = async () => {
    if (!selectedType || submitting) return
    if (selectedType === 'Other' && !customText.trim()) return
    setSubmitting(true)
    setError('')
    const { data: { user: cu }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !cu) { setError('Sign in to submit a report.'); setSubmitting(false); return }
    const { error: insertErr } = await supabase.from('spot_reports').insert({
      spot_id: spotId,
      user_id: cu.id,
      report_type: selectedType,
      custom_text: selectedType === 'Other' ? customText.trim() : null,
    })
    if (insertErr) { setError(insertErr.message); setSubmitting(false); return }

    if (CONTENT_REPORT_TYPES.has(selectedType) && spot) {
      supabase.functions.invoke('notify-new-spot', {
        body: { report_alert: true, report_type: selectedType, record: spot },
      }).catch(() => {})
    }

    setSubmitting(false)
    setSubmitted(true)
    closeModal()
    onReported?.(selectedType, selectedType === 'Other' ? customText.trim() : null)
  }

  return (
    <>
      {/* Outlined button — full width */}
      <div
        onClick={() => { if (!user) { onGoProfile?.(); return } setOpen(true) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          border: '1.5px solid #d4785a', borderRadius: 6, padding: 13,
          cursor: 'pointer', marginBottom: 20,
          background: 'transparent', opacity: submitted ? 0.55 : 1,
        }}
      >
        <CautionSVG size={13} color="#d4785a" />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#d4785a', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Barlow, sans-serif' }}>
          {submitted ? 'Report Submitted' : user ? 'Report This Spot' : 'Sign in to Report'}
        </span>
      </div>

      {/* Bottom sheet modal */}
      {(open || closing) && createPortal(
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', overflowY: 'auto', ...(closing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : {}) }}>
            <div className="modal-handle" />

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 16px 12px', position: 'relative' }}>
              <div style={{ flex: 1, fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Report This Spot
              </div>
            </div>

            <div className="divider" style={{ margin: '0 0 16px' }} />

            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Report type chips — single select */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REPORT_TYPES.map(type => (
                  <div
                    key={type}
                    className={`chip ${selectedType === type ? 'active' : ''}`}
                    style={selectedType === type ? { background: '#d4785a', borderColor: '#c06848', color: '#fff' } : undefined}
                    onClick={() => { setSelectedType(t => t === type ? null : type); setCustomText('') }}
                  >
                    {type}
                  </div>
                ))}
              </div>

              {/* Other text input */}
              {selectedType === 'Other' && (
                <textarea
                  value={customText}
                  onChange={e => setCustomText(e.target.value)}
                  placeholder="Describe the issue…"
                  rows={2}
                  style={{
                    width: '100%', resize: 'none', border: '1px solid #E8DDD0', borderRadius: 6,
                    padding: '8px 10px', fontSize: 12, fontFamily: 'Barlow, sans-serif',
                    color: 'var(--text-primary)', background: '#FAF5EE', outline: 'none',
                    lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                />
              )}

              {error && <div style={{ fontSize: 11, color: '#c0453a', fontWeight: 700 }}>{error}</div>}

              {/* Submit button */}
              <button
                onClick={handleSubmit}
                disabled={!selectedType || submitting || (selectedType === 'Other' && !customText.trim())}
                style={{
                  width: '100%', padding: 13, borderRadius: 6,
                  background: (!selectedType || (selectedType === 'Other' && !customText.trim())) ? '#E8DDD0' : '#d4785a',
                  border: 'none', color: (!selectedType || (selectedType === 'Other' && !customText.trim())) ? '#b0a090' : '#fff',
                  fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                  cursor: (!selectedType || submitting) ? 'default' : 'pointer',
                  fontFamily: 'Barlow, sans-serif', transition: 'background 0.15s',
                }}
              >
                {submitting ? 'Submitting…' : 'Report This Spot'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
