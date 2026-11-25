#!/usr/bin/env node
/**
 * Part C: Import all remaining older Instagram posts + 2 newest posts.
 *
 * Usage:
 *   node scripts/import-part-c.mjs
 *
 * Mode is determined by CLI args:
 *   --collect-older     : scroll profile to find posts older than oldest in progress, collect to disk
 *   --collect-newer     : collect the 2 newest posts not in progress
 *   --collect-shortcode <sc>  : re-collect a specific post
 *   --upload-ready      : geocode + upload all shortcodes with decision.json that aren't processed
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

const env = { ...loadEnvFile(path.resolve(__dirname, '../.env')), ...loadEnvFile(path.resolve(__dirname, '../.env.import.local')) }
const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const MAPBOX_TOKEN = env.VITE_MAPBOX_TOKEN

const OUTPUT_DIR = path.resolve(__dirname, 'import-output')
const DSL_DIR = path.join(OUTPUT_DIR, 'dsl')
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'dsl-progress.json')
const PROFILE_DIR = path.resolve(__dirname, '.ig-profile')

mkdirSync(DSL_DIR, { recursive: true })

const args = process.argv.slice(2)
const doCollectOlder = args.includes('--collect-older')
const doCollectNewer = args.includes('--collect-newer')
const doUploadReady = args.includes('--upload-ready')
const collectScIdx = args.indexOf('--collect-shortcode')
const collectSc = collectScIdx !== -1 ? args[collectScIdx + 1] : null

let _context = null

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)) }
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return { processed: [], failed: [] }
  try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')) } catch { return { processed: [], failed: [] } }
}
function saveProgress(p) {
  writeFileSync(PROGRESS_FILE, JSON.stringify({ ...p, lastUpdated: new Date().toISOString() }, null, 2))
}

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

async function geocodeAddress(rawAddress) {
  const hasNumber = /^\d/.test(rawAddress)
  const hasCity = /\b(boulder|aurora|lakewood|englewood|arvada|westminster|thornton|broomfield|golden|fort collins|greeley|pueblo|colorado springs)\b/i.test(rawAddress)
  const query = (hasNumber || hasCity) ? rawAddress : `${rawAddress}, Denver, Colorado`
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=US&bbox=-109.1,36.9,-102.1,41.0&types=address,poi&proximity=-104.9847,39.7392&limit=1`
  try {
    const res = await fetch(url)
    const json = await res.json()
    const feat = json.features?.[0]
    if (!feat) return null
    const pt = feat.place_type || []
    if (!pt.some(t => ['address', 'poi'].includes(t))) return null
    const [lng, lat] = feat.center
    return { lat, lng, address: feat.place_name }
  } catch { return null }
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
    process.stdout.write('.')
  }
  console.log()
  return urls
}

async function verifyPhotos(urls) {
  for (const url of urls) {
    try { const r = await fetch(url, { method: 'HEAD' }); process.stdout.write(r.ok ? '✓' : `✗(${r.status})`) }
    catch { process.stdout.write('✗(err)') }
  }
  console.log()
}

function extractJsonObject(text, startIdx) {
  let depth = 0, inString = false, escaped = false
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

function isLoginPage(url) { return url.includes('accounts/login') || url.includes('/challenge') }

async function waitForLoginNoLimit() {
  console.log('  Login needed — log in in the Chromium window.')
  while (true) {
    const cookies = await _context.cookies('https://www.instagram.com')
    if (cookies.some(c => c.name === 'sessionid' && c.value)) { console.log('  Logged in.'); await sleep(1500); return }
    await sleep(3000)
  }
}

async function scrapePost(page, url) {
  const shortcode = url.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? ''
  const result = { caption: '', locationName: null, images: [], videoCount: 0, slideCount: 0, blocked: false }
  let apiMedia = null
  const onResponse = async (response) => {
    if (apiMedia) return
    const rurl = response.url()
    if (!rurl.includes('instagram.com') && !rurl.includes('graph.instagram.com')) return
    const ct = response.headers()['content-type'] ?? ''
    if (ct.includes('json') || ct.includes('javascript')) {
      try {
        const json = await response.json()
        const m = json?.data?.shortcode_media ?? json?.data?.xdt_shortcode_media ?? json?.data?.media ?? json?.items?.[0]
        if (m && (m.display_url || m.edge_sidecar_to_children || m.carousel_media || m.media_type !== undefined)) apiMedia = m
      } catch {}
      return
    }
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
          const inner = raw.if_not_gated_logged_out ?? raw
          const carousel_media = inner.carousel_media ?? null
          const image_versions2 = inner.image_versions2 ?? raw.image_versions2 ?? null
          const display_url = inner.display_uri ?? raw.display_uri ?? null
          const captionText = inner.caption?.text ?? raw.caption?.text ?? ''
          const location = inner.location ?? raw.location ?? null
          if (carousel_media || image_versions2 || display_url) {
            apiMedia = { carousel_media, image_versions2, display_url, caption: { text: captionText }, location }
          }
          break
        }
      } catch {}
    }
  }
  page.on('response', onResponse)
  try { await page.goto(url, { waitUntil: 'load', timeout: 60000 }) } catch {}
  if (isLoginPage(page.url())) {
    page.off('response', onResponse)
    await waitForLoginNoLimit()
    page.on('response', onResponse)
    try { await page.goto(url, { waitUntil: 'load', timeout: 60000 }) } catch {}
  }
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

  const curUrl = page.url()
  const title = await page.title()
  if (curUrl.includes('challenge') || /try again later|sorry/i.test(title)) { result.blocked = true; return result }

  if (apiMedia) {
    result.caption = apiMedia.edge_media_to_caption?.edges?.[0]?.node?.text ?? apiMedia.caption?.text ?? apiMedia.caption ?? ''
    result.locationName = apiMedia.location?.name ?? null
    const bestUrl = node => {
      const candidates = node.display_resources ?? node.image_versions2?.candidates ?? []
      if (candidates.length) {
        const sorted = [...candidates].sort((a, b) => (b.config_width ?? b.width ?? 0) - (a.config_width ?? a.width ?? 0))
        return sorted[0].src ?? sorted[0].url ?? null
      }
      return node.display_url ?? node.display_uri ?? null
    }
    const isVideo = node => node.is_video || node.__typename === 'GraphVideo' || node.__typename === 'XIGPolarisVideoMedia' || node.media_type === 2 || !!node.video_url
    const slides = apiMedia.edge_sidecar_to_children?.edges?.map(e => e.node) ?? apiMedia.carousel_media ?? null
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
    console.log(`    API: ${result.slideCount} slides (${result.images.length} images, ${result.videoCount} videos)`)
    return result
  }

  // DOM fallback - caption
  for (const sel of ['h1[dir="auto"]', 'div[dir="auto"] > h1', 'h1', 'span._ap3a[dir="auto"]', 'span[dir="auto"]']) {
    const els = await page.$$(sel)
    for (const el of els) {
      const t = ((await el.evaluate(n => n.innerHTML
        .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      )) || '').trim()
      if (t.length > 20 && t.length > result.caption.length) result.caption = t
    }
  }
  result.caption = result.caption.replace(/^@?[a-z0-9_.]+\s+\d+[wdhmy]o?\s*/i, '').trim()

  const locLink = await page.$('a[href*="/explore/locations/"]')
  if (locLink) result.locationName = (await locLink.textContent() || '').trim()

  // DOM carousel images
  const carousel = await scrapeCarouselImages(page)
  result.images = carousel.images
  result.videoCount = carousel.videoCount
  result.slideCount = carousel.slideCount
  return result
}

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
    const nextBtn = document.querySelector('button[aria-label*="Next"], button[aria-label*="next"]')
    if (nextBtn) {
      let container = nextBtn.parentElement
      for (let d = 0; d < 15 && container; d++) {
        const cdnImgs = [...container.querySelectorAll('img')].filter(img => isCDN(img.src) && img.naturalWidth > 400)
        if (cdnImgs.length >= 2) {
          let best = null, bestLeft = Infinity
          for (const img of cdnImgs) {
            const rect = img.getBoundingClientRect()
            if (rect.width < 100 || rect.left < -50) continue
            if (rect.left < bestLeft) { bestLeft = rect.left; best = { isVideo: false, url: getBestUrl(img) } }
          }
          if (best) return best
          const vid = [...container.querySelectorAll('video')].find(v => { const r = v.getBoundingClientRect(); return r.width > 100 && r.left >= -50 })
          if (vid) return { isVideo: true, url: null }
          break
        }
        container = container.parentElement
      }
    }
    let best = null, bestScore = Infinity
    for (const img of document.querySelectorAll('img')) {
      if (!isCDN(img.src) || img.naturalWidth <= 400) continue
      const rect = img.getBoundingClientRect()
      if (rect.width < 100 || rect.left < -50 || rect.top < 0) continue
      const score = rect.top * 10000 + rect.left
      if (score < bestScore) { bestScore = score; best = { isVideo: false, url: getBestUrl(img) } }
    }
    return best
  })
  for (let slide = 0; slide < 20; slide++) {
    const active = await getActiveSlide()
    if (!active) break
    slideCount++
    if (active.isVideo) { videoCount++ }
    else if (active.url && !seen.has(active.url)) { seen.add(active.url); images.push(active.url) }
    const nextBtn = await page.$('button[aria-label*="Next"], button[aria-label*="next"]')
    if (!nextBtn) break
    try { await nextBtn.click({ force: true }) } catch { await page.evaluate(btn => btn.click(), nextBtn) }
    await sleep(1000)
  }
  console.log(`    DOM carousel: ${slideCount} slides (${images.length} images, ${videoCount} videos)`)
  return { images, videoCount, slideCount }
}

async function collectPostToDisk(page, postUrl) {
  const shortcode = postUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]
  if (!shortcode) throw new Error(`Cannot parse shortcode from ${postUrl}`)
  const spotDir = path.join(DSL_DIR, shortcode)
  mkdirSync(spotDir, { recursive: true })
  const infoFile = path.join(spotDir, 'info.json')
  if (existsSync(infoFile)) {
    console.log(`  Already collected: ${shortcode}`)
    return JSON.parse(readFileSync(infoFile, 'utf8'))
  }
  const post = await scrapePost(page, postUrl)
  if (post.blocked) throw new Error('Instagram challenge/block detected')
  console.log(`  Caption (${post.caption.length} chars): ${post.caption.slice(0, 100).replace(/\n/g, ' ')}…`)
  const mpMatch = post.caption.match(/\b(?:part|pt\.?)\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i)
  const multiPart = mpMatch ? { num: parseInt(mpMatch[1]), total: parseInt(mpMatch[2]) } : null
  const photos = []
  for (let i = 0; i < post.images.length; i++) {
    const filename = `photo-${String(i + 1).padStart(2, '0')}.jpg`
    try {
      const buf = await fetchBinary(post.images[i])
      writeFileSync(path.join(spotDir, filename), buf)
      photos.push(filename)
      process.stdout.write('.')
    } catch { process.stdout.write('✗') }
  }
  if (post.images.length) console.log()
  const info = {
    url: postUrl, shortcode,
    caption: post.caption, location_name: post.locationName,
    image_urls: post.images, slide_count: post.slideCount,
    image_count: post.images.length, video_count: post.videoCount,
    photos, multi_part: multiPart,
    collected_at: new Date().toISOString(),
  }
  writeFileSync(infoFile, JSON.stringify(info, null, 2))
  return info
}

// Scrape the profile grid to get all post shortcodes
async function scrapeProfileShortcodes(page) {
  console.log('  Navigating to @denver_spot_locator profile...')
  await page.goto('https://www.instagram.com/denver_spot_locator/', { waitUntil: 'load', timeout: 60000 })
  if (isLoginPage(page.url())) { await waitForLoginNoLimit(); await page.goto('https://www.instagram.com/denver_spot_locator/', { waitUntil: 'load', timeout: 60000 }) }
  await sleep(3000)
  await page.bringToFront()

  const seenShortcodes = new Set()
  let noNewCount = 0

  for (let scroll = 0; scroll < 80; scroll++) {
    const countBefore = seenShortcodes.size
    const links = await page.evaluate(() => {
      const seen = new Set()
      return [...document.querySelectorAll('a[href*="/p/"]')]
        .map(a => a.getAttribute('href'))
        .filter(h => h && h.includes('/p/'))
        .filter(h => { if (seen.has(h)) return false; seen.add(h); return true })
    })
    for (const href of links) {
      const sc = href.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]
      if (sc) seenShortcodes.add(sc)
    }
    const lastLink = page.locator('a[href*="/p/"]').last()
    try { await lastLink.scrollIntoViewIfNeeded({ timeout: 3000 }) } catch {}
    await page.evaluate(() => {
      const sv = document.getElementById('scrollview')
      if (sv) sv.scrollTo({ top: sv.scrollHeight, behavior: 'smooth' })
      else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    })
    await sleep(rand(2000, 3500))
    if (seenShortcodes.size === countBefore) {
      noNewCount++
      if (noNewCount >= 5) { console.log(`  No new posts after ${scroll + 1} scrolls — end of feed`); break }
    } else {
      noNewCount = 0
      if (seenShortcodes.size % 50 === 0) process.stdout.write(`[${seenShortcodes.size}]`)
    }
  }
  console.log(`\n  Total posts found on profile: ${seenShortcodes.size}`)
  return [...seenShortcodes]
}

async function uploadFromDecision(shortcode, admin, userId, existingSpots) {
  const spotDir = path.join(DSL_DIR, shortcode)
  const decisionFile = path.join(spotDir, 'decision.json')
  if (!existsSync(decisionFile)) throw new Error(`No decision.json in ${spotDir}`)
  const decision = JSON.parse(readFileSync(decisionFile, 'utf8'))

  if (decision.action === 'skip') {
    return { action: 'skipped-decision', skip_reason: decision.skip_reason, url: `https://www.instagram.com/p/${shortcode}/` }
  }
  if (decision.action !== 'add') throw new Error(`Unknown decision action: "${decision.action}"`)

  const geo = await geocodeAddress(decision.address)
  if (!geo) throw new Error(`Geocode failed for "${decision.address}"`)
  console.log(`  Geocoded: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} — ${geo.address}`)

  let closestDup = null, nearbyFlag = null
  for (const ex of (existingSpots || [])) {
    if (!ex.latitude || !ex.longitude) continue
    const dist = haversineMeters(geo.lat, geo.lng, ex.latitude, ex.longitude)
    if (dist <= 50 && (!closestDup || dist < closestDup.dist)) closestDup = { id: ex.id, title: ex.title, dist: Math.round(dist) }
    else if (dist <= 300 && (!nearbyFlag || dist < nearbyFlag.dist)) nearbyFlag = { id: ex.id, title: ex.title, dist: Math.round(dist) }
  }
  if (closestDup) {
    console.log(`  SKIP: duplicate of "${closestDup.title}" (${closestDup.dist}m)`)
    return { action: 'skipped-duplicate', url: `https://www.instagram.com/p/${shortcode}/`, duplicateOf: closestDup }
  }
  if (nearbyFlag) console.log(`  FLAG: nearby "${nearbyFlag.title}" (${nearbyFlag.dist}m) — proceeding`)

  const buffers = []
  for (const filename of (decision.photos_selected || [])) {
    const parts = filename.split('/')
    const photoDir = parts.length > 1 ? path.join(DSL_DIR, parts[0]) : spotDir
    const photoFile = path.join(photoDir, parts[parts.length - 1])
    if (!existsSync(photoFile)) { console.log(`  WARNING: missing photo ${photoFile}`); continue }
    buffers.push(readFileSync(photoFile))
  }
  if (!buffers.length) throw new Error('No photos loaded from disk')

  const compressed = await Promise.all(buffers.map(b => compressImage(b)))
  const title = decision.title
  const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6)

  process.stdout.write(`  Uploading ${compressed.length} photos...`)
  const photoUrls = await uploadPhotos(admin, compressed)

  const payload = {
    title, slug, type: decision.type || 'Street',
    features: decision.features || [], bust_rating: decision.bust_rating || null,
    lighting: decision.lighting || null, is_multi_spot: decision.is_multi_spot || false,
    description: decision.description || '',
    address: geo.address, latitude: geo.lat, longitude: geo.lng,
    photos: photoUrls, added_by: userId, moderation_status: 'approved', visibility: 'public',
    credit_name: '@denver_spot_locator', credit_url: 'https://www.instagram.com/denver_spot_locator/',
  }

  const { data: spot, error: insertErr } = await admin.from('spots').insert(payload).select().single()
  if (insertErr || !spot) {
    await admin.storage.from('spot-photos').remove(photoUrls.map(storagePathFromUrl).filter(Boolean)).catch(() => {})
    throw new Error(`Insert failed: ${insertErr?.message}`)
  }

  console.log(`  Inserted: ${spot.id} | "${spot.title}"`)
  process.stdout.write('  Verify: ')
  await verifyPhotos(spot.photos)

  return {
    action: 'added', spotId: spot.id, url: `https://www.instagram.com/p/${shortcode}/`,
    title, address: geo.address, lat: geo.lat, lng: geo.lng,
    photoCount: photoUrls.length, nearbyFlag,
    features: decision.features, bust_rating: decision.bust_rating,
    lighting: decision.lighting, is_multi_spot: decision.is_multi_spot,
    description: decision.description,
  }
}

async function connectToBrowser() {
  let browser
  try {
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 8000 })
  } catch {
    console.error('No Chromium window running on port 9222.')
    process.exit(1)
  }
  const contexts = browser.contexts()
  if (!contexts.length) { console.error('No browser contexts found.'); process.exit(1) }
  _context = contexts[0]
  console.log('Connected to Chromium via CDP.')
  return browser
}

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  if (doUploadReady) {
    const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const targetUser = users.find(u => u.email === 'taylorselgas@gmail.com')
    if (!targetUser) throw new Error('taylorselgas@gmail.com not found')
    const userId = targetUser.id

    console.log('Loading existing spots...')
    const { data: existingSpots } = await admin.from('spots').select('id,title,latitude,longitude')
    console.log(`Loaded ${existingSpots.length} existing spots.`)

    const progress = loadProgress()
    const shortcodes = readdirSync(DSL_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(sc => {
        if (!existsSync(path.join(DSL_DIR, sc, 'decision.json'))) return false
        return !progress.processed.includes(`https://www.instagram.com/p/${sc}/`)
      })

    console.log(`\nUpload Ready: ${shortcodes.length} pending\n${'─'.repeat(70)}`)
    const results = []
    let addedCount = 0
    const startTotal = existingSpots.length

    for (let i = 0; i < shortcodes.length; i++) {
      const sc = shortcodes[i]
      const decPath = path.join(DSL_DIR, sc, 'decision.json')
      const decision = JSON.parse(readFileSync(decPath, 'utf8'))

      // Skip secondary multi-part posts
      if (decision.action === 'skip' && decision.notes?.includes('Secondary multi-part')) {
        console.log(`[${i + 1}/${shortcodes.length}] SKIP secondary multi-part: ${sc}`)
        progress.processed.push(`https://www.instagram.com/p/${sc}/`)
        saveProgress(progress)
        results.push({ shortcode: sc, action: 'skipped-multipart-secondary' })
        continue
      }

      console.log(`\n[${i + 1}/${shortcodes.length}] ${sc}`)
      try {
        const result = await uploadFromDecision(sc, admin, userId, existingSpots)
        results.push({ shortcode: sc, ...result })
        progress.processed.push(`https://www.instagram.com/p/${sc}/`)
        if (result.action === 'added' && result.lat) {
          existingSpots.push({ id: result.spotId, title: result.title, latitude: result.lat, longitude: result.lng })
          addedCount++
        }
        saveProgress(progress)
      } catch (e) {
        console.error(`  FAILED: ${e.message}`)
        results.push({ shortcode: sc, action: 'failed', error: e.message })
      }

      // Batch breaks
      if ((i + 1) % 25 === 0) {
        const totalNow = startTotal + addedCount
        console.log(`\nSTATUS: ${addedCount} spots added this run, ${totalNow} total spots in Sesh Wars`)
        const breakMs = rand(3 * 60000, 5 * 60000)
        console.log(`Taking ${Math.round(breakMs / 60000)} minute batch break...`)
        await sleep(breakMs)
      }
    }

    const added = results.filter(r => r.action === 'added')
    const skipped = results.filter(r => r.action?.startsWith('skipped'))
    const failed = results.filter(r => r.action === 'failed')
    const totalFinal = startTotal + addedCount

    console.log(`\n${'═'.repeat(70)}\nUPLOAD RESULTS`)
    console.log(`  Added  : ${added.length}`)
    console.log(`  Skipped: ${skipped.length}`)
    console.log(`  Failed : ${failed.length}`)
    console.log(`\nSTATUS: ${addedCount} spots added this run, ${totalFinal} total spots in Sesh Wars`)

    if (added.length) {
      console.log('\nSpots added:')
      for (const r of added) {
        console.log(`  ${r.spotId} | ${r.title} | ${r.features?.join(',')||''} | bust:${r.bust_rating||'null'} | lights:${r.lighting||'null'} | multi:${r.is_multi_spot||false} | photos:${r.photoCount}`)
      }
    }
    return
  }

  const browser = await connectToBrowser()
  const page = await _context.newPage()

  // Collect a single shortcode
  if (collectSc) {
    console.log(`Collecting shortcode: ${collectSc}`)
    const info = await collectPostToDisk(page, `https://www.instagram.com/p/${collectSc}/`)
    console.log(`Collected: ${info.photos.length} photos`)
    await page.close()
    process.exit(0)
  }

  const progress = loadProgress()

  if (doCollectNewer) {
    // Get the 2 newest posts not in progress
    console.log('\nCollecting 2 newest posts not yet in progress...')
    const allShortcodes = await scrapeProfileShortcodes(page)
    // Profile is ordered newest first
    const processed = new Set(progress.processed.map(u => u.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]).filter(Boolean))
    const newOnes = allShortcodes.filter(sc => !processed.has(sc)).slice(0, 2)
    console.log(`New posts to collect: ${newOnes.join(', ')}`)

    for (const sc of newOnes) {
      const delay = rand(4000, 8000)
      console.log(`\nCollecting ${sc} (waiting ${(delay / 1000).toFixed(1)}s)...`)
      await sleep(delay)
      const info = await collectPostToDisk(page, `https://www.instagram.com/p/${sc}/`)
      console.log(`  Collected: ${info.photos.length} photos`)
    }
    await page.close()
    process.exit(0)
  }

  if (doCollectOlder) {
    // Find oldest processed post
    const oldestUrl = progress.processed[progress.processed.length - 1]
    const oldestSc = oldestUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]
    console.log(`\nCollecting posts older than: ${oldestSc}`)

    const allShortcodes = await scrapeProfileShortcodes(page)
    const processed = new Set(progress.processed.map(u => u.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1]).filter(Boolean))

    // Find where oldestSc is in the full list (profile grid is newest-first)
    const targetIdx = allShortcodes.indexOf(oldestSc)
    if (targetIdx === -1) {
      console.log(`  WARNING: ${oldestSc} not found in profile grid. Possibly deleted or private.`)
      console.log(`  All shortcodes found: ${allShortcodes.length}`)
      // Try to identify truly new ones
    }

    const olderShortcodes = targetIdx !== -1 ? allShortcodes.slice(targetIdx + 1) : []
    const toCollect = olderShortcodes.filter(sc => !processed.has(sc))
    console.log(`  Posts older than target: ${olderShortcodes.length}`)
    console.log(`  Not yet collected: ${toCollect.length}`)

    if (toCollect.length === 0) {
      console.log('  All older posts already collected or no older posts found.')
      await page.close()
      process.exit(0)
    }

    let n = 0
    for (const sc of toCollect) {
      n++
      const delay = rand(4000, 8000)
      console.log(`\n[${n}/${toCollect.length}] ${sc}  (waiting ${(delay / 1000).toFixed(1)}s)`)
      await sleep(delay)
      try {
        const info = await collectPostToDisk(page, `https://www.instagram.com/p/${sc}/`)
        console.log(`  ✓ ${info.photos.length} photos downloaded`)
        if (info.multi_part) console.log(`  Multi-part: ${info.multi_part.num} of ${info.multi_part.total}`)
        if (info.video_count > 0 && info.image_count === 0) console.log('  NOTE: Video-only post')
      } catch (e) {
        console.error(`  FAILED: ${e.message}`)
      }
    }
    console.log(`\nCollected ${n} posts → ${DSL_DIR}`)
  }

  await page.close()
  process.exit(0)
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
