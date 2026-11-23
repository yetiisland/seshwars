#!/usr/bin/env node
/**
 * Import street spots from @denver_spot_locator Instagram posts.
 *
 * Usage:
 *   node scripts/import-dsl.mjs --login
 *   node scripts/import-dsl.mjs --test <post-url> [--dry-run]
 *   node scripts/import-dsl.mjs --test <post-url> --update-spot <spot-id>
 *   node scripts/import-dsl.mjs --before <post-url> [--dry-run]
 *
 * Credentials:
 *   .env               → VITE_SUPABASE_URL, VITE_MAPBOX_TOKEN
 *   .env.import.local  → SUPABASE_SERVICE_ROLE_KEY
 *
 * Browser profile:  scripts/.ig-profile/          (gitignored, persists login)
 * Progress file:    scripts/import-output/dsl-progress.json
 * Cover previews:   scripts/import-output/<slug>-cover.jpg
 */

import { chromium as _chromiumBase } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
_chromiumBase.use(StealthPlugin())
const chromium = _chromiumBase
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function loadEnvFile(filePath) {
  try {
    return Object.fromEntries(
      readFileSync(filePath, 'utf8')
        .split('\n')
        .filter(l => l.includes('=') && !l.startsWith('#'))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
    )
  } catch { return {} }
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.import.local') }
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const MAPBOX_TOKEN = env.VITE_MAPBOX_TOKEN

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !MAPBOX_TOKEN) {
  console.error('Missing required env vars (VITE_SUPABASE_URL, VITE_MAPBOX_TOKEN from .env; SUPABASE_SERVICE_ROLE_KEY from .env.import.local).')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const PROFILE_DIR   = path.resolve(__dirname, '.ig-profile')
const OUTPUT_DIR    = path.resolve(__dirname, 'import-output')
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'dsl-progress.json')
// Cookie cache: bypasses macOS Keychain cross-session encryption issues
const COOKIE_FILE   = path.join(PROFILE_DIR, 'ig-cookies.json')

const DSL_DIR = path.join(OUTPUT_DIR, 'dsl')

mkdirSync(OUTPUT_DIR,  { recursive: true })
mkdirSync(PROFILE_DIR, { recursive: true })
mkdirSync(DSL_DIR,     { recursive: true })

// Module-level context reference so login-recovery helpers can reach it
// from anywhere without threading it through every call.
let _context = null

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const testIdx        = args.indexOf('--test');        const testUrl       = testIdx        !== -1 ? args[testIdx        + 1] : null
const beforeIdx      = args.indexOf('--before');      const beforeUrl     = beforeIdx      !== -1 ? args[beforeIdx      + 1] : null
const updateSpotIdx  = args.indexOf('--update-spot'); const updateSpotId  = updateSpotIdx  !== -1 ? args[updateSpotIdx  + 1] : null
const limitIdx       = args.indexOf('--limit');       const limitArg      = limitIdx       !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity
const dryRun    = args.includes('--dry-run')
const doLogin   = args.includes('--login')
const doBrowser = args.includes('--browser')
const collectNextIdx = args.indexOf('--collect-next')
const collectNextN = collectNextIdx !== -1 ? parseInt(args[collectNextIdx + 1], 10) : 0
const doCollectNext = collectNextN > 0
const doUploadReady = args.includes('--upload-ready')

if (!testUrl && !beforeUrl && !doLogin && !doBrowser && !doCollectNext && !doUploadReady) {
  console.error('Usage:')
  console.error('  node scripts/import-dsl.mjs --browser                      (start persistent window)')
  console.error('  node scripts/import-dsl.mjs --login                        (wait for login in running window)')
  console.error('  node scripts/import-dsl.mjs --collect-next <n>             (download next N posts to disk)')
  console.error('  node scripts/import-dsl.mjs --upload-ready                 (upload posts with decision.json)')
  console.error('  node scripts/import-dsl.mjs --test <post-url> [--dry-run]')
  console.error('  node scripts/import-dsl.mjs --test <post-url> --update-spot <spot-id>')
  console.error('  node scripts/import-dsl.mjs --before <post-url> [--limit <n>] [--dry-run]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Shared utilities (mirrors import-speakeasy.mjs)
// ---------------------------------------------------------------------------
function slugify(title, suffix = '') {
  const base = title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return suffix ? `${base}-${suffix}` : base
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)) }

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Features from src/lib/spotFields.js (all options, Street type shows all including Hill Bomb)
const ALL_FEATURES = [
  'Stairs','Hubba','Ledges','Banks','Gap','Manual Pad','Curb','Wall Ride',
  'Hand Rail','Rail','Bump','Hip','Ride On Grind','Pole Jam','Bowl',
  'Halfpipe','Step Up','Barrier','Hill Bomb',
]

// Order matters: check Hand Rail before Rail to avoid double-matching
const FEATURE_MAP = [
  ['Hand Rail', [/\bhand[-\s]*rails?\b/i, /\bhandrails?\b/i]],
  ['Rail',       [/\brails?\b/i]],
  ['Stairs',     [/\bstairs\b/i, /\bsteps\b/i, /\bstair\b/i]],
  ['Hubba',      [/\bhubbas?\b/i]],
  ['Ledges',     [/\bledges?\b/i]],
  ['Banks',      [/\bbanks?\b/i, /\bbanking\b/i, /\bbank\b/i]],
  ['Gap',        [/\bgaps?\b/i]],
  ['Manual Pad', [/\bmanual\s+pads?\b/i, /\bmanny\s+pads?\b/i, /\bmanuals?\b/i, /\bmanny\b/i]],
  ['Curb',       [/\bcurbs?\b/i]],
  ['Wall Ride',  [/\bwall[-\s]*rides?\b/i, /\bwallrides?\b/i]],
  ['Bump',       [/\bbumps?\b/i, /\bbump[-\s]to\b/i]],
  ['Hip',        [/\bhips?\b/i]],
  ['Ride On Grind', [/\bride[-\s]*on[-\s]*grind\b/i, /\bROG\b/, /\bride[-\s]*on\b/i]],
  ['Pole Jam',   [/\bpole[-\s]*jams?\b/i]],
  ['Bowl',       [/\bbowls?\b/i]],
  ['Halfpipe',   [/\bhalfpipes?\b/i, /\bhalf[-\s]pipes?\b/i]],
  ['Step Up',    [/\bstep[-\s]*ups?\b/i]],
  ['Barrier',    [/\bbarriers?\b/i, /\bjersey[-\s]*barriers?\b/i]],
  ['Hill Bomb',  [/\bhill[-\s]*bomb(?:ing|ed)?\b/i, /\bhillbombs?\b/i]],
]

function extractFeatures(caption) {
  const features = [], triggers = {}
  for (const [feat, pats] of FEATURE_MAP) {
    for (const pat of pats) {
      const m = caption.match(pat)
      if (m) { features.push(feat); triggers[feat] = m[0]; break }
    }
  }
  return { features, triggers }
}

// Generate title: strip emojis/hashtags/@ → first line → truncate 40 chars → Title Case
function generateTitle(caption) {
  let clean = caption
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, ' ')
    .replace(/#\w+/g, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[-–—]+/g, ' ')
  // Split on \n OR multiple spaces (Instagram uses both as paragraph separators)
  // Do NOT collapse \s{2,} before splitting or we lose the paragraph boundary
  let title = clean.split(/\n|\s{2,}/)[0].replace(/\s+/g, ' ').trim()
  if (title.length > 40) title = title.slice(0, 40).replace(/\s+\S*$/, '').trim()
  title = title.split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return title || 'Street Spot'
}

// Extract street address or intersection from caption
function extractAddress(caption) {
  // Pattern 1: numbered street address  e.g. "1550 Lincoln St" / "1200 W Colfax Ave"
  const numMatch = caption.match(
    /\b(\d+\s+(?:[NSEW]\.?\s+)?[A-Za-z][\w\s]{1,30}?(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Way|Rd|Road|Ln|Lane|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway)\.?)\b/i
  )
  if (numMatch) return numMatch[1].replace(/\s{2,}/g, ' ').trim()

  // Pattern 2: intersection with & or "/"  e.g. "Colfax & Broadway" / "16th & Glenarm"
  const ampMatch = caption.match(
    /\b([A-Za-z0-9][\w\s]{1,25}?(?:St\.?|Ave\.?|Blvd\.?|Dr\.?|Way\.?|Rd\.?)?)\s*[&\/]\s*([A-Za-z0-9][\w\s]{1,25}?(?:St\.?|Ave\.?|Blvd\.?|Dr\.?|Way\.?|Rd\.?)?)\b/
  )
  if (ampMatch) {
    const a = ampMatch[1].trim(), b = ampMatch[2].trim()
    if (a.length > 2 && b.length > 2 && a.length < 40 && b.length < 40) {
      return `${a} & ${b}`
    }
  }

  // Pattern 3: "corner of X and Y" / "between X and Y"
  const cornerMatch = caption.match(
    /(?:corner\s+of|between)\s+([A-Za-z0-9][\w\s]{1,25}?)\s+and\s+([A-Za-z0-9][\w\s]{1,25}?)(?=[,.\n!]|$)/i
  )
  if (cornerMatch) {
    const a = cornerMatch[1].trim(), b = cornerMatch[2].trim()
    if (a.length > 2 && b.length > 2) return `${a} & ${b}`
  }

  return null
}

// Mapbox forward geocoding — returns null if result is not address/poi level
async function geocodeAddress(rawAddress) {
  // Append Denver Colorado hint for intersections (no street number = more ambiguous)
  // Skip if address already specifies a city/state
  const hasNumber = /^\d/.test(rawAddress)
  const hasCity = /\b(boulder|aurora|lakewood|englewood|arvada|westminster|thornton|broomfield|golden|fort collins|greeley|pueblo|colorado springs|northglenn|centennial|highlands ranch|parker|commerce city|longmont|loveland)\b/i.test(rawAddress)
  const query = (hasNumber || hasCity) ? rawAddress : `${rawAddress}, Denver, Colorado`
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&country=US` +
    `&bbox=-109.1,36.9,-102.1,41.0` +
    `&types=address,poi` +
    `&proximity=-104.9847,39.7392` +
    `&limit=1`
  try {
    const res = await fetch(url)
    const json = await res.json()
    const feat = json.features?.[0]
    if (!feat) return null
    const pt = feat.place_type || []
    if (!pt.some(t => ['address','poi'].includes(t))) return null
    const [lng, lat] = feat.center
    return { lat, lng, address: feat.place_name }
  } catch { return null }
}

// ---------------------------------------------------------------------------
// Photo utilities (mirrors import-speakeasy.mjs, no bar-crop for Instagram)
// ---------------------------------------------------------------------------
async function pHash(buf) {
  const { data } = await sharp(buf).resize(9, 8, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const bits = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(data[y * 9 + x] > data[y * 9 + x + 1])
  return bits
}
function hammingDistance(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d }
async function deduplicateBuffers(bufs) {
  const hashes = await Promise.all(bufs.map(b => pHash(b)))
  const kept = []
  for (let i = 0; i < hashes.length; i++) if (!kept.some(j => hammingDistance(hashes[i], hashes[j]) < 10)) kept.push(i)
  return kept
}
async function compressImage(buf) {
  return sharp(buf).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()
}
function storagePathFromUrl(url) { const i = url.indexOf('/spot-photos/'); return i === -1 ? null : url.slice(i + '/spot-photos/'.length) }

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// Extract a complete JSON object/array from text starting at startIdx.
// Handles nested structures and strings with escaped characters.
function extractJsonObject(text, startIdx) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (inString) {
      if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) return text.slice(startIdx, i + 1)
    }
  }
  return null
}

async function uploadPhotos(admin, bufs) {
  const urls = [], paths = []
  for (let i = 0; i < bufs.length; i++) {
    const p = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    const { error } = await admin.storage.from('spot-photos').upload(p, bufs[i], { contentType: 'image/jpeg' })
    if (error) {
      if (paths.length) await admin.storage.from('spot-photos').remove(paths).catch(() => {})
      throw new Error(`Photo [${i + 1}] upload failed: ${error.message}`)
    }
    paths.push(p)
    urls.push(admin.storage.from('spot-photos').getPublicUrl(p).data.publicUrl)
  }
  return urls
}

async function verifyPhotos(urls) {
  for (const url of urls) {
    try { const r = await fetch(url, { method: 'HEAD' }); process.stdout.write(r.ok ? '✓' : `✗(${r.status})`) }
    catch { process.stdout.write('✗(err)') }
  }
  console.log()
}

// ---------------------------------------------------------------------------
// Progress file
// ---------------------------------------------------------------------------
function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { processed: [], failed: [] }
  try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) } catch { return { processed: [], failed: [] } }
}
function saveProgress(p) {
  writeFileSync(PROGRESS_FILE, JSON.stringify({ ...p, lastUpdated: new Date().toISOString() }, null, 2))
}

// ---------------------------------------------------------------------------
// Instagram: login helpers
// ---------------------------------------------------------------------------

// Return true if the current page URL signals a login/challenge wall.
function isLoginPage(url) {
  return url.includes('accounts/login') || url.includes('/challenge')
}

// Wait indefinitely (3s poll) for a sessionid cookie to appear in the context.
// Never navigates — the user logs in manually in the Chromium window.
async function waitForLoginNoLimit() {
  console.log('  Login needed in the Chromium window — log in and complete any 2FA.')
  console.log('  Waiting with no time limit...')
  while (true) {
    const cookies = await _context.cookies('https://www.instagram.com')
    if (cookies.some(c => c.name === 'sessionid' && c.value)) {
      console.log('  Logged in — continuing.')
      try { writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2)) } catch {}
      await sleep(1500)
      return
    }
    await sleep(3000)
  }
}

async function ensureLoggedIn(page) {
  console.log('  Checking Instagram login status...')

  // Check cookies that are already in the connected browser context first.
  // With CDP connection the browser's live cookies are already accessible.
  let cookies = await _context.cookies('https://www.instagram.com')
  if (cookies.some(c => c.name === 'sessionid' && c.value)) {
    console.log('  Already logged in.')
    return
  }

  // Navigate to homepage so the browser loads any cookies from disk into memory,
  // then re-check. Do not navigate away from whatever Instagram page is current.
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await sleep(2000)

  cookies = await _context.cookies('https://www.instagram.com')
  if (cookies.some(c => c.name === 'sessionid' && c.value)) {
    console.log('  Logged in.')
    return
  }

  // Not logged in — wait indefinitely without touching the page.
  await waitForLoginNoLimit()
}

// ---------------------------------------------------------------------------
// Instagram: scrape one post page
// ---------------------------------------------------------------------------
async function scrapePost(page, url) {
  const shortcode = url.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? ''
  const result = { caption: '', locationName: null, images: [], videoCount: 0, slideCount: 0, blocked: false }

  // Intercept responses. Instagram embeds full post data in the main HTML page
  // as a __bbox JSON block (new Polaris format). JSON API responses are also
  // captured as a fallback for older-format posts.
  let apiMedia = null
  const onResponse = async (response) => {
    if (apiMedia) return
    const rurl = response.url()
    if (!rurl.includes('instagram.com') && !rurl.includes('graph.instagram.com')) return
    const ct = response.headers()['content-type'] ?? ''

    // JSON/JS API responses (old GraphQL / private API shape)
    if (ct.includes('json') || ct.includes('javascript')) {
      try {
        const json = await response.json()
        const m =
          json?.data?.shortcode_media     ??
          json?.data?.xdt_shortcode_media ??
          json?.data?.media               ??
          json?.items?.[0]
        if (m && (m.display_url || m.edge_sidecar_to_children || m.carousel_media || m.media_type !== undefined)) {
          apiMedia = m
        }
      } catch {}
      return
    }

    // Main post page HTML — extract xig_polaris_media from embedded __bbox JSON.
    // Instagram embeds the full media object (carousel_media, image_versions2, caption)
    // in the page HTML rather than via a separate API call.
    if (ct.includes('text/html') && shortcode && rurl.includes(`/p/${shortcode}`)) {
      try {
        const html = await response.text()
        const polarisKey = '"xig_polaris_media":'
        let searchFrom = 0
        while (!apiMedia) {
          const idx = html.indexOf(polarisKey, searchFrom)
          if (idx === -1) break
          const objStart = html.indexOf('{', idx + polarisKey.length)
          if (objStart === -1) break
          const objStr = extractJsonObject(html, objStart)
          if (!objStr) { searchFrom = objStart + 1; continue }
          let raw
          try { raw = JSON.parse(objStr) } catch { searchFrom = objStart + 1; continue }
          // Polaris wraps media in if_not_gated_logged_out for logged-in users
          const inner = raw.if_not_gated_logged_out ?? raw
          const carousel_media   = inner.carousel_media ?? null
          const image_versions2  = inner.image_versions2 ?? raw.image_versions2 ?? null
          const display_url      = inner.display_uri ?? raw.display_uri ?? null
          const captionText      = inner.caption?.text ?? raw.caption?.text ?? ''
          const location         = inner.location ?? raw.location ?? null
          if (carousel_media || image_versions2 || display_url) {
            apiMedia = { carousel_media, image_versions2, display_url, caption: { text: captionText }, location }
          }
          break
        }
      } catch {}
    }
  }

  page.on('response', onResponse)
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  } catch {}
  // If Instagram redirected to login/challenge, wait for the user to log in
  // then reload the target page — do NOT close the browser.
  if (isLoginPage(page.url())) {
    page.off('response', onResponse)
    await waitForLoginNoLimit()
    page.on('response', onResponse)
    try { await page.goto(url, { waitUntil: 'load', timeout: 60000 }) } catch {}
  }
  // Wait for CDN images, then give extra time for lazy API calls to settle
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('img')].some(img =>
        (img.src.includes('cdninstagram.com') || img.src.includes('fbcdn.net')) && img.naturalWidth > 400
      ),
      { timeout: 10000 }
    )
  } catch {}
  await sleep(3000)
  page.off('response', onResponse)

  // Embedded JSON scan: legacy window._sharedData and __additionalDataLoaded
  if (!apiMedia) {
    try {
      apiMedia = await page.evaluate(() => {
        // Legacy window._sharedData
        try {
          const leg = window._sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media
          if (leg?.display_url) return leg
        } catch {}
        // window.__additionalDataLoaded keyed by URL path
        try {
          if (window.__additionalDataLoaded) {
            for (const v of Object.values(window.__additionalDataLoaded)) {
              const m = v?.graphql?.shortcode_media ?? v?.media
              if (m?.display_url || m?.carousel_media || m?.edge_sidecar_to_children) return m
            }
          }
        } catch {}
        // Walk every <script type="application/json"> looking for a media object
        const isMedia = o => o && typeof o === 'object' && o.shortcode &&
          (o.display_url || o.carousel_media || o.edge_sidecar_to_children || o.image_versions2)
        const walk = (obj, depth = 0) => {
          if (!obj || typeof obj !== 'object' || depth > 12) return null
          if (isMedia(obj)) return obj
          for (const v of (Array.isArray(obj) ? obj : Object.values(obj))) {
            const r = walk(v, depth + 1)
            if (r) return r
          }
          return null
        }
        for (const el of document.querySelectorAll('script[type="application/json"]')) {
          try { const r = walk(JSON.parse(el.textContent)); if (r) return r } catch {}
        }
        return null
      })
    } catch {}
  }

  // Detect block / challenge
  const curUrl = page.url()
  const title  = await page.title()
  if (curUrl.includes('challenge') || /try again later|sorry/i.test(title)) {
    result.blocked = true
    return result
  }

  // ── API path ──
  if (apiMedia) {
    result.caption      = apiMedia.edge_media_to_caption?.edges?.[0]?.node?.text ?? apiMedia.caption?.text ?? apiMedia.caption ?? ''
    result.locationName = apiMedia.location?.name ?? null

    // Pick highest-resolution URL from a media node (old GraphQL or new Polaris shape)
    const bestUrl = node => {
      const candidates =
        node.display_resources                    ??  // { src, config_width }
        node.image_versions2?.candidates          ??  // { url, width }
        []
      if (candidates.length) {
        const sorted = [...candidates].sort((a, b) =>
          (b.config_width ?? b.width ?? 0) - (a.config_width ?? a.width ?? 0)
        )
        return sorted[0].src ?? sorted[0].url ?? null
      }
      return node.display_url ?? node.display_uri ?? null
    }
    const isVideo = node =>
      node.is_video || node.__typename === 'GraphVideo' ||
      node.__typename === 'XIGPolarisVideoMedia' ||
      node.media_type === 2 || !!node.video_url

    // Carousels: edge_sidecar_to_children (old GraphQL) or carousel_media (new Polaris API)
    const slides =
      apiMedia.edge_sidecar_to_children?.edges?.map(e => e.node) ??
      apiMedia.carousel_media ??
      null

    if (slides) {
      result.slideCount = slides.length
      for (const node of slides) {
        if (isVideo(node)) { result.videoCount++; continue }
        const u = bestUrl(node)
        if (u) result.images.push(u)
      }
    } else if (isVideo(apiMedia)) {
      result.slideCount = 1; result.videoCount++
    } else {
      result.slideCount = 1
      const u = bestUrl(apiMedia)
      if (u) result.images.push(u)
    }
    console.log(`    API data captured — ${result.slideCount} slides (${result.images.length} images, ${result.videoCount} videos)`)
    return result
  }

  // ── DOM fallback ──
  console.log('    API data not captured — using DOM fallback')

  // Caption: Instagram no longer wraps posts in <article>; use broad selectors.
  for (const sel of [
    'h1[dir="auto"]',
    'div[dir="auto"] > h1',
    'h1',
    'span._ap3a[dir="auto"]',
    'span[dir="auto"]',
  ]) {
    const els = await page.$$(sel)
    for (const el of els) {
      const t = ((await el.evaluate(n =>
        n.innerHTML
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      )) || '').trim()
      if (t.length > 20 && t.length > result.caption.length) result.caption = t
    }
  }

  // Strip "username timestamp" prefix that DOM textContent merges before the real caption
  result.caption = result.caption
    .replace(/^@?[a-z0-9_.]+\s+\d+[wdhmy]o?\s*/i, '')
    .trim()

  // Location tag link
  const locLink = await page.$('a[href*="/explore/locations/"]')
  if (locLink) result.locationName = (await locLink.textContent() || '').trim()

  // Images — navigate carousel by clicking Next
  const carousel = await scrapeCarouselImages(page)
  result.images     = carousel.images
  result.videoCount = carousel.videoCount
  result.slideCount = carousel.slideCount

  return result
}

// Navigate carousel by clicking Next. Anchors detection to the Next button's
// parent container so we find the main post carousel, not suggested-post images
// that happen to be near the viewport center.
async function scrapeCarouselImages(page) {
  const images = [], seen = new Set()
  let videoCount = 0, slideCount = 0

  const getActiveSlide = () => page.evaluate(() => {
    const CDN = ['cdninstagram.com', 'fbcdn.net']
    const isCDN = src => CDN.some(d => src.includes(d))

    const getBestUrl = img => {
      const srcset = img.getAttribute('srcset') ?? ''
      let topUrl = img.src, topW = img.naturalWidth
      for (const part of srcset.split(',')) {
        const sp = part.trim().lastIndexOf(' ')
        if (sp === -1) continue
        const u = part.trim().slice(0, sp).trim()
        const w = parseInt(part.trim().slice(sp + 1)) || 0
        if (w > topW) { topUrl = u; topW = w }
      }
      return topUrl
    }

    // Anchor to the Next button's container so we find the main post carousel,
    // not suggested posts or other images that happen to be near viewport center.
    const nextBtn = document.querySelector('button[aria-label*="Next"], button[aria-label*="next"]')
    if (nextBtn) {
      let container = nextBtn.parentElement
      for (let d = 0; d < 15 && container; d++) {
        const cdnImgs = [...container.querySelectorAll('img')]
          .filter(img => isCDN(img.src) && img.naturalWidth > 400)
        if (cdnImgs.length >= 2) {
          // Carousel container found. Pick leftmost visible image (active slide).
          let best = null, bestLeft = Infinity
          for (const img of cdnImgs) {
            const rect = img.getBoundingClientRect()
            if (rect.width < 100 || rect.left < -50) continue
            if (rect.left < bestLeft) {
              bestLeft = rect.left
              best = { isVideo: false, url: getBestUrl(img), cx: rect.left + rect.width / 2 }
            }
          }
          if (best) return best
          // Video slide: look for a video element in the container
          const vid = [...container.querySelectorAll('video')]
            .find(v => { const r = v.getBoundingClientRect(); return r.width > 100 && r.left >= -50 })
          if (vid) {
            const r = vid.getBoundingClientRect()
            return { isVideo: true, url: null, cx: r.left + r.width / 2 }
          }
          break
        }
        container = container.parentElement
      }
    }

    // Fallback: pick topmost, leftmost visible CDN image (single-image post or no Next button)
    let best = null, bestScore = Infinity
    for (const img of document.querySelectorAll('img')) {
      if (!isCDN(img.src) || img.naturalWidth <= 400) continue
      const rect = img.getBoundingClientRect()
      if (rect.width < 100 || rect.left < -50 || rect.top < 0) continue
      const score = rect.top * 10000 + rect.left
      if (score < bestScore) {
        bestScore = score
        best = { isVideo: false, url: getBestUrl(img), cx: rect.left + rect.width / 2 }
      }
    }
    return best
  })

  for (let slide = 0; slide < 20; slide++) {
    const active = await getActiveSlide()
    if (!active) break
    slideCount++

    if (active.isVideo) {
      videoCount++
    } else if (active.url && !seen.has(active.url)) {
      seen.add(active.url)
      images.push(active.url)
    }

    const nextBtn = await page.$('button[aria-label*="Next"], button[aria-label*="next"]')
    if (!nextBtn) break

    try { await nextBtn.click({ force: true }) }
    catch { await page.evaluate(btn => btn.click(), nextBtn) }

    await sleep(1000)  // Wait for carousel animation to complete
  }

  console.log(`    DOM carousel — ${slideCount} slides (${images.length} images, ${videoCount} videos)`)
  return { images, videoCount, slideCount }
}

// ---------------------------------------------------------------------------
// Update an existing spot by appending new photos from a post
// ---------------------------------------------------------------------------
async function updateSpotPhotos({ spotId, postUrl, page, admin }) {
  console.log(`\nUpdating spot ${spotId}...`)

  // Fetch existing spot
  const { data: spot, error: fetchErr } = await admin.from('spots').select('photos, title').eq('id', spotId).single()
  if (fetchErr || !spot) throw new Error(`Could not fetch spot ${spotId}: ${fetchErr?.message}`)
  const existingPhotos = spot.photos ?? []
  console.log(`  Spot: "${spot.title}"`)
  console.log(`  Existing photos: ${existingPhotos.length}`)

  // Scrape post
  const post = await scrapePost(page, postUrl)
  if (post.blocked) throw new Error('Instagram challenge/block detected')
  console.log(`  Scraped: ${post.slideCount} slides → ${post.images.length} images, ${post.videoCount} videos skipped`)

  if (post.images.length === 0) throw new Error('No images found in post')

  // Download all post images
  console.log(`  Downloading ${post.images.length} image(s)...`)
  const postBufs = []
  for (let i = 0; i < post.images.length; i++) {
    try { postBufs.push(await fetchBinary(post.images[i])) }
    catch (e) { console.log(`    image [${i + 1}] SKIPPED: ${e.message}`) }
  }
  if (!postBufs.length) throw new Error('All image downloads failed')

  // Download existing Supabase photos for pHash dedup comparison
  console.log(`  Downloading ${existingPhotos.length} existing photo(s) for dedup...`)
  const existingBufs = []
  for (const url of existingPhotos) {
    try { existingBufs.push(await fetchBinary(url)) }
    catch { existingBufs.push(null) }
  }

  // Find genuinely new images (pHash distance > 10 from all existing)
  const existingHashes = await Promise.all(existingBufs.map(b => b ? pHash(b) : null))
  const newBufs = []
  for (const buf of postBufs) {
    const h = await pHash(buf)
    if (!existingHashes.some(eh => eh && hammingDistance(h, eh) < 10)) {
      newBufs.push(buf)
    }
  }
  console.log(`  New unique images: ${newBufs.length} (${postBufs.length - newBufs.length} already exist)`)

  if (newBufs.length === 0) {
    console.log('  No new photos to add.')
    return
  }

  // Compress and upload
  const compressed = await Promise.all(newBufs.map(b => compressImage(b)))
  const newUrls = await uploadPhotos(admin, compressed)

  // Update spot: existing photos stay as-is (index 0 = cover), new photos appended
  const updatedPhotos = [...existingPhotos, ...newUrls]
  const { error: updateErr } = await admin.from('spots').update({ photos: updatedPhotos }).eq('id', spotId)
  if (updateErr) {
    await admin.storage.from('spot-photos').remove(newUrls.map(storagePathFromUrl).filter(Boolean)).catch(() => {})
    throw new Error(`Update failed: ${updateErr.message}`)
  }

  console.log(`  Updated: ${updatedPhotos.length} total photos (${newUrls.length} new)`)
  process.stdout.write('  Verify: ')
  await verifyPhotos(updatedPhotos)
  console.log('  ✓ Done')
}

// ---------------------------------------------------------------------------
// Import one post end-to-end
// ---------------------------------------------------------------------------
async function importPost({ postUrl, page, admin, userId, existingSpots, opts = {} }) {
  const { dryRun = false } = opts
  const result = {
    url: postUrl, action: null, spotId: null,
    title: null, address: null, lat: null, lng: null,
    features: [], featureTriggers: {},
    photoCount: 0, videoCount: 0,
    caption: '', locationName: null,
    nearbyFlag: null, duplicateOf: null,
    error: null, blocked: false,
  }

  try {
    // ── Scrape ──
    const post = await scrapePost(page, postUrl)
    if (post.blocked) { result.blocked = true; throw new Error('Instagram challenge/block detected') }

    result.caption      = post.caption
    result.locationName = post.locationName
    result.videoCount   = post.videoCount

    console.log(`  Caption (${post.caption.length} chars): ${post.caption.slice(0, 120).replace(/\n/g, ' ')}…`)
    if (post.locationName) console.log(`  Location tag: ${post.locationName}`)
    console.log(`  Slides: ${post.slideCount}  Images: ${post.images.length}  Videos: ${post.videoCount}`)

    // All-video post
    if (post.images.length === 0 && post.videoCount > 0) {
      result.action = 'skipped-videos-only'; console.log('  SKIP: post contains only videos'); return result
    }
    if (post.images.length === 0) {
      result.action = 'skipped-no-images'; result.error = 'No images found'; return result
    }

    // ── Address ──
    const rawAddr = extractAddress(post.caption)
    if (!rawAddr) {
      result.action = 'skipped-no-address'
      console.log('  SKIP: no street address or intersection found in caption')
      return result
    }
    console.log(`  Raw address: "${rawAddr}"`)

    // ── Geocode ──
    const geo = await geocodeAddress(rawAddr)
    if (!geo) {
      result.action = 'skipped-geocode-failed'
      console.log('  SKIP: Mapbox returned no address-level result')
      return result
    }
    result.address = geo.address; result.lat = geo.lat; result.lng = geo.lng
    console.log(`  Geocoded: ${geo.lat}, ${geo.lng}`)
    console.log(`  Address : ${geo.address}`)

    // ── Duplicate check ──
    if (existingSpots?.length) {
      let closestDup = null
      for (const ex of existingSpots) {
        if (!ex.latitude || !ex.longitude) continue
        const dist = haversineMeters(geo.lat, geo.lng, ex.latitude, ex.longitude)
        if (dist <= 50) {
          if (!closestDup || dist < closestDup.dist) closestDup = { id: ex.id, title: ex.title, dist: Math.round(dist) }
        } else if (dist <= 200) {
          if (!result.nearbyFlag || dist < result.nearbyFlag.dist) result.nearbyFlag = { id: ex.id, title: ex.title, dist: Math.round(dist) }
        }
      }
      if (closestDup) {
        console.log(`  SKIP: duplicate of "${closestDup.title}" (${closestDup.dist}m, id: ${closestDup.id})`)
        result.action = 'skipped-duplicate'; result.duplicateOf = closestDup; return result
      }
      if (result.nearbyFlag) console.log(`  FLAG: nearby spot "${result.nearbyFlag.title}" (${result.nearbyFlag.dist}m) — proceeding`)
    }

    // ── Features ──
    const { features, triggers } = extractFeatures(post.caption)
    result.features = features; result.featureTriggers = triggers
    console.log(`  Features: ${features.length ? features.join(', ') : '(none)'}`)
    if (features.length) {
      for (const [f, t] of Object.entries(triggers)) console.log(`    "${t}" → ${f}`)
    }

    // ── Lighting ──
    const hasLights = /\blights?\b/i.test(post.caption) && !/\bno\s+lights?\b/i.test(post.caption)
    const lighting = hasLights ? 'Lights' : null

    // ── Multi-spot ──
    const isMultiSpot = /\bmulti[-\s]*spot\b/i.test(post.caption) || /\bmultiple\s+spots?\b/i.test(post.caption)

    // ── Title ──
    const title = generateTitle(post.caption)
    result.title = title
    console.log(`  Title: "${title}"`)

    const slug = slugify(title, Math.random().toString(36).slice(2, 6))

    // ── Download images ──
    console.log(`  Downloading ${post.images.length} image(s)...`)
    const buffers = []
    for (let i = 0; i < post.images.length; i++) {
      try { buffers.push(await fetchBinary(post.images[i])) }
      catch (e) { console.log(`    image [${i + 1}] SKIPPED: ${e.message}`) }
    }
    if (!buffers.length) { result.action = 'failed'; result.error = 'All image downloads failed'; return result }

    // Deduplicate
    const uniqIdx = await deduplicateBuffers(buffers)
    if (uniqIdx.length < buffers.length) console.log(`    deduped: removed ${buffers.length - uniqIdx.length} duplicate(s)`)
    const uniqBufs = uniqIdx.map(i => buffers[i])

    // Compress
    const compressed = await Promise.all(uniqBufs.map(b => compressImage(b)))
    result.photoCount = compressed.length

    // Save cover preview
    writeFileSync(
      path.join(OUTPUT_DIR, `${slug}-cover.jpg`),
      await sharp(uniqBufs[0]).jpeg({ quality: 85 }).toBuffer()
    )

    if (dryRun) {
      console.log(`  DRY RUN: would insert with ${compressed.length} photos`)
      result.action = 'dry-run'; return result
    }

    // ── Upload ──
    const photoUrls = await uploadPhotos(admin, compressed)

    // ── Insert ──
    const payload = {
      title, slug, type: 'Street',
      features, bust_rating: null, lighting, is_multi_spot: isMultiSpot,
      description: '',
      address: geo.address, latitude: geo.lat, longitude: geo.lng,
      photos: photoUrls,
      added_by: userId, moderation_status: 'approved', visibility: 'public',
      credit_name: '@denver_spot_locator',
      credit_url: 'https://www.instagram.com/denver_spot_locator/',
    }

    const { data: spot, error: insertErr } = await admin.from('spots').insert(payload).select().single()
    if (insertErr || !spot) {
      await admin.storage.from('spot-photos').remove(photoUrls.map(storagePathFromUrl).filter(Boolean)).catch(() => {})
      throw new Error(`Insert failed: ${insertErr?.message}`)
    }

    result.spotId = spot.id; result.action = 'added'

    // Print all fields
    const fields = [
      ['id', spot.id], ['slug', spot.slug], ['title', spot.title],
      ['type', spot.type], ['features', JSON.stringify(spot.features)],
      ['lighting', spot.lighting], ['is_multi_spot', spot.is_multi_spot],
      ['description', JSON.stringify(spot.description)],
      ['address', spot.address], ['lat/lng', `${spot.latitude}, ${spot.longitude}`],
      ['visibility', spot.visibility], ['moderation_status', spot.moderation_status],
      ['added_by', spot.added_by], ['credit_name', spot.credit_name],
      ['credit_url', spot.credit_url], ['photos', spot.photos?.length],
    ]
    for (const [k, v] of fields) console.log(`    ${k.padEnd(18)}: ${v}`)

    process.stdout.write('  Verify: ')
    await verifyPhotos(spot.photos)
    console.log('  ✓ Done')
  } catch (err) {
    if (!result.action) result.action = 'failed'
    result.error = err.message
    console.error(`  ✗ FAILED: ${err.message}`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Profile scraping for --before mode
// Collects all post URLs from @denver_spot_locator that are older than targetUrl
// ---------------------------------------------------------------------------
async function getPostsBeforeUrl(page, targetUrl) {
  const shortcodeMatch = targetUrl.match(/\/p\/([A-Za-z0-9_-]+)/)
  const targetShortcode = shortcodeMatch?.[1]
  if (!targetShortcode) throw new Error(`Could not extract shortcode from ${targetUrl}`)

  console.log(`  Looking for posts older than ${targetUrl}`)

  const collected = []
  const seenShortcodes = new Set()
  let pastTarget = false

  // Also intercept legacy graphql API responses when available
  const handler = async (response) => {
    const rurl = response.url()
    if (!rurl.includes('graphql') && !rurl.includes('/api/')) return
    try {
      const json = await response.json()
      const user = json?.data?.user
      if (!user) return
      const edges = user.edge_owner_to_timeline_media?.edges ?? user.edge_felix_video_timeline?.edges ?? []
      for (const { node } of edges) {
        if (!node?.shortcode || seenShortcodes.has(node.shortcode)) continue
        seenShortcodes.add(node.shortcode)
        if (node.shortcode === targetShortcode) { pastTarget = true; continue }
        if (pastTarget) collected.push(`https://www.instagram.com/p/${node.shortcode}/`)
      }
    } catch {}
  }
  page.on('response', handler)

  await page.goto('https://www.instagram.com/denver_spot_locator/', { waitUntil: 'load', timeout: 60000 })
  // Handle login redirect before attempting any scraping
  if (isLoginPage(page.url())) {
    page.off('response', handler)
    await waitForLoginNoLimit()
    page.on('response', handler)
    await page.goto('https://www.instagram.com/denver_spot_locator/', { waitUntil: 'load', timeout: 60000 })
  }
  await sleep(3000)

  // Bring the browser to front so the viewport is visible — required for
  // IntersectionObserver callbacks to fire when scrolling programmatically.
  await page.bringToFront()

  // Scrape post links from DOM + scroll. Instagram's grid always has <a href="/p/{sc}/">
  // links regardless of API format, so this works with both legacy graphql and new Polaris.
  // The scrollable container is #scrollview (not document.body or main).
  let noNewPostsCount = 0
  for (let scroll = 0; scroll < 50; scroll++) {
    const countBefore = seenShortcodes.size

    // Collect all post shortcodes visible in the grid.
    // When logged in, Instagram uses full hrefs: /denver_spot_locator/p/{sc}/
    // When logged out, it uses: /p/{sc}/  — the regex handles both.
    const links = await page.evaluate(() => {
      const seen = new Set()
      return [...document.querySelectorAll('a[href*="/p/"]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && h.includes('/p/'))
        .filter(h => { if (seen.has(h)) return false; seen.add(h); return true })
    })

    for (const href of links) {
      const sc = href.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]
      if (!sc || seenShortcodes.has(sc)) continue
      seenShortcodes.add(sc)
      if (sc === targetShortcode) { pastTarget = true; continue }
      if (pastTarget) collected.push(`https://www.instagram.com/p/${sc}/`)
    }

    // If we've found the target and all posts after it are collected, stop
    if (pastTarget && seenShortcodes.size === countBefore) break

    // Scroll: use Playwright's scrollIntoViewIfNeeded on the last visible post
    // anchor — this is more reliable than programmatic sv.scrollTo() for triggering
    // Instagram's IntersectionObserver-based infinite scroll.
    const lastLink = page.locator('a[href*="/p/"]').last()
    try { await lastLink.scrollIntoViewIfNeeded({ timeout: 3000 }) } catch {}

    // Also scroll #scrollview directly as a belt-and-suspenders approach
    await page.evaluate(() => {
      const sv = document.getElementById('scrollview')
      if (sv) sv.scrollTo({ top: sv.scrollHeight, behavior: 'smooth' })
    })
    await sleep(rand(2000, 3000))

    // Track consecutive iterations with no new posts to detect end-of-feed
    if (seenShortcodes.size === countBefore) {
      noNewPostsCount++
      if (noNewPostsCount >= 3) break  // 3 scrolls with no new posts = end of feed
    } else {
      noNewPostsCount = 0
    }
  }

  await sleep(500)
  page.off('response', handler)

  if (!pastTarget) console.log('  Warning: target post not found in profile grid')
  console.log(`  Found ${collected.length} posts older than target (${seenShortcodes.size} total posts scanned)`)
  return collected
}

// ---------------------------------------------------------------------------
// --collect-next: scrape a post and download all photos to disk
// ---------------------------------------------------------------------------
async function collectPostToDisk(page, postUrl) {
  const shortcode = postUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]
  if (!shortcode) throw new Error(`Cannot parse shortcode from ${postUrl}`)

  const spotDir = path.join(DSL_DIR, shortcode)
  mkdirSync(spotDir, { recursive: true })

  const infoFile = path.join(spotDir, 'info.json')
  if (existsSync(infoFile)) {
    console.log(`  Already collected — loading from disk`)
    return JSON.parse(readFileSync(infoFile, 'utf8'))
  }

  const post = await scrapePost(page, postUrl)
  if (post.blocked) throw new Error('Instagram challenge/block detected')

  console.log(`  Caption (${post.caption.length} chars): ${post.caption.slice(0, 120).replace(/\n/g, ' ')}…`)
  if (post.locationName) console.log(`  Location tag: ${post.locationName}`)
  console.log(`  Slides: ${post.slideCount}  Images: ${post.images.length}  Videos: ${post.videoCount}`)

  // Multi-part detection
  const mpMatch = post.caption.match(/\b(?:part|pt\.?)\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i)
  const multiPart = mpMatch ? { num: parseInt(mpMatch[1]), total: parseInt(mpMatch[2]) } : null

  // Download all photos
  const photos = []
  console.log(`  Downloading ${post.images.length} image(s)...`)
  for (let i = 0; i < post.images.length; i++) {
    const filename = `photo-${String(i + 1).padStart(2, '0')}.jpg`
    try {
      const buf = await fetchBinary(post.images[i])
      writeFileSync(path.join(spotDir, filename), buf)
      photos.push(filename)
      process.stdout.write('.')
    } catch {
      process.stdout.write('✗')
    }
  }
  if (post.images.length) console.log()

  const info = {
    url: postUrl, shortcode,
    caption: post.caption,
    location_name: post.locationName,
    image_urls: post.images,
    slide_count: post.slideCount,
    image_count: post.images.length,
    video_count: post.videoCount,
    photos,
    multi_part: multiPart,
    collected_at: new Date().toISOString(),
  }
  writeFileSync(infoFile, JSON.stringify(info, null, 2))
  return info
}

// ---------------------------------------------------------------------------
// --upload-ready: geocode + dedupe + upload a spot from decision.json
// ---------------------------------------------------------------------------
async function uploadFromDecision(shortcode, admin, userId, existingSpots) {
  const spotDir = path.join(DSL_DIR, shortcode)
  const decisionFile = path.join(spotDir, 'decision.json')
  if (!existsSync(decisionFile)) throw new Error(`No decision.json in ${spotDir}`)

  const decision = JSON.parse(readFileSync(decisionFile, 'utf8'))

  if (decision.action === 'skip') {
    console.log(`  SKIP: ${decision.skip_reason || '(no reason)'}`)
    return { action: 'skipped-decision', skip_reason: decision.skip_reason, url: `https://www.instagram.com/p/${shortcode}/` }
  }
  if (decision.action !== 'add') throw new Error(`Unknown decision action: "${decision.action}"`)

  // Geocode
  const geo = await geocodeAddress(decision.address)
  if (!geo) throw new Error(`Geocode failed for "${decision.address}"`)
  console.log(`  Geocoded: ${geo.lat}, ${geo.lng}`)
  console.log(`  Address : ${geo.address}`)

  // Dedupe check
  let closestDup = null, nearbyFlag = null
  for (const ex of (existingSpots || [])) {
    if (!ex.latitude || !ex.longitude) continue
    const dist = haversineMeters(geo.lat, geo.lng, ex.latitude, ex.longitude)
    if (dist <= 50 && (!closestDup || dist < closestDup.dist)) {
      closestDup = { id: ex.id, title: ex.title, dist: Math.round(dist) }
    } else if (dist <= 300 && (!nearbyFlag || dist < nearbyFlag.dist)) {
      nearbyFlag = { id: ex.id, title: ex.title, dist: Math.round(dist) }
    }
  }
  if (closestDup) {
    console.log(`  SKIP: duplicate of "${closestDup.title}" (${closestDup.dist}m)`)
    return { action: 'skipped-duplicate', url: `https://www.instagram.com/p/${shortcode}/`, duplicateOf: closestDup }
  }
  if (nearbyFlag) console.log(`  FLAG: nearby "${nearbyFlag.title}" (${nearbyFlag.dist}m) — proceeding`)

  // Load selected photos from disk
  // Filenames may be "photo-01.jpg" (this dir) or "OTHERSC/photo-01.jpg" (combined multi-part)
  const buffers = []
  for (const filename of (decision.photos_selected || [])) {
    const parts = filename.split('/')
    const photoDir = parts.length > 1 ? path.join(DSL_DIR, parts[0]) : spotDir
    const photoFile = path.join(photoDir, parts[parts.length - 1])
    if (!existsSync(photoFile)) { console.log(`  WARNING: missing photo ${photoFile}`); continue }
    buffers.push(readFileSync(photoFile))
  }
  if (!buffers.length) throw new Error('No photos loaded from disk')

  console.log(`  Compressing ${buffers.length} photo(s)...`)
  const compressed = await Promise.all(buffers.map(b => compressImage(b)))

  const title = decision.title
  const slug = slugify(title, Math.random().toString(36).slice(2, 6))

  const photoUrls = await uploadPhotos(admin, compressed)

  const payload = {
    title, slug,
    type: decision.type || 'Street',
    features: decision.features || [],
    bust_rating: decision.bust_rating || null,
    lighting: decision.lighting || null,
    is_multi_spot: decision.is_multi_spot || false,
    description: decision.description || '',
    address: geo.address, latitude: geo.lat, longitude: geo.lng,
    photos: photoUrls,
    added_by: userId, moderation_status: 'approved', visibility: 'public',
    credit_name: '@denver_spot_locator',
    credit_url: 'https://www.instagram.com/denver_spot_locator/',
  }

  const { data: spot, error: insertErr } = await admin.from('spots').insert(payload).select().single()
  if (insertErr || !spot) {
    await admin.storage.from('spot-photos').remove(photoUrls.map(storagePathFromUrl).filter(Boolean)).catch(() => {})
    throw new Error(`Insert failed: ${insertErr?.message}`)
  }

  const fields = [
    ['id', spot.id], ['slug', spot.slug], ['title', spot.title],
    ['type', spot.type], ['features', JSON.stringify(spot.features)],
    ['lighting', spot.lighting], ['bust_rating', spot.bust_rating],
    ['is_multi_spot', spot.is_multi_spot], ['description', JSON.stringify(spot.description)],
    ['address', spot.address], ['lat/lng', `${spot.latitude}, ${spot.longitude}`],
    ['visibility', spot.visibility], ['moderation_status', spot.moderation_status],
    ['added_by', spot.added_by], ['photos', spot.photos?.length],
  ]
  for (const [k, v] of fields) console.log(`    ${k.padEnd(18)}: ${v}`)
  process.stdout.write('  Verify: ')
  await verifyPhotos(spot.photos)
  console.log('  ✓ Done')

  return {
    action: 'added', spotId: spot.id, url: `https://www.instagram.com/p/${shortcode}/`,
    title, address: geo.address, lat: geo.lat, lng: geo.lng, photoCount: photoUrls.length, nearbyFlag,
  }
}

// ---------------------------------------------------------------------------
// --browser mode: spawn a persistent Chromium that never closes
// ---------------------------------------------------------------------------
async function browserMode() {
  const { execSync, spawn } = await import('node:child_process')

  // Kill any stale instance on port 9222
  try { execSync('pkill -f "remote-debugging-port=9222"') } catch {}
  await sleep(800)

  // Get playwright's bundled Chromium executable
  const { chromium: pwCore } = await import('playwright-core')
  const execPath = pwCore.executablePath()

  const child = spawn(execPath, [
    `--user-data-dir=${PROFILE_DIR}`,
    '--remote-debugging-port=9222',
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--password-store=basic',
    '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'https://www.instagram.com/',
  ], { detached: true, stdio: 'ignore' })
  child.unref()

  // Wait for the debug endpoint to be ready
  let ready = false
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    try {
      const r = await fetch('http://localhost:9222/json/version')
      if (r.ok) { ready = true; break }
    } catch {}
  }

  if (!ready) {
    console.error('Chromium did not start in time. Check port 9222.')
    process.exit(1)
  }

  console.log(`Chromium is running (PID ${child.pid}) — http://localhost:9222`)
  console.log(`Profile : ${PROFILE_DIR}`)
  console.log(`Opening : https://www.instagram.com/`)
  console.log('Log in if needed. Close the window yourself when done.')
  // Exit the Node process — the browser stays running detached
}

// ---------------------------------------------------------------------------
// Connect to the running --browser window over CDP
// ---------------------------------------------------------------------------
async function connectToBrowser() {
  let browser
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 8000 })
  } catch {
    console.error('No Chromium window running. Start one first:')
    console.error('  node scripts/import-dsl.mjs --browser')
    process.exit(1)
  }

  const contexts = browser.contexts()
  if (!contexts.length) {
    console.error('CDP connected but no browser contexts found.')
    process.exit(1)
  }
  _context = contexts[0]
  console.log('Connected to running Chromium window.')
  return browser
}

// ---------------------------------------------------------------------------
// --login mode: connect to running browser, wait for session, save cookies
// ---------------------------------------------------------------------------
async function loginMode() {
  const browser = await connectToBrowser()
  _context = browser.contexts()[0]
  console.log('Watching for Instagram login...')
  await waitForLoginNoLimit()
  console.log('Done. Cookies saved. Run your import command.')
  // Disconnect without closing the browser
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (doBrowser) { await browserMode(); return }

  // Admin client is needed by all non-browser modes — set it up first so
  // --upload-ready can run without a browser.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { users }, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (userErr) throw new Error(`listUsers: ${userErr.message}`)
  const targetUser = users.find(u => u.email === 'taylorselgas@gmail.com')
  if (!targetUser) throw new Error('taylorselgas@gmail.com not found in auth.users')
  const userId = targetUser.id

  console.log('Loading existing spots for duplicate detection...')
  const { data: existingSpots, error: spotsErr } = await admin
    .from('spots').select('id, title, latitude, longitude')
  if (spotsErr) throw new Error(`Could not load existing spots: ${spotsErr.message}`)
  console.log(`Loaded ${existingSpots.length} existing spots.`)

  // ── UPLOAD-READY mode (no browser required) ──
  if (doUploadReady) {
    const progress = loadProgress()
    const shortcodes = readdirSync(DSL_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(sc => {
        if (!existsSync(path.join(DSL_DIR, sc, 'decision.json'))) return false
        return !progress.processed.includes(`https://www.instagram.com/p/${sc}/`)
      })

    console.log(`\nSesh Wars — Upload Ready (${shortcodes.length} pending)`)
    console.log('─'.repeat(70))

    const results = []
    for (let i = 0; i < shortcodes.length; i++) {
      const sc = shortcodes[i]
      console.log(`\n[${i + 1}/${shortcodes.length}] ${sc}`)
      try {
        const result = await uploadFromDecision(sc, admin, userId, existingSpots)
        results.push({ shortcode: sc, ...result })
        const url = `https://www.instagram.com/p/${sc}/`
        progress.processed.push(url)
        if (result.action === 'added' && result.lat) {
          existingSpots.push({ id: result.spotId, title: result.title, latitude: result.lat, longitude: result.lng })
        }
        saveProgress(progress)
      } catch (e) {
        console.error(`  ✗ FAILED: ${e.message}`)
        results.push({ shortcode: sc, action: 'failed', error: e.message })
      }
    }

    console.log('\n' + '═'.repeat(70))
    console.log('UPLOAD RESULTS\n')
    console.log(`  Added  : ${results.filter(r => r.action === 'added').length}`)
    console.log(`  Skipped: ${results.filter(r => r.action?.startsWith('skipped')).length}`)
    console.log(`  Failed : ${results.filter(r => r.action === 'failed').length}`)
    process.exit(0)
  }

  const browser = await connectToBrowser()

  // Open a new tab for all scraping work — never touch the user's main Instagram tab
  console.log('\nConnecting to browser...')
  const page = await _context.newPage()

  await ensureLoggedIn(page)

  // ── COLLECT-NEXT mode ──
  if (doCollectNext) {
    const progress = loadProgress()
    const lastProcessed = progress.processed[progress.processed.length - 1]
    if (!lastProcessed) {
      console.error('No processed posts in progress file. Use --before to start.')
      await page.close(); process.exit(1)
    }

    console.log(`\nSesh Wars — Collect Next ${collectNextN} Posts`)
    console.log(`Starting after: ${lastProcessed}`)
    console.log('─'.repeat(70))

    const postUrls = await getPostsBeforeUrl(page, lastProcessed)
    let n = 0
    for (const postUrl of postUrls) {
      if (n >= collectNextN) break
      const sc = postUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]
      if (existsSync(path.join(DSL_DIR, sc, 'info.json'))) {
        console.log(`\n[skip] Already collected: ${sc}`)
        continue
      }
      n++
      const delay = rand(4000, 8000)
      console.log(`\n[${n}/${collectNextN}] ${postUrl}  (waiting ${(delay / 1000).toFixed(1)}s)`)
      await sleep(delay)
      try {
        const info = await collectPostToDisk(page, postUrl)
        console.log(`  ✓ ${info.photos.length} photos downloaded`)
        if (info.multi_part) console.log(`  Multi-part: ${info.multi_part.num} of ${info.multi_part.total}`)
        if (info.video_count > 0 && info.image_count === 0) console.log('  NOTE: Video-only post')
      } catch (e) {
        console.error(`  ✗ FAILED: ${e.message}`)
        n-- // don't count failed toward the limit
      }
    }

    console.log(`\n${'═'.repeat(70)}`)
    console.log(`Collected ${n} posts → ${DSL_DIR}`)
    console.log('Next: review photos + write decision.json per shortcode, then run --upload-ready')
    await page.close()
    process.exit(0)
  }

  // ── TEST mode ──
  if (testUrl) {
    console.log('\nSesh Wars — Denver Spot Locator Import')
    console.log(`Mode    : TEST${updateSpotId ? ' (UPDATE SPOT)' : ''}${dryRun ? ' (DRY RUN)' : ''}`)
    console.log(`URL     : ${testUrl}`)
    if (updateSpotId) console.log(`Spot ID : ${updateSpotId}`)
    console.log('─'.repeat(70))
    console.log()

    if (updateSpotId) {
      await updateSpotPhotos({ spotId: updateSpotId, postUrl: testUrl, page, admin })
      await page.close()
      process.exit(0)
    }

    const result = await importPost({ postUrl: testUrl, page, admin, userId, existingSpots, opts: { dryRun } })

    console.log('\n' + '═'.repeat(70))
    console.log('RESULT')
    console.log(`  action     : ${result.action}`)
    if (result.spotId)      console.log(`  spot_id    : ${result.spotId}`)
    if (result.title)       console.log(`  title      : ${result.title}`)
    if (result.address)     console.log(`  address    : ${result.address}`)
    if (result.lat)         console.log(`  coords     : ${result.lat}, ${result.lng}`)
    if (result.features.length) console.log(`  features   : ${result.features.join(', ')}`)
    if (result.photoCount)  console.log(`  photos     : ${result.photoCount}`)
    if (result.videoCount)  console.log(`  videos     : ${result.videoCount} (skipped)`)
    if (result.nearbyFlag)  console.log(`  nearby     : "${result.nearbyFlag.title}" (${result.nearbyFlag.dist}m)`)
    if (result.duplicateOf) console.log(`  dup of     : "${result.duplicateOf.title}" (${result.duplicateOf.dist}m)`)
    if (result.error)       console.log(`  error      : ${result.error}`)
    await page.close()
    process.exit(0)
  }

  // ── BEFORE mode ──
  if (beforeUrl) {
    console.log('\nSesh Wars — Denver Spot Locator Batch Import')
    console.log(`Mode    : BEFORE ${beforeUrl}${dryRun ? ' (DRY RUN)' : ''}`)
    console.log('─'.repeat(70))

    const progress  = loadProgress()
    const postUrls  = await getPostsBeforeUrl(page, beforeUrl)
    const results   = []
    let   blocked   = false
    let   attempted = 0

    for (let i = 0; i < postUrls.length; i++) {
      if (attempted >= limitArg) {
        console.log(`\n[limit reached: ${limitArg}] stopping.`)
        break
      }

      const pUrl = postUrls[i]
      if (progress.processed.includes(pUrl)) {
        console.log(`\n[${i + 1}/${postUrls.length}] SKIP (already in progress file): ${pUrl}`)
        continue
      }

      attempted++
      const delay = rand(4000, 8000)
      console.log(`\n[${attempted}/${Number.isFinite(limitArg) ? limitArg : postUrls.length}] ${pUrl}  (waiting ${(delay / 1000).toFixed(1)}s)`)
      await sleep(delay)

      const result = await importPost({ postUrl: pUrl, page, admin, userId, existingSpots, opts: { dryRun } })
      results.push(result)

      if (result.blocked) {
        console.log('\n  ⚠  Instagram challenge detected — saving progress and stopping.')
        blocked = true
        saveProgress({ ...progress, lastBlock: pUrl })
        break
      }

      progress.processed.push(pUrl)
      if (result.action === 'failed') progress.failed = [...(progress.failed || []), { url: pUrl, reason: result.error }]
      saveProgress(progress)

      if (result.action === 'added' && result.lat) {
        existingSpots.push({ id: result.spotId, title: result.title, latitude: result.lat, longitude: result.lng })
      }
    }

    // Batch summary
    console.log('\n' + '═'.repeat(80))
    console.log('BATCH RESULTS\n')
    const added    = results.filter(r => r.action === 'added').length
    const skipped  = results.filter(r => r.action?.startsWith('skipped')).length
    const failed   = results.filter(r => r.action === 'failed').length
    console.log(`  Added  : ${added}`)
    console.log(`  Skipped: ${skipped}`)
    console.log(`  Failed : ${failed}`)
    if (blocked) console.log('  ⚠ Stopped early due to Instagram challenge')
    const noAddr = results.filter(r => r.action === 'skipped-no-address')
    if (noAddr.length) { console.log('\n  No address found:'); noAddr.forEach(r => console.log(`    ${r.url}`)) }
    const nearby = results.filter(r => r.nearbyFlag)
    if (nearby.length) { console.log('\n  Nearby flags:'); nearby.forEach(r => console.log(`    ${r.title} near "${r.nearbyFlag.title}" (${r.nearbyFlag.dist}m)`)) }
  }

  // Close only the tab we opened — leave the browser and all other tabs running
  await page.close()
  process.exit(0)
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
