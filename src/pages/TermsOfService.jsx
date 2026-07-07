export default function TermsOfService({ onClose }) {
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
          Terms of Service
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
            Terms of Service
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 24 }}>
            Last updated: June 2026
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
            Welcome to Sesh Wars. By creating an account or using this app, you agree to these Terms.
          </div>

          {[
            {
              n: '1',
              title: 'ASSUMPTION OF RISK',
              body: 'Skateboarding is inherently dangerous and can result in serious injury or death. You skate entirely at your own risk. Sesh Wars does not inspect, supervise, endorse, or guarantee the safety, condition, or legality of any spot listed in the app.',
            },
            {
              n: '2',
              title: 'SPOT LISTINGS ARE INFORMATIONAL ONLY',
              body: 'Spots are submitted by users. A spot appearing in this app is NOT permission to skate there. Many spots may be on private property or in areas where skateboarding is restricted or prohibited. You are solely responsible for determining whether you have the legal right to skate any location, and for obeying all laws, posted signs, and instructions from property owners, security, or law enforcement.',
            },
            {
              n: '3',
              title: 'NO LIABILITY',
              body: 'To the fullest extent permitted by law, Sesh Wars and its creator are not liable for any injury, death, property damage, citation, fine, arrest, trespassing claim, or other loss arising from your use of the app or from skating any spot. You agree that you, not Sesh Wars, are responsible for your own actions.',
            },
            {
              n: '4',
              title: 'USER CONTENT',
              body: 'Spots, photos, videos, comments, and reviews are submitted by users. Sesh Wars is a platform and is not responsible for user-submitted content. You are responsible for content you post and must have the rights to post it. Do not post illegal, infringing, or harmful content.',
            },
            {
              n: '5',
              title: 'RESPECT PROPERTY',
              body: 'You agree not to intentionally damage property, and to leave respectfully if asked by an owner, security, or law enforcement. Spots may be removed at the request of property owners or authorities.',
            },
            {
              n: '6',
              title: 'INDEMNIFICATION',
              body: 'You agree to indemnify and hold harmless Sesh Wars and its creator from any claims, damages, or expenses arising from your use of the app, your conduct, or your violation of these Terms.',
            },
            {
              n: '7',
              title: 'CONTENT REMOVAL',
              body: 'We may remove any spot or content at our discretion, including at the request of property owners or authorities.',
            },
            {
              n: '8',
              title: 'CHANGES',
              body: 'We may update these Terms at any time. Continued use means you accept the updated Terms.',
            },
            {
              n: '9',
              title: 'CONTACT',
              body: 'Contact taylor@yetiisland.studio regarding any questions about our Terms of Service.',
            },
          ].map(section => (
            <div key={section.n} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                {section.n}. {section.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {section.body}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}
