import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const TO = 'taylor@yetiisland.studio'
const FROM = 'Seshwars <onboarding@resend.dev>'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { feedback, senderEmail, firstName, lastName, username } = await req.json()

    if (!feedback?.trim()) {
      return new Response('Missing feedback', { status: 400 })
    }

    const displayName = [firstName, lastName].filter(Boolean).join(' ') || username || senderEmail || 'Anonymous'
    const fromLine = username ? `@${username} — ${displayName}` : displayName
    const emailLine = senderEmail || '—'

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#FDF8F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #EAD8C8;overflow:hidden;">
    <div style="background:#d4785a;padding:20px 24px;">
      <div style="font-size:13px;font-weight:700;color:#fff;letter-spacing:1px;text-transform:uppercase;">Seshwars</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:4px;font-weight:600;">User Feedback</div>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:7px 0;border-bottom:1px solid #EAD8C8;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;width:80px;">From</td>
          <td style="padding:7px 0;border-bottom:1px solid #EAD8C8;font-size:13px;font-weight:700;color:#2a1e14;">${fromLine}</td>
        </tr>
        <tr>
          <td style="padding:7px 0;font-size:11px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:0.5px;">Email</td>
          <td style="padding:7px 0;font-size:13px;color:#2a1e14;">${emailLine}</td>
        </tr>
      </table>
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9a8878;text-transform:uppercase;letter-spacing:1px;">Message</p>
      <p style="margin:0;font-size:14px;color:#2a1e14;line-height:1.7;white-space:pre-wrap;">${feedback}</p>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: senderEmail || undefined,
        subject: `Seshwars Feedback from ${fromLine}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return new Response(`Resend error: ${err}`, { status: 500 })
    }

    return new Response('OK', { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('Unexpected error:', e)
    return new Response(`Error: ${e.message}`, { status: 500, headers: corsHeaders })
  }
})
