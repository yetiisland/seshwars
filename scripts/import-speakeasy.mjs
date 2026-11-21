#!/usr/bin/env node
/**
 * Import a skatepark from speakeasyskate.com into Sesh Wars.
 *
 * Usage:
 *   node scripts/import-speakeasy.mjs --url <park page url> [--dry-run]
 *
 * Reads credentials from:
 *   .env               → VITE_SUPABASE_URL, VITE_MAPBOX_TOKEN
 *   .env.import.local  → SUPABASE_SERVICE_ROLE_KEY
 *
 * Photos: bucket=spot-photos, path=spots/${ts}-${rand}.jpg, JPEG q=0.75, max 1200px
 * Lighting: extracted from page ("LIGHTS: Yes/No") → lighting column (not features array)
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
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
  console.error('Missing required env vars. Need VITE_SUPABASE_URL (from .env), VITE_MAPBOX_TOKEN (from .env), SUPABASE_SERVICE_ROLE_KEY (from .env.import.local).')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const urlIndex = args.indexOf('--url')
const parkUrl = urlIndex !== -1 ? args[urlIndex + 1] : null
const dryRun = args.includes('--dry-run')

if (!parkUrl) {
  console.error('Usage: node scripts/import-speakeasy.mjs --url <park page url> [--dry-run]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Slugify — exact copy of src/utils/slugify.js
// ---------------------------------------------------------------------------
function slugify(title, suffix = '') {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return suffix ? `${base}-${suffix}` : base
}

// ---------------------------------------------------------------------------
// Title normalisation: decode entities, replace en/em dash with " - ", title case
// ---------------------------------------------------------------------------
function normalizeTitle(raw) {
  const decoded = raw
    .replace(/&#8211;|&#x2013;|&ndash;/gi, '–')
    .replace(/&#8212;|&#x2014;|&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .trim()
  // Replace en/em dash (with optional surrounding spaces) with " - "
  const dashed = decoded
    .replace(/\s*[–—]\s*/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Title case: first char of each whitespace-delimited word uppercased, rest lower
  return dashed
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 SeshWarsImport/1.0'

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.text()
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ---------------------------------------------------------------------------
// Page parsing
// ---------------------------------------------------------------------------
function parsePage(html) {
  // --- Coordinates from Google Maps embed (q=lat,lng or q=lat, lng) ---
  const coordMatch =
    html.match(/maps\.google\.com\/[^"'<>]*[?&]q=([\d.-]+)[,\s]+([\d.-]+)/i) ||
    html.match(/google\.com\/maps[^"'<>]*[?&]q=([\d.-]+)[,\s]+([\d.-]+)/i)
  const lat = coordMatch ? parseFloat(coordMatch[1]) : null
  const lng = coordMatch ? parseFloat(coordMatch[2]) : null

  // --- Title from H1 ---
  const h1Match = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const rawTitle = h1Match
    ? h1Match[1].replace(/<[^>]+>/g, '').trim()
    : null

  // --- Cover from og:image ---
  const ogMatch =
    html.match(/property="og:image"\s+content="([^"]+)"/i) ||
    html.match(/content="([^"]+)"\s+property="og:image"/i)
  let coverUrl = ogMatch ? ogMatch[1].split('?')[0] : null
  if (coverUrl && coverUrl.includes('i0.wp.com')) {
    coverUrl += '?w=2560&ssl=1'
  }

  // --- Gallery: lh3.googleusercontent.com images (from Google Photos embeds) ---
  const gallerySet = new Set()
  // Match base URLs without size suffix
  const galleryRe = /(https?:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+)/g
  let m
  while ((m = galleryRe.exec(html)) !== null) {
    gallerySet.add(m[1] + '=w2560')
  }

  // --- Lights: extracted from meta description ("LIGHTS: Yes" / "LIGHTS: No") ---
  const lightsMatch = html.match(/LIGHTS:\s*(Yes|No)\b/i)
  let lighting = null
  if (lightsMatch) {
    lighting = lightsMatch[1].toLowerCase() === 'yes' ? 'Lights' : 'No Lights'
  }

  // --- YouTube ---
  const ytMatch =
    html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i) ||
    html.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i)
  const youtubeUrl = ytMatch ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : null

  return {
    lat, lng,
    rawTitle,
    coverUrl,
    galleryUrls: [...gallerySet],
    lighting,
    youtubeUrl,
  }
}

// ---------------------------------------------------------------------------
// Reverse geocode via Mapbox
// ---------------------------------------------------------------------------
async function reverseGeocode(lat, lng) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${MAPBOX_TOKEN}&types=address,place&limit=1`
  try {
    const res = await fetch(url)
    const json = await res.json()
    return {
      address: json.features?.[0]?.place_name || null,
      source: 'mapbox',
    }
  } catch {
    return { address: null, source: null }
  }
}

// ---------------------------------------------------------------------------
// Black bar detection and crop
// ---------------------------------------------------------------------------
async function detectAndCropBar(buf) {
  const { data, info } = await sharp(buf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  let barEndRow = -1
  let consecutiveBarRows = 0

  for (let y = 0; y < Math.min(height, 200); y++) {
    let darkCount = 0
    let lightCount = 0
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels
      const r = data[o], g = data[o + 1], b = data[o + 2]
      if (r < 60 && g < 60 && b < 60) darkCount++
      else if (r > 200 && g > 200 && b > 200) lightCount++
    }
    const fraction = (darkCount + lightCount) / width
    if (fraction >= 0.80) {
      consecutiveBarRows++
      barEndRow = y
    } else {
      if (consecutiveBarRows >= 10) break  // hit the bottom of the bar
      // Reset — this row wasn't part of a bar
      barEndRow = -1
      consecutiveBarRows = 0
    }
  }

  if (barEndRow < 9) return { cropped: false, buf }

  const cropTop = barEndRow + 1
  const croppedBuf = await sharp(buf)
    .extract({ left: 0, top: cropTop, width, height: height - cropTop })
    .toBuffer()

  return { cropped: true, buf: croppedBuf, cropTop, barEndRow }
}

// ---------------------------------------------------------------------------
// Compress — mirrors src/utils/compressImage.js (maxDim=1200, quality=0.75)
// ---------------------------------------------------------------------------
async function compressImage(buf) {
  return sharp(buf)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\nSesh Wars — Speak Easy Skate Importer')
  console.log(`Park URL : ${parkUrl}`)
  console.log(`Mode     : ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE INSERT'}`)
  console.log('─'.repeat(70))

  // 1. Admin client
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 2. User lookup
  console.log('\n[1/6] Looking up user taylorselgas@gmail.com ...')
  const { data: { users }, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (userErr) throw new Error(`listUsers: ${userErr.message}`)
  const targetUser = users.find(u => u.email === 'taylorselgas@gmail.com')
  if (!targetUser) throw new Error('taylorselgas@gmail.com not found in auth.users')
  console.log(`  user_id: ${targetUser.id}`)

  // 3. Fetch and parse page
  console.log(`\n[2/6] Fetching park page ...`)
  const html = await fetchText(parkUrl)
  const { lat, lng, rawTitle, coverUrl, galleryUrls, lighting: pageLighting, youtubeUrl } = parsePage(html)

  if (!lat || !lng) throw new Error('Could not extract coordinates — no Google Maps embed found.')

  const title = rawTitle ? normalizeTitle(rawTitle) : null
  if (!title) throw new Error('Could not extract park title from H1.')

  console.log(`  Page title (raw)      : ${rawTitle}`)
  console.log(`  Title (normalised)    : ${title}`)
  console.log(`  Coordinates           : ${lat}, ${lng}`)
  console.log(`  Cover URL             : ${coverUrl || 'not found'}`)
  console.log(`  Gallery images found  : ${galleryUrls.length}`)
  console.log(`  Lighting (from page)  : ${pageLighting ?? 'not detected'}`)
  console.log(`  YouTube               : ${youtubeUrl || 'none'}`)

  const lighting = pageLighting  // null if not detected on page

  // 4. Reverse geocode
  console.log('\n[3/6] Reverse geocoding coordinates ...')
  const { address: mapboxAddress, source: addrSource } = await reverseGeocode(lat, lng)
  const address = mapboxAddress || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  const finalAddrSource = mapboxAddress ? 'mapbox' : 'coordinates-fallback'
  console.log(`  Address (${finalAddrSource}): ${address}`)

  // 5. Download and process photos (cover first, then up to 7 gallery)
  console.log('\n[4/6] Downloading and processing photos ...')
  mkdirSync('scripts/import-output', { recursive: true })

  const photoSources = []
  if (coverUrl) photoSources.push({ url: coverUrl, isCover: true })
  for (const u of galleryUrls) {
    if (photoSources.length >= 8) break
    photoSources.push({ url: u, isCover: false })
  }

  const processedPhotos = []
  let coverCropped = false
  let coverCropTop = null

  for (let i = 0; i < photoSources.length; i++) {
    const { url, isCover } = photoSources[i]
    process.stdout.write(`  [${i + 1}/${photoSources.length}]${isCover ? ' (cover)' : ''} downloading...`)
    try {
      let buf = await fetchBinary(url)
      const { cropped, buf: croppedBuf, cropTop, barEndRow } = await detectAndCropBar(buf)
      if (cropped) {
        buf = croppedBuf
        if (isCover) {
          coverCropped = true
          coverCropTop = cropTop
          console.log(` bar at rows 0–${barEndRow}, cropped from row ${cropTop}`)
        } else {
          console.log(` bar cropped (row ${cropTop})`)
        }
      } else {
        console.log(isCover ? ' no bar detected' : ' ok')
      }

      if (isCover) {
        const previewBuf = await sharp(buf).jpeg({ quality: 85 }).toBuffer()
        writeFileSync('scripts/import-output/cover-preview.jpg', previewBuf)
        console.log(`         → saved to scripts/import-output/cover-preview.jpg`)
      }

      const compressed = await compressImage(buf)
      processedPhotos.push({ compressed, url, isCover })
    } catch (err) {
      console.log(` SKIPPED (${err.message})`)
    }
  }

  console.log(`  Result: ${processedPhotos.length} photo(s) ready`)

  // 6. Build payload
  const slug = slugify(title, Math.random().toString(36).slice(2, 6))
  const payload = {
    title,
    slug,
    type: 'Skatepark',
    features: [],
    bust_rating: null,
    lighting,
    is_multi_spot: false,
    description: '',
    address,
    latitude: lat,
    longitude: lng,
    photos: [],  // filled after upload
    added_by: targetUser.id,
    moderation_status: 'approved',
    visibility: 'private',
    credit_name: 'Speak Easy Skate',
    credit_url: 'https://speakeasyskate.com/',
  }

  // --- Dry run ---
  if (dryRun) {
    console.log('\n' + '─'.repeat(70))
    console.log('DRY RUN — payload preview (photos not uploaded):')
    console.log(JSON.stringify({ ...payload, photos: [`[${processedPhotos.length} photos would be uploaded]`] }, null, 2))
    if (youtubeUrl) console.log(`\nYouTube URL (not imported): ${youtubeUrl}`)
    console.log('\nRe-run without --dry-run to insert.')
    return
  }

  // 7. Upload photos
  if (processedPhotos.length === 0) throw new Error('No photos processed — aborting')
  console.log(`\n[5/6] Uploading ${processedPhotos.length} photo(s) to spot-photos bucket ...`)
  const photoUrls = []
  for (let i = 0; i < processedPhotos.length; i++) {
    const { compressed } = processedPhotos[i]
    const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    const { error: upErr } = await admin.storage.from('spot-photos').upload(path, compressed, { contentType: 'image/jpeg' })
    if (upErr) {
      console.warn(`  [${i + 1}] UPLOAD FAILED: ${upErr.message}`)
      continue
    }
    const { data: { publicUrl } } = admin.storage.from('spot-photos').getPublicUrl(path)
    photoUrls.push(publicUrl)
    console.log(`  [${i + 1}] → ${publicUrl}`)
  }
  if (photoUrls.length === 0) throw new Error('All uploads failed — aborting insert')
  payload.photos = photoUrls

  // 8. Insert
  console.log('\n[6/6] Inserting spot ...')
  const { data: spot, error: insertErr } = await admin.from('spots').insert(payload).select().single()
  if (insertErr || !spot) throw new Error(`Insert failed: ${insertErr?.message}`)

  // 9. Report
  console.log('\n' + '─'.repeat(70))
  console.log('INSERT SUCCESSFUL\n')
  const fields = [
    ['id',                spot.id],
    ['slug',              spot.slug],
    ['title',             spot.title],
    ['type',              spot.type],
    ['features',          JSON.stringify(spot.features)],
    ['lighting',          spot.lighting],
    ['bust_rating',       spot.bust_rating],
    ['is_multi_spot',     spot.is_multi_spot],
    ['description',       JSON.stringify(spot.description)],
    ['address',           spot.address],
    ['latitude',          spot.latitude],
    ['longitude',         spot.longitude],
    ['visibility',        spot.visibility],
    ['moderation_status', spot.moderation_status],
    ['added_by',          spot.added_by],
    ['credit_name',       spot.credit_name],
    ['credit_url',        spot.credit_url],
    ['photos count',      spot.photos.length],
  ]
  for (const [k, v] of fields) {
    console.log(`  ${k.padEnd(20)}: ${v}`)
  }

  // 10. Verify photo URLs
  console.log('\nVerifying photo URLs ...')
  for (let i = 0; i < spot.photos.length; i++) {
    const url = spot.photos[i]
    try {
      const r = await fetch(url, { method: 'HEAD' })
      console.log(`  [${i + 1}] ${r.ok ? '✓' : '✗'} HTTP ${r.status}  ${url.slice(0, 90)}`)
    } catch (e) {
      console.log(`  [${i + 1}] ✗ network error  ${url.slice(0, 90)}`)
    }
  }

  // 11. Summary
  console.log('\n' + '─'.repeat(70))
  console.log('SUMMARY')
  console.log(`  Spot id    : ${spot.id}`)
  console.log(`  Slug       : ${spot.slug}`)
  console.log(`  Title      : ${spot.title}`)
  console.log(`  Address    : ${spot.address}  (source: ${finalAddrSource})`)
  console.log(`  Coords     : ${spot.latitude}, ${spot.longitude}`)
  console.log(`  Photos     : ${spot.photos.length} uploaded`)
  console.log(`  Cover crop : ${coverCropped ? `yes, cropped at row ${coverCropTop}` : 'no bar detected'}`)
  if (youtubeUrl) console.log(`  YouTube    : ${youtubeUrl}  (not imported)`)
  console.log()
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
