export default function PrivacyPolicy({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px 14px', paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
        background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
      }}>
        <div style={{ width: 36 }} />
        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
          Privacy Policy
        </div>
        <div
          onClick={onClose}
          style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            <line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="scroll-area" style={{ padding: '24px 20px', paddingBottom: 'calc(env(safe-area-inset-bottom) + 60px)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Sesh Wars
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
            Privacy Policy
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 24 }}>
            Effective June 12, 2026
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
            This Privacy Policy describes what data Sesh Wars collects, how it is used, and your choices regarding your information.
          </div>

          {[
            {
              n: '1',
              title: 'WHAT WE COLLECT',
              body: null,
              bullets: [
                'Full name (first and last)',
                'Email address',
                'Username',
                'Precise device location — only when you add a spot or use nearby features. We do not track your location in the background.',
                'User-uploaded content: photos, videos, and clip links you post to the app',
                'A unique user ID to identify your account',
              ],
            },
            {
              n: '2',
              title: 'HOW WE USE YOUR DATA',
              body: null,
              bullets: [
                'Solely to operate Sesh Wars — creating your account, displaying spots on the map, and showing your content.',
                'We do not use your data for advertising.',
                'We do not use analytics platforms that track your behavior.',
                'We do not sell, share, or trade your personal data.',
                'We do not perform cross-app or cross-site tracking.',
              ],
            },
            {
              n: '3',
              title: 'THIRD-PARTY SERVICES',
              body: 'The following services receive only the data necessary to perform their function:',
              bullets: [
                'Supabase — database and user authentication (supabase.com)',
                'Cloudinary — photo and media hosting (cloudinary.com)',
                'Sightengine — automated content moderation for uploaded images (sightengine.com)',
              ],
            },
            {
              n: '4',
              title: 'ACCOUNT DELETION',
              body: 'You can delete your account at any time using the Delete Account option on your profile page. Deleting your account removes your personal data from our systems. Spots you added may remain visible attributed to "Anonymous."',
            },
            {
              n: '5',
              title: 'CHILDREN',
              body: 'Sesh Wars is not intended for children under 13. We do not knowingly collect information from children under 13.',
            },
            {
              n: '6',
              title: 'CHANGES',
              body: 'We may update this Privacy Policy. Continued use of the app means you accept the updated policy.',
            },
            {
              n: '7',
              title: 'CONTACT',
              body: 'Contact taylor@yetiisland.studio regarding any questions about our Privacy Policy.',
            },
          ].map(section => (
            <div key={section.n} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                {section.n}. {section.title}
              </div>
              {section.body && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: section.bullets ? 6 : 0 }}>
                  {section.body}
                </div>
              )}
              {section.bullets && (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {section.bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 4 }}>{b}</li>
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
