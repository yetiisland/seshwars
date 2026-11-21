#!/usr/bin/env node
/**
 * Import or update a skatepark from speakeasyskate.com in Sesh Wars.
 *
 * Usage:
 *   node scripts/import-speakeasy.mjs --url <park page url> [--dry-run]
 *   node scripts/import-speakeasy.mjs --url <park page url> --update <spot id>
 *
 * Reads credentials from:
 *   .env               → VITE_SUPABASE_URL, VITE_MAPBOX_TOKEN
 *   .env.import.local  → SUPABASE_SERVICE_ROLE_KEY
 *
 * Photos: bucket=spot-photos, path=spots/${ts}-${rand}.jpg, JPEG q=0.75, max 1200px
 * Titles: no hyphens/dashes, Title Case
 * Lighting: extracted from page LIGHTS field → lighting column (not features array)
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
const updateIndex = args.indexOf('--update')
const updateId = updateIndex !== -1 ? args[updateIndex + 1] : null

if (!parkUrl) {
  console.error('Usage:')
  console.error('  node scripts/import-speakeasy.mjs --url <url> [--dry-run]')
  console.error('  node scripts/import-speakeasy.mjs --url <url> --update <spot-id>')
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
// Title normalisation: decode entities, strip hyphens/dashes, title case
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
  // Strip en/em dashes and plain hyphens; collapse surrounding spaces
  const stripped = decoded
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // Title case: first char of each space-delimited word uppercased, rest lower
  return stripped
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
  // --- Coordinates from Google Maps embed ---
  const coordMatch =
    html.match(/maps\.google\.com\/[^"'<>]*[?&]q=([\d.-]+)[,\s]+([\d.-]+)/i) ||
    html.match(/google\.com\/maps[^"'<>]*[?&]q=([\d.-]+)[,\s]+([\d.-]+)/i)
  const lat = coordMatch ? parseFloat(coordMatch[1]) : null
  const lng = coordMatch ? parseFloat(coordMatch[2]) : null

  // --- Title from H1 ---
  const h1Match =
    html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const rawTitle = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : null

  // --- Cover from og:image ---
  const ogMatch =
    html.match(/property="og:image"\s+content="([^"]+)"/i) ||
    html.match(/content="([^"]+)"\s+property="og:image"/i)
  let coverUrl = ogMatch ? ogMatch[1].split('?')[0] : null
  if (coverUrl && coverUrl.includes('i0.wp.com')) coverUrl += '?w=2560&ssl=1'

  // --- Gallery: lh3.googleusercontent.com images ---
  const gallerySet = new Set()
  const galleryRe = /(https?:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+)/g
  let m
  while ((m = galleryRe.exec(html)) !== null) gallerySet.add(m[1] + '=w2560')

  // --- Lights from meta description: "LIGHTS: Yes" / "LIGHTS: No" ---
  // Also look for a time like "LIGHTS: Yes (till 10pm)" or "10:30pm"
  const lightsMatch = html.match(/LIGHTS:\s*(Yes|No)(?:[^<"]{0,60}?([\d]{1,2}(?::\d{2})?(?:am|pm)))?/i)
  let lighting = null
  let lightsTime = null
  if (lightsMatch) {
    lighting = lightsMatch[1].toLowerCase() === 'yes' ? 'Lights' : 'No Lights'
    if (lightsMatch[2]) lightsTime = lightsMatch[2].toLowerCase()
  }

  // --- YouTube ---
  const ytMatch =
    html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i) ||
    html.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i)
  const youtubeUrl = ytMatch ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : null

  return { lat, lng, rawTitle, coverUrl, galleryUrls: [...gallerySet], lighting, lightsTime, youtubeUrl }
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
    return { address: json.features?.[0]?.place_name || null, source: 'mapbox' }
  } catch {
    return { address: null, source: null }
  }
}

// ---------------------------------------------------------------------------
// Perceptual hash: 8×8 grayscale dHash
// Returns a 64-element boolean array (each pixel > mean)
// ---------------------------------------------------------------------------
async function pHash(buf) {
  const { data } = await sharp(buf)
    .resize(9, 8, { fit: 'fill' })  // 9 wide so we can diff 8 columns
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  // dHash: each bit = left pixel > right pixel across the row
  const bits = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits.push(data[y * 9 + x] > data[y * 9 + x + 1])
    }
  }
  return bits
}

function hammingDistance(a, b) {
  let dist = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dist++
  return dist
}

// ---------------------------------------------------------------------------
// Deduplicate: given an array of Buffers, return indices of unique ones
// Two images are considered duplicates if hamming distance < 10
// ---------------------------------------------------------------------------
async function deduplicateBuffers(buffers) {
  const hashes = await Promise.all(buffers.map(b => pHash(b)))
  const kept = []
  for (let i = 0; i < hashes.length; i++) {
    const isDup = kept.some(j => hammingDistance(hashes[i], hashes[j]) < 10)
    if (!isDup) kept.push(i)
  }
  return kept
}

// ---------------------------------------------------------------------------
// Black bar detection and crop with safety margin + re-check
// ---------------------------------------------------------------------------
async function detectAndCropBar(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  // Scan from top; a row is "bar" if >80% pixels are near-black or near-white
  let barEndRow = -1
  let consecutiveBarRows = 0

  for (let y = 0; y < Math.min(height, 300); y++) {
    let darkCount = 0
    let lightCount = 0
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels
      const r = data[o], g = data[o + 1], b = data[o + 2]
      if (r < 60 && g < 60 && b < 60) darkCount++
      else if (r > 200 && g > 200 && b > 200) lightCount++
    }
    if ((darkCount + lightCount) / width >= 0.80) {
      consecutiveBarRows++
      barEndRow = y
    } else {
      if (consecutiveBarRows >= 10) break
      barEndRow = -1
      consecutiveBarRows = 0
    }
  }

  if (barEndRow < 9) return { cropped: false, buf, rowsRemoved: 0 }

  // Safety margin: 2% of image height, minimum 1 row
  const margin = Math.max(1, Math.round(height * 0.02))
  let cropTop = barEndRow + 1 + margin

  // Re-check: if top 10 rows of cropped image are still dark, keep nudging
  for (let attempt = 0; attempt < 10; attempt++) {
    if (cropTop + 10 >= height) {
      // Can't crop any further — give up and skip this image
      return { cropped: false, buf, rowsRemoved: 0, skipped: true }
    }
    const { data: checkData, info: checkInfo } = await sharp(buf)
      .extract({ left: 0, top: cropTop, width, height: Math.min(10, height - cropTop) })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let darkRows = 0
    for (let y = 0; y < checkInfo.height; y++) {
      let dark = 0
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * checkInfo.channels
        const r = checkData[o], g = checkData[o + 1], b = checkData[o + 2]
        if (r < 60 && g < 60 && b < 60) dark++
      }
      if (dark / width >= 0.5) darkRows++
    }
    if (darkRows <= 2) break  // top looks clean
    cropTop += 5
  }

  const croppedBuf = await sharp(buf)
    .extract({ left: 0, top: cropTop, width, height: height - cropTop })
    .toBuffer()

  return { cropped: true, buf: croppedBuf, cropTop, rowsRemoved: cropTop }
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
// Extract storage path from public URL
// e.g. https://.../object/public/spot-photos/spots/xxx.jpg → spots/xxx.jpg
// ---------------------------------------------------------------------------
function storagePathFromUrl(url) {
  const marker = '/spot-photos/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

// ---------------------------------------------------------------------------
// Print spot fields
// ---------------------------------------------------------------------------
function printSpot(spot) {
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
    ['photos count',      spot.photos?.length],
  ]
  for (const [k, v] of fields) console.log(`  ${k.padEnd(20)}: ${v}`)
}

// ---------------------------------------------------------------------------
// Verify photo URLs
// ---------------------------------------------------------------------------
async function verifyPhotos(urls) {
  console.log('\nVerifying photo URLs ...')
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      const r = await fetch(url, { method: 'HEAD' })
      console.log(`  [${i + 1}] ${r.ok ? '✓' : '✗'} HTTP ${r.status}  ${url.slice(0, 90)}`)
    } catch {
      console.log(`  [${i + 1}] ✗ network error  ${url.slice(0, 90)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Download, crop, deduplicate, compress photos
// Returns array of { compressed, url, isCover, rowsRemoved }
// Also returns { coverCropRows, duplicatesRemoved }
// ---------------------------------------------------------------------------
async function processPhotos(coverUrl, galleryUrls, maxPhotos = 8) {
  mkdirSync('scripts/import-output', { recursive: true })

  // Build source list: cover first, then gallery up to maxPhotos total
  // We fetch more than maxPhotos to allow for deduplication
  const sources = []
  if (coverUrl) sources.push({ url: coverUrl, isCover: true })
  for (const u of galleryUrls) {
    if (sources.length >= maxPhotos + 4) break  // fetch a few extra for dedup buffer
    sources.push({ url: u, isCover: false })
  }

  // Download all
  const downloaded = []
  console.log(`  Downloading ${sources.length} source images ...`)
  for (let i = 0; i < sources.length; i++) {
    const { url, isCover } = sources[i]
    process.stdout.write(`  [${i + 1}/${sources.length}]${isCover ? ' (cover)' : ''} ...`)
    try {
      const buf = await fetchBinary(url)
      downloaded.push({ buf, url, isCover })
      console.log(' ok')
    } catch (err) {
      console.log(` SKIPPED (${err.message})`)
    }
  }

  // Deduplicate raw downloads by perceptual hash (before crop, so cover+gallery
  // duplicate is caught even if cropped slightly differently)
  console.log(`  Deduplicating ${downloaded.length} images ...`)
  const rawBufs = downloaded.map(d => d.buf)
  const uniqueIndices = await deduplicateBuffers(rawBufs)
  const duplicatesRemoved = downloaded.length - uniqueIndices.length
  if (duplicatesRemoved > 0) console.log(`  Removed ${duplicatesRemoved} duplicate(s)`)
  const unique = uniqueIndices.map(i => downloaded[i])

  // Crop and compress, up to maxPhotos
  let coverCropRows = 0
  const processed = []
  for (let i = 0; i < unique.length && processed.length < maxPhotos; i++) {
    const { buf, url, isCover } = unique[i]
    const { cropped, buf: croppedBuf, rowsRemoved, skipped } = await detectAndCropBar(buf)
    if (skipped) {
      console.log(`  [${i + 1}] bar could not be removed cleanly — SKIPPED`)
      continue
    }
    const finalBuf = cropped ? croppedBuf : buf
    if (cropped) {
      console.log(`  [${i + 1}]${isCover ? ' (cover)' : ''} cropped ${rowsRemoved} rows`)
      if (isCover) coverCropRows = rowsRemoved
    } else {
      console.log(`  [${i + 1}]${isCover ? ' (cover)' : ''} no bar`)
    }
    if (isCover) {
      const previewBuf = await sharp(finalBuf).jpeg({ quality: 85 }).toBuffer()
      writeFileSync('scripts/import-output/cover-preview.jpg', previewBuf)
      console.log(`         → scripts/import-output/cover-preview.jpg saved`)
    }
    const compressed = await compressImage(finalBuf)
    processed.push({ compressed, url, isCover, rowsRemoved: cropped ? rowsRemoved : 0 })
  }

  return { processed, coverCropRows, duplicatesRemoved }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const mode = updateId ? `UPDATE ${updateId}` : dryRun ? 'DRY RUN' : 'INSERT'
  console.log('\nSesh Wars — Speak Easy Skate Importer')
  console.log(`Park URL : ${parkUrl}`)
  console.log(`Mode     : ${mode}`)
  console.log('─'.repeat(70))

  // Admin client
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // User lookup
  console.log('\n[1] Looking up user taylorselgas@gmail.com ...')
  const { data: { users }, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (userErr) throw new Error(`listUsers: ${userErr.message}`)
  const targetUser = users.find(u => u.email === 'taylorselgas@gmail.com')
  if (!targetUser) throw new Error('taylorselgas@gmail.com not found in auth.users')
  console.log(`  user_id: ${targetUser.id}`)

  // Fetch existing spot for --update
  let existingSpot = null
  if (updateId) {
    console.log(`\n[2] Fetching existing spot ${updateId} ...`)
    const { data, error } = await admin.from('spots').select('*').eq('id', updateId).single()
    if (error || !data) throw new Error(`Could not fetch spot ${updateId}: ${error?.message}`)
    existingSpot = data
    console.log(`  Found: "${existingSpot.title}" (slug: ${existingSpot.slug})`)
    console.log(`  Current photos: ${existingSpot.photos?.length ?? 0}`)
  }

  // Fetch and parse park page
  console.log(`\n[${updateId ? 3 : 2}] Fetching park page ...`)
  const html = await fetchText(parkUrl)
  const { lat, lng, rawTitle, coverUrl, galleryUrls, lighting: pageLighting, lightsTime, youtubeUrl } = parsePage(html)

  if (!lat || !lng) throw new Error('Could not extract coordinates — no Google Maps embed found.')
  const title = rawTitle ? normalizeTitle(rawTitle) : null
  if (!title) throw new Error('Could not extract park title from H1.')

  console.log(`  Page title (raw)  : ${rawTitle}`)
  console.log(`  Title (normalised): ${title}`)
  console.log(`  Coordinates       : ${lat}, ${lng}`)
  console.log(`  Cover URL         : ${coverUrl || 'not found'}`)
  console.log(`  Gallery images    : ${galleryUrls.length}`)
  console.log(`  Lighting          : ${pageLighting ?? 'not detected'}${lightsTime ? ` (till ${lightsTime})` : ''}`)
  console.log(`  YouTube           : ${youtubeUrl || 'none'}`)

  const lighting = pageLighting
  const description = (lighting === 'Lights' && lightsTime) ? `Lights on till ${lightsTime}.` : ''
  if (description) console.log(`  Description       : "${description}"`)

  // Reverse geocode (only for new inserts; updates keep existing address)
  let address, finalAddrSource
  if (!updateId) {
    console.log(`\n[3] Reverse geocoding ...`)
    const { address: mapboxAddr } = await reverseGeocode(lat, lng)
    address = mapboxAddr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
    finalAddrSource = mapboxAddr ? 'mapbox' : 'coordinates-fallback'
    console.log(`  Address (${finalAddrSource}): ${address}`)
  }

  // Photos
  console.log(`\n[${updateId ? 4 : 4}] Processing photos ...`)
  const { processed, coverCropRows, duplicatesRemoved } = await processPhotos(coverUrl, galleryUrls)
  console.log(`  ${processed.length} unique photo(s) ready (${duplicatesRemoved} duplicate(s) removed)`)

  // Dry run
  if (dryRun) {
    console.log('\n' + '─'.repeat(70))
    console.log('DRY RUN — payload preview:')
    const slug = slugify(title, Math.random().toString(36).slice(2, 6))
    console.log(JSON.stringify({
      title, slug, type: 'Skatepark', features: [], bust_rating: null,
      lighting, is_multi_spot: false, description,
      address: address || existingSpot?.address, latitude: lat, longitude: lng,
      photos: [`[${processed.length} photos would be uploaded]`],
      added_by: targetUser.id, moderation_status: 'approved',
      visibility: 'private', credit_name: 'Speak Easy Skate', credit_url: 'https://speakeasyskate.com/',
    }, null, 2))
    if (youtubeUrl) console.log(`\nYouTube (not imported): ${youtubeUrl}`)
    console.log('\nRe-run without --dry-run to insert.')
    return
  }

  if (processed.length === 0) throw new Error('No photos processed — aborting')

  // Upload photos
  console.log(`\n[5] Uploading ${processed.length} photo(s) ...`)
  const photoUrls = []
  for (let i = 0; i < processed.length; i++) {
    const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    const { error: upErr } = await admin.storage.from('spot-photos').upload(path, processed[i].compressed, { contentType: 'image/jpeg' })
    if (upErr) { console.warn(`  [${i + 1}] UPLOAD FAILED: ${upErr.message}`); continue }
    const { data: { publicUrl } } = admin.storage.from('spot-photos').getPublicUrl(path)
    photoUrls.push(publicUrl)
    console.log(`  [${i + 1}] → ${publicUrl}`)
  }
  if (photoUrls.length === 0) throw new Error('All uploads failed — aborting')

  // ── UPDATE mode ──
  if (updateId) {
    // Delete old storage files
    const oldPaths = (existingSpot.photos || []).map(storagePathFromUrl).filter(Boolean)
    console.log(`\n[6] Deleting ${oldPaths.length} old storage file(s) ...`)
    if (oldPaths.length > 0) {
      const { error: delErr } = await admin.storage.from('spot-photos').remove(oldPaths)
      if (delErr) console.warn(`  Storage delete warning: ${delErr.message}`)
      else console.log(`  Deleted: ${oldPaths.join(', ')}`)
    }

    // Update spot — keep slug, address, coords, category, credit, visibility, added_by, moderation_status
    console.log(`\n[7] Updating spot ${updateId} ...`)
    const updatePayload = {
      title,
      // slug: kept as-is (app keeps existing slug on edit per SpotDetail.jsx line 580)
      description,
      lighting,
      photos: photoUrls,
    }
    const { data: spot, error: updateErr } = await admin
      .from('spots').update(updatePayload).eq('id', updateId).select().single()
    if (updateErr || !spot) throw new Error(`Update failed: ${updateErr?.message}`)

    console.log('\n' + '─'.repeat(70))
    console.log('UPDATE SUCCESSFUL\n')
    printSpot(spot)
    await verifyPhotos(spot.photos)

    console.log('\n' + '─'.repeat(70))
    console.log('SUMMARY')
    console.log(`  Spot id          : ${spot.id}`)
    console.log(`  Slug (unchanged) : ${spot.slug}`)
    console.log(`  New title        : ${spot.title}`)
    console.log(`  Lighting         : ${spot.lighting}`)
    console.log(`  Description      : ${JSON.stringify(spot.description)}`)
    console.log(`  Photos           : ${spot.photos.length} uploaded`)
    console.log(`  Duplicates rmvd  : ${duplicatesRemoved}`)
    console.log(`  Cover crop rows  : ${coverCropRows}`)
    console.log(`  Old files deleted: ${oldPaths.length}`)
    if (youtubeUrl) console.log(`  YouTube          : ${youtubeUrl}  (not imported)`)
    return
  }

  // ── INSERT mode ──
  console.log('\n[6] Inserting spot ...')
  const slug = slugify(title, Math.random().toString(36).slice(2, 6))
  const payload = {
    title, slug, type: 'Skatepark', features: [], bust_rating: null,
    lighting, is_multi_spot: false, description,
    address, latitude: lat, longitude: lng, photos: photoUrls,
    added_by: targetUser.id, moderation_status: 'approved',
    visibility: 'private', credit_name: 'Speak Easy Skate', credit_url: 'https://speakeasyskate.com/',
  }
  const { data: spot, error: insertErr } = await admin.from('spots').insert(payload).select().single()
  if (insertErr || !spot) throw new Error(`Insert failed: ${insertErr?.message}`)

  console.log('\n' + '─'.repeat(70))
  console.log('INSERT SUCCESSFUL\n')
  printSpot(spot)
  await verifyPhotos(spot.photos)

  console.log('\n' + '─'.repeat(70))
  console.log('SUMMARY')
  console.log(`  Spot id    : ${spot.id}`)
  console.log(`  Slug       : ${spot.slug}`)
  console.log(`  Title      : ${spot.title}`)
  console.log(`  Address    : ${spot.address}  (source: ${finalAddrSource})`)
  console.log(`  Coords     : ${spot.latitude}, ${spot.longitude}`)
  console.log(`  Lighting   : ${spot.lighting}`)
  console.log(`  Description: ${JSON.stringify(spot.description)}`)
  console.log(`  Photos     : ${spot.photos.length} uploaded`)
  console.log(`  Duplicates : ${duplicatesRemoved} removed`)
  console.log(`  Cover crop : ${coverCropRows} rows removed`)
  if (youtubeUrl) console.log(`  YouTube    : ${youtubeUrl}  (not imported)`)
  console.log()
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
