#!/usr/bin/env node
/**
 * Import street spots from @denver_spot_locator Instagram posts.
 *
 * Usage:
 *   node scripts/import-dsl.mjs --test <post-url> [--dry-run]
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

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
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
const PROFILE_DIR = path.resolve(__dirname, '.ig-profile')
const OUTPUT_DIR  = path.resolve(__dirname, 'import-output')
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'dsl-progress.json')

mkdirSync(OUTPUT_DIR,  { recursive: true })
mkdirSync(PROFILE_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const testIdx   = args.indexOf('--test');   const testUrl   = testIdx  !== -1 ? args[testIdx  + 1] : null
const beforeIdx = args.indexOf('--before'); const beforeUrl = beforeIdx !== -1 ? args[beforeIdx + 1] : null
const dryRun  = args.includes('--dry-run')
const doLogin = args.includes('--login')

if (!testUrl && !beforeUrl && !doLogin) {
  console.error('Usage:')
  console.error('  node scripts/import-dsl.mjs --login')
  console.error('  node scripts/import-dsl.mjs --test <post-url> [--dry-run]')
  console.error('  node scripts/import-dsl.mjs --before <post-url> [--dry-run]')
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
  const hasNumber = /^\d/.test(rawAddress)
  const query = hasNumber ? rawAddress : `${rawAddress}, Denver, Colorado`
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
// Instagram: ensure logged in
// ---------------------------------------------------------------------------
async function ensureLoggedIn(page) {
  console.log('  Checking Instagram login status...')
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(2500)

  const needsLogin = await page.$('input[name="username"]') !== null
  if (!needsLogin) { console.log('  Already logged in.'); return }

  console.log('\n  Please log in to Instagram in the browser window that just opened.')
  console.log('  The script will continue automatically once login is detected (up to 5 min).\n')

  // Wait for the username field to disappear (login complete)
  await page.waitForSelector('input[name="username"]', { state: 'detached', timeout: 300000 })
  await sleep(2500)

  // Dismiss any post-login dialogs ("Save your login info?", "Turn on notifications?")
  for (const label of ['Not Now', 'Not now', 'Skip']) {
    const btn = await page.$(`button:has-text("${label}")`)
    if (btn) { await btn.click(); await sleep(1000) }
  }

  console.log('  Logged in successfully.')
}

// ---------------------------------------------------------------------------
// Instagram: scrape one post page
// ---------------------------------------------------------------------------
async function scrapePost(page, url) {
  const result = { caption: '', locationName: null, images: [], videoCount: 0, blocked: false }

  // Intercept API responses that carry post data
  let apiMedia = null
  const onResponse = async (response) => {
    if (apiMedia) return
    const rurl = response.url()
    if (!rurl.includes('instagram.com')) return
    // Skip images/fonts/static assets
    const ct = response.headers()['content-type'] ?? ''
    if (!ct.includes('json') && !ct.includes('javascript') && !ct.includes('text')) return
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
  }

  page.on('response', onResponse)
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  } catch { /* timeout on load is OK if content is present */ }
  // Wait for CDN images to hydrate into the DOM, then settle
  try {
    await page.waitForFunction(
      () => [...document.querySelectorAll('img')].some(img =>
        (img.src.includes('cdninstagram.com') || img.src.includes('fbcdn.net')) && img.naturalWidth > 400
      ),
      { timeout: 10000 }
    )
  } catch {}
  await sleep(1500)
  page.off('response', onResponse)

  // Try to extract embedded JSON from <script type="application/json"> tags on the page
  if (!apiMedia) {
    try {
      apiMedia = await page.evaluate(() => {
        // Try window._sharedData (legacy)
        try {
          const legacy = window._sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media
          if (legacy?.display_url) return legacy
        } catch {}
        // Scan <script type="application/json"> for media data
        for (const el of document.querySelectorAll('script[type="application/json"]')) {
          try {
            const d = JSON.parse(el.textContent)
            const flatten = (obj, depth = 0) => {
              if (!obj || typeof obj !== 'object' || depth > 8) return null
              if (obj.display_url || obj.edge_sidecar_to_children || obj.carousel_media) return obj
              for (const v of Object.values(obj)) { const r = flatten(v, depth + 1); if (r) return r }
              return null
            }
            const found = flatten(d)
            if (found) return found
          } catch {}
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
    result.caption       = apiMedia.edge_media_to_caption?.edges?.[0]?.node?.text ?? apiMedia.caption?.text ?? apiMedia.caption ?? ''
    result.locationName  = apiMedia.location?.name ?? null

    const isCarousel = apiMedia.__typename === 'GraphSidecar' || !!apiMedia.edge_sidecar_to_children
    if (isCarousel) {
      for (const edge of (apiMedia.edge_sidecar_to_children?.edges ?? [])) {
        const node = edge.node
        if (node.is_video || node.__typename === 'GraphVideo') { result.videoCount++; continue }
        const res = node.display_resources ?? []
        const imgUrl = res.length ? res[res.length - 1].src : node.display_url
        if (imgUrl) result.images.push(imgUrl)
      }
    } else if (apiMedia.is_video || apiMedia.__typename === 'GraphVideo' || apiMedia.media_type === 2) {
      result.videoCount++
    } else {
      const res = apiMedia.display_resources ?? []
      const imgUrl = res.length ? res[res.length - 1].src : apiMedia.display_url
      if (imgUrl) result.images.push(imgUrl)
    }
    return result
  }

  // ── DOM fallback ──
  console.log('    API data not captured — using DOM fallback')

  // Caption: Instagram no longer wraps posts in <article>; use broad selectors.
  // Use innerText (not textContent) so <br> tags become \n, preserving line breaks.
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
  // e.g. "denver_spot_locator 64w" injected before "Bank to Curb / Ditch Spot…"
  result.caption = result.caption
    .replace(/^@?[a-z0-9_.]+\s+\d+[wdhmy]o?\s*/i, '')
    .trim()

  // Location tag link (no article prefix)
  const locLink = await page.$('a[href*="/explore/locations/"]')
  if (locLink) result.locationName = (await locLink.textContent() || '').trim()

  // Images — navigate carousel
  result.images = await scrapeCarouselImages(page)

  // Count video slides
  result.videoCount = await page.$$eval('video', els => els.length)

  return result
}

// Navigate carousel by clicking Next, collecting one image per slide
async function scrapeCarouselImages(page) {
  const images = [], seen = new Set()

  const getBestImage = async () => {
    // Find the largest Instagram CDN image on the page (excludes avatars/icons)
    return page.evaluate(() => {
      const CDN = ['cdninstagram.com', 'fbcdn.net']
      const isCDN = src => CDN.some(d => src.includes(d))
      // Pick the CDN img with the largest naturalWidth
      let best = null, bestW = 0
      for (const img of document.querySelectorAll('img')) {
        if (!isCDN(img.src) || img.naturalWidth <= 400) continue
        const srcset = img.getAttribute('srcset') ?? ''
        let topUrl = img.src, topW = img.naturalWidth
        for (const part of srcset.split(',')) {
          const sp = part.trim().lastIndexOf(' ')
          if (sp === -1) continue
          const u = part.trim().slice(0, sp).trim()
          const w = parseInt(part.trim().slice(sp + 1)) || 0
          if (w > topW) { topUrl = u; topW = w }
        }
        if (topW > bestW) { best = topUrl; bestW = topW }
      }
      return best
    })
  }

  for (let slide = 0; slide < 20; slide++) {
    const imgUrl = await getBestImage()
    if (imgUrl && !seen.has(imgUrl)) { seen.add(imgUrl); images.push(imgUrl) }

    // After getting this slide's image, check if another slide exists
    const nextBtn = await page.$('button[aria-label*="Next"], button[aria-label*="next"], [aria-label*="Next slide"], [aria-label*="next slide"]')
    if (!nextBtn) break
    const prevUrl = await getBestImage()
    try { await nextBtn.click({ force: true }) }
    catch { await page.evaluate(btn => btn.click(), nextBtn) }
    // Wait for the image to actually change
    try {
      await page.waitForFunction(
        (prev) => {
          const CDN = ['cdninstagram.com', 'fbcdn.net']
          for (const img of document.querySelectorAll('img')) {
            if (CDN.some(d => img.src.includes(d)) && img.naturalWidth > 400 && img.src !== prev) return true
          }
          return false
        },
        prevUrl, { timeout: 5000 }
      )
    } catch { await sleep(900) }
  }

  return images
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
    console.log(`  Images: ${post.images.length}  Videos: ${post.videoCount}`)

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
  let pastTarget = false
  let seenShortcodes = new Set()

  // Intercept profile timeline API responses
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
  await sleep(3000)

  // Scroll down to load more posts until target is found (up to 20 scrolls)
  for (let i = 0; i < 20 && !pastTarget; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await sleep(rand(1500, 2500))
  }

  await sleep(1000)
  page.off('response', handler)

  if (!pastTarget) console.log('  Warning: target post not found in profile grid — may need more scrolling')
  console.log(`  Found ${collected.length} posts older than target`)
  return collected
}

// ---------------------------------------------------------------------------
// Login-only mode: open browser, wait for sessionid cookie, then close
// ---------------------------------------------------------------------------
async function loginMode() {
  console.log('Launching browser for Instagram login...')
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('Browser open. Log in to Instagram. Waiting up to 10 minutes...')

  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    const cookies = await context.cookies('https://www.instagram.com')
    if (cookies.some(c => c.name === 'sessionid' && c.value)) {
      console.log('Logged in. Saving profile...')
      await sleep(3000)
      await context.close()
      console.log('Done. Run your import command.')
      return
    }
    await sleep(2000)
  }

  await context.close()
  console.log('Login timed out after 10 minutes.')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (doLogin) { await loginMode(); return }

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

  // Launch persistent-profile Chromium (headed so user can log in)
  console.log('\nLaunching browser...')
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    await ensureLoggedIn(page)

    // ── TEST mode ──
    if (testUrl) {
      console.log('\nSesh Wars — Denver Spot Locator Import')
      console.log(`Mode    : TEST${dryRun ? ' (DRY RUN)' : ''}`)
      console.log(`URL     : ${testUrl}`)
      console.log('─'.repeat(70))
      console.log()

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
      return
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

      for (let i = 0; i < postUrls.length; i++) {
        const pUrl = postUrls[i]
        if (progress.processed.includes(pUrl)) {
          console.log(`\n[${i + 1}/${postUrls.length}] SKIP (already in progress file): ${pUrl}`)
          continue
        }

        const delay = rand(4000, 8000)
        console.log(`\n[${i + 1}/${postUrls.length}] ${pUrl}  (waiting ${(delay / 1000).toFixed(1)}s)`)
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
  } finally {
    await context.close()
  }
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
