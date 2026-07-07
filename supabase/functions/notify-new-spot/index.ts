import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TO = 'taylor@yetiisland.studio'
const FROM = 'Seshwars <onboarding@resend.dev>'

async function getUsername(userId: string): Promise<string> {
  if (!userId) return 'Anonymous'
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const { data } = await sb.from('profiles').select('username').eq('id', userId).maybeSingle()
    return data?.username || userId
  } catch {
    return userId
  }
}

serve(async (req) => {
  try {
    const body = await req.json()

    if (!body.record) {
      return new Response('No record in payload', { status: 400 })
    }

    // Handle user-submitted content reports (Nudity / Gore)
    if (body.report_alert === true) {
      const spot = body.record
      const reportType = body.report_type as string
      const spotUrl = `https://seshwars.com/#/spots/${spot.slug || spot.id}`
      const coverPhoto = Array.isArray(spot.photos) && spot.photos.length > 0 ? spot.photos[0] : null
      const addedBy = await getUsername(spot.added_by)

      const reportHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#FDF8F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #EAD8C8;overflow:hidden;">
    <div style="background:#c0453a;padding:20px 24px;">
      <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">Seshwars</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:4px;font-weight:600;">🚨 User-reported inappropriate content</div>
    </div>
    <div style="background:#fde8e8;border-bottom:3px solid #c0453a;padding:14px 24px;">
      <div style="font-size:13px;font-weight:700;color:#7a1a1a;margin-bottom:4px;">🚨 User reported: ${reportType}</div>
      <div style="font-size:12px;color:#7a1a1a;line-height:1.5;">A user flagged this spot for <strong>${reportType.toLowerCase()}</strong>. Review the spot and take action if needed.</div>
    </div>
    ${coverPhoto ? `<div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:#f0ebe3;"><img src="${coverPhoto}" alt="${spot.title}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>` : ''}
    <div style="padding:24px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#c0453a;text-transform:uppercase;letter-spacing:1px;">Reported spot</p>
      <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#2a1e14;line-height:1.2;">${spot.title}</h1>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;width:110px;">Report Type</td>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:12px;font-weight:700;color:#c0453a;">${reportType}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;">Spot Type</td>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:12px;font-weight:700;color:#2a1e14;">${spot.type || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;">Added by</td>
          <td style="padding:8px 0;font-size:12px;font-weight:700;color:#2a1e14;">${addedBy}</td>
        </tr>
      </table>
      <a href="${spotUrl}" style="display:block;text-align:center;background:#c0453a;color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:14px 24px;border-radius:8px;margin-bottom:16px;">Review Spot →</a>
      <p style="margin:0;font-size:11px;color:#9a8878;text-align:center;line-height:1.5;">Open the spot to edit, remove photos, or delete it if the report is valid.</p>
    </div>
  </div>
</body>
</html>`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [TO], subject: `🚨 User Report: ${reportType} — ${spot.title}`, html: reportHtml }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('Resend error:', err)
        return new Response(`Resend error: ${err}`, { status: 500 })
      }
      return new Response('OK', { status: 200 })
    }

    const spot = body.record
    const addedBy = await getUsername(spot.added_by)

    const spotUrl = `https://seshwars.com/#/spots/${spot.slug || spot.id}`
    const coverPhoto = Array.isArray(spot.photos) && spot.photos.length > 0 ? spot.photos[0] : null
    const features = Array.isArray(spot.features) && spot.features.length > 0
      ? spot.features.join(', ')
      : '—'
    const isPending = spot.moderation_status === 'pending'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#FDF8F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #EAD8C8;overflow:hidden;">

    <!-- Header -->
    <div style="background:${isPending ? '#c07820' : '#d4785a'};padding:20px 24px;">
      <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">Seshwars</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:4px;font-weight:600;">${isPending ? '⚠️ Content flagged for review' : 'New spot notification'}</div>
    </div>

    ${isPending ? `
    <!-- Moderation warning banner -->
    <div style="background:#fff3cd;border-bottom:3px solid #e6a817;padding:14px 24px;">
      <div style="font-size:13px;font-weight:700;color:#856404;margin-bottom:4px;">⚠️ Auto-flagged by content moderation</div>
      <div style="font-size:12px;color:#856404;line-height:1.5;">
        This spot was automatically flagged for potential nudity or gore. It is <strong>not visible to the public</strong> until you approve it. Review the cover photo and approve or reject from the spot page.
      </div>
    </div>
    ` : ''}

    <!-- Cover photo -->
    ${coverPhoto ? `
    <div style="width:100%;aspect-ratio:16/9;overflow:hidden;background:#f0ebe3;">
      <img src="${coverPhoto}" alt="${spot.title}" style="width:100%;height:100%;object-fit:cover;display:block;" />
    </div>
    ` : ''}

    <!-- Body -->
    <div style="padding:24px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:${isPending ? '#c07820' : '#9a8878'};text-transform:uppercase;letter-spacing:1px;">${isPending ? 'Flagged spot — pending your review' : 'A new spot was just dropped on Seshwars'}</p>

      <h1 style="margin:0 0 16px;font-size:26px;font-weight:900;color:#2a1e14;line-height:1.2;">${spot.title}</h1>

      <!-- Meta row -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;width:110px;">Type</td>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:12px;font-weight:700;color:#2a1e14;">${spot.type || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;">Bust Rating</td>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:12px;font-weight:700;color:#2a1e14;">${spot.bust_rating || '—'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;">Features</td>
          <td style="padding:8px 0;border-bottom:1px solid #EAD8C8;font-size:12px;color:#2a1e14;">${features}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;">Added by</td>
          <td style="padding:8px 0;font-size:12px;font-weight:700;color:#2a1e14;">${addedBy}</td>
        </tr>
      </table>

      <!-- Description -->
      ${spot.description ? `
      <p style="margin:0 0 24px;font-size:13px;color:#5a4a3a;line-height:1.6;">${spot.description}</p>
      ` : ''}

      <!-- CTA button -->
      <a href="${spotUrl}" style="display:block;text-align:center;background:${isPending ? '#c07820' : '#d4785a'};color:#fff;text-decoration:none;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:14px 24px;border-radius:8px;margin-bottom:16px;">
        ${isPending ? 'Review Spot →' : 'View Spot →'}
      </a>

      <p style="margin:0;font-size:11px;color:#9a8878;text-align:center;line-height:1.5;">
        ${isPending ? 'This spot is hidden from the public feed until you approve it.' : 'Spots are live instantly. Open the spot to edit or remove it if needed.'}
      </p>
    </div>

  </div>
</body>
</html>
`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: isPending ? `⚠️ FLAGGED - REVIEW NEEDED: ${spot.title}` : `New spot added: ${spot.title}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return new Response(`Resend error: ${err}`, { status: 500 })
    }

    return new Response('OK', { status: 200 })
  } catch (e) {
    console.error('Unexpected error:', e)
    return new Response(`Error: ${e.message}`, { status: 500 })
  }
})
