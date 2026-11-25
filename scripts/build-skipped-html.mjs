#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DSL_DIR = path.join(__dirname, 'import-output/dsl')
const OUT = path.join(__dirname, 'import-output/skipped-posts.html')

const dirs = readdirSync(DSL_DIR).filter(d => {
  try { return statSync(path.join(DSL_DIR, d)).isDirectory() } catch { return false }
})

const skipped = []
for (const shortcode of dirs) {
  const decPath = path.join(DSL_DIR, shortcode, 'decision.json')
  const infoPath = path.join(DSL_DIR, shortcode, 'info.json')
  if (!existsSync(decPath)) continue
  let dec, info
  try { dec = JSON.parse(readFileSync(decPath, 'utf8')) } catch { continue }
  if (dec.action === 'add') continue
  try { info = JSON.parse(readFileSync(infoPath, 'utf8')) } catch { info = {} }
  skipped.push({
    shortcode,
    skip_reason: dec.skip_reason || dec.action || 'unknown',
    matched_spot_id: dec.matched_spot_id || null,
    matched_spot_slug: dec.matched_spot_slug || null,
    matched_spot_title: dec.matched_spot_title || null,
    matched_distance_m: dec.matched_distance_m || null,
    caption: (info.caption || '').slice(0, 150),
    location_name: info.location_name || '',
    collected_at: info.collected_at || null,
    has_photo: existsSync(path.join(DSL_DIR, shortcode, 'photo-01.jpg')),
  })
}

function normalizeReason(s) {
  const r = s.skip_reason
  if (!r || r === 'skip') return '(no reason given)'
  if (/^Secondary (part|multi-part)/i.test(r) || /^Combined into/i.test(r) || /University of Denver Pt/i.test(r)) return 'Secondary multi-part post'
  if (/^No street address/i.test(r) || /No usable street address/i.test(r)) return 'No street address'
  if (/^Address is intersection only/i.test(r)) return 'Intersection-only address'
  if (/^DEAD SPOT/i.test(r) || /DEAD Spot/i.test(r) || /marked as 'DEAD/i.test(r)) return 'Dead spot'
  if (/^Post is a user comment/i.test(r)) return 'User comment post'
  if (/^Post is a tips\/advice/i.test(r)) return 'Tips/advice post (not a spot)'
  if (/^Post is.*promo/i.test(r) || /video submission/i.test(r) || /announcement/i.test(r)) return 'Promo/non-spot post'
  if (/already (in|exists in) sesh wars/i.test(r) || s.matched_spot_id) return 'Already in Sesh Wars (duplicate)'
  return 'Other'
}

const groups = {}
for (const s of skipped) {
  const g = normalizeReason(s)
  if (!groups[g]) groups[g] = []
  groups[g].push({ ...s, _normalizedReason: g })
}

const sortedGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
for (const [, items] of sortedGroups) {
  items.sort((a, b) => {
    const da = a.collected_at ? new Date(a.collected_at).getTime() : 0
    const db = b.collected_at ? new Date(b.collected_at).getTime() : 0
    return db - da
  })
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function groupId(g) { return g.replace(/[^a-z0-9]+/gi, '-').toLowerCase() }

const tocRows = sortedGroups.map(([g, items]) => {
  const id = groupId(g)
  return `<a href="#hdr-${id}"><span>${esc(g)}</span><span class="toc-n">${items.length}</span></a>`
}).join('\n')

const groupHtml = sortedGroups.map(([g, items]) => {
  const id = groupId(g)
  const rows = items.map(s => {
    const igUrl = `https://www.instagram.com/p/${s.shortcode}/`
    const postDate = s.collected_at
      ? new Date(s.collected_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : ''
    const caption120 = esc(s.caption.slice(0, 120))
    const thumbPath = `dsl/${s.shortcode}/photo-01.jpg`
    const thumbEl = s.has_photo
      ? `<img class="thumb" src="${thumbPath}" loading="lazy" onerror="this.style.display='none'">`
      : `<div class="thumb-missing">no photo</div>`
    let spotEl = ''
    if (s.matched_spot_slug) {
      const dist = s.matched_distance_m != null ? ` &middot; ${Math.round(s.matched_distance_m)}m` : ''
      const title = esc(s.matched_spot_title || s.matched_spot_slug) + dist
      spotEl = `<a href="https://seshwars.com/spots/${s.matched_spot_slug}" class="spot-link" target="_blank">&#8599; ${title}</a>`
    }
    return `<div class="post-row">
  ${thumbEl}
  <div class="post-info">
    <div class="post-top">
      <a href="${igUrl}" class="post-link" target="_blank">${s.shortcode}</a>
      ${postDate ? `<span class="post-date">${postDate}</span>` : ''}
    </div>
    <span class="post-reason">${esc(s.skip_reason.slice(0, 100))}</span>
    ${caption120 ? `<div class="post-caption">&ldquo;${caption120}&hellip;&rdquo;</div>` : ''}
    ${spotEl}
  </div>
</div>`
  }).join('\n')

  return `<div class="group-header" id="hdr-${id}" onclick="toggleGroup('${id}')">
  <span class="group-title">${esc(g)}</span>
  <span class="group-count">${items.length}</span>
</div>
<div class="group-body open" id="body-${id}">
${rows}
</div>`
}).join('\n')

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Skipped Posts &mdash; @denver_spot_locator</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e8e8e8;padding:24px;max-width:900px;margin:0 auto}
h1{font-size:1.4rem;font-weight:700;margin-bottom:4px}
.summary{color:#aaa;font-size:.88rem;margin-bottom:24px}
.toc{background:#1a1a1a;border:1px solid #2e2e2e;border-radius:8px;padding:12px 14px;margin-bottom:28px}
.toc-title{font-size:.78rem;color:#666;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em}
.toc a{display:flex;justify-content:space-between;padding:5px 0;color:#ccc;text-decoration:none;font-size:.88rem;border-bottom:1px solid #242424}
.toc a:last-child{border-bottom:none}
.toc a:hover{color:#fff}.toc-n{color:#777;font-size:.82rem}
.group-header{background:#1a1a1a;border:1px solid #2e2e2e;border-radius:7px;padding:11px 14px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none}
.group-header:hover{background:#222}
.group-title{font-size:.95rem;font-weight:600}
.group-count{background:#2a2a2a;color:#bbb;border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:600}
.group-body{display:none;margin-bottom:20px;padding:0 2px}
.group-body.open{display:block}
.post-row{display:grid;grid-template-columns:72px 1fr;gap:12px;padding:11px 0;border-bottom:1px solid #1a1a1a;align-items:start}
.post-row:last-child{border-bottom:none}
.thumb{width:72px;height:72px;object-fit:cover;border-radius:6px;background:#222}
.thumb-missing{width:72px;height:72px;border-radius:6px;background:#1e1e1e;display:flex;align-items:center;justify-content:center;color:#444;font-size:.68rem}
.post-info{display:flex;flex-direction:column;gap:4px}
.post-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.post-date{color:#666;font-size:.78rem}
.post-link{color:#5aaefc;text-decoration:none;font-size:.82rem;font-weight:600;font-family:monospace}
.post-link:hover{text-decoration:underline}
.post-reason{font-size:.78rem;color:#f5a84a;background:#271d09;border-radius:4px;padding:2px 7px;display:inline-block;line-height:1.5}
.post-caption{color:#888;font-size:.8rem;line-height:1.45;font-style:italic}
.spot-link{color:#4caf8a;font-size:.8rem;text-decoration:none}
.spot-link:hover{text-decoration:underline}
</style>
</head>
<body>
<h1>Skipped Posts &mdash; @denver_spot_locator</h1>
<div class="summary">${skipped.length} posts skipped &middot; ${sortedGroups.length} reason groups</div>
<div class="toc">
<div class="toc-title">Jump to group</div>
${tocRows}
</div>
${groupHtml}
<script>
function toggleGroup(id) {
  document.getElementById('body-'+id).classList.toggle('open');
}
</script>
</body></html>`

writeFileSync(OUT, html)
console.log(`Written ${OUT} (${Math.round(html.length/1024)}KB, ${skipped.length} posts)`)
