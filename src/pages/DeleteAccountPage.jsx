export default function DeleteAccountPage({ onClose, onDeleteClick }) {
  // Every claim below is read directly from the account-deletion code path
  // (supabase/functions/delete-account/index.ts) — it anonymizes added
  // spots (added_by -> null), hard-deletes spot_clips/spot_reviews/
  // spot_comments/spot_reports/saved_spots/spot_lists/profiles rows for
  // this user, then deletes the auth user itself. It does not touch hidden
  // spots, trick-list entries, friend connections, or notifications, so
  // those are deliberately not claimed here — see the PR/report for this
  // change for that gap.
  const sections = [
    {
      title: 'HOW TO DELETE IN THE APP',
      steps: [
        'Open Sesh Wars and tap the Profile tab (bottom right).',
        'Open Settings and tap "Delete Account" under Account.',
        'Tap "Delete Account" above, then "Confirm" in the confirmation dialog.',
      ],
    },
    {
      title: 'REQUEST BY EMAIL',
      body: 'You can also request deletion by emailing taylor@yetiisland.studio. Include the email address associated with your account. Deletion requests are processed within 30 days.',
      email: 'taylor@yetiisland.studio',
    },
    {
      title: 'WHAT GETS DELETED',
      bullets: [
        'Your account and login credentials',
        'Your profile information (name, username, avatar)',
        'Spots you saved, and any custom lists you created',
        'Ratings and reviews you submitted',
        'Comments you posted',
        'Reports you filed on spots',
        'Clips you submitted',
      ],
    },
    {
      title: 'WHAT IS KEPT',
      body: 'Spots you contributed remain on the public map. The "added by" attribution is cleared from them, so they are no longer linked to your account.',
    },
  ]

  return (
    <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 14px', paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        {onClose ? (
          <div
            onClick={onClose}
            style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div style={{ width: 36 }} />
        )}
        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Delete Account
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Scrollable content */}
      <div className="scroll-area" style={{ padding: '24px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 60px)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Delete Your Sesh Wars Account
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
            Sesh Wars is developed by Yeti Island Studio LLC. You can delete your account at any time using either method below.
          </div>

          {onDeleteClick && (
            <button className="btn-salmon" onClick={onDeleteClick}>
              Delete Account
            </button>
          )}
          <div className="divider" />

          {sections.map((section, i) => (
            <div key={i} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {section.title}
              </div>
              {section.steps && (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {section.steps.map((step, j) => (
                    <li key={j} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 4 }}>{step}</li>
                  ))}
                </ol>
              )}
              {section.body && !section.email && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {section.body}
                </div>
              )}
              {section.email && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  You can also request deletion by emailing{' '}
                  <a href={`mailto:${section.email}`} style={{ color: '#d4785a', fontWeight: 700 }}>{section.email}</a>
                  {'. Include the email address associated with your account. Deletion requests are processed within 30 days.'}
                </div>
              )}
              {section.bullets && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {section.bullets.map((b, j) => (
                    <li key={j} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 4 }}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
