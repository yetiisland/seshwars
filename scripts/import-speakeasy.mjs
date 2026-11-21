#!/usr/bin/env node
/**
 * Import or update a skatepark from speakeasyskate.com in Sesh Wars.
 *
 * Usage:
 *   node scripts/import-speakeasy.mjs --url <park page url> [--dry-run]
 *   node scripts/import-speakeasy.mjs --url <park page url> --update <spot id>
 *   node scripts/import-speakeasy.mjs --page <listing page url> [--dry-run]
 *
 * Reads credentials from:
 *   .env               → VITE_SUPABASE_URL, VITE_MAPBOX_TOKEN
 *   .env.import.local  → SUPABASE_SERVICE_ROLE_KEY
 *
 * Photos: bucket=spot-photos, path=spots/${ts}-${rand}.jpg, JPEG q=0.75, max 1200px
 * Titles: no hyphens/dashes, Title Case
 * Lighting: extracted from page LIGHTS field → lighting column
 * Default visibility: public
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
const pageIndex = args.indexOf('--page')
const pageUrl = pageIndex !== -1 ? args[pageIndex + 1] : null
const dryRun = args.includes('--dry-run')
const updateIndex = args.indexOf('--update')
const updateId = updateIndex !== -1 ? args[updateIndex + 1] : null
const doBackfill = args.includes('--backfill')

if (!parkUrl && !pageUrl && !doBackfill) {
  console.error('Usage:')
  console.error('  node scripts/import-speakeasy.mjs --url <url> [--dry-run]')
  console.error('  node scripts/import-speakeasy.mjs --url <url> --update <spot-id>')
  console.error('  node scripts/import-speakeasy.mjs --page <listing-url> [--dry-run]')
  console.error('  node scripts/import-speakeasy.mjs --backfill')
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
  const stripped = decoded
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------------------------------------------------------------------------
// Listing page: extract all park links
// ---------------------------------------------------------------------------
function extractParkLinks(html) {
  const links = []
  const re = /href='(https:\/\/speakeasyskate\.com\/[^/']+\/)'/g
  let m
  const seen = new Set()
  while ((m = re.exec(html)) !== null) {
    const url = m[1]
    // Skip obvious non-park pages
    if (url.match(/\/(skateparks|skateparks-directory|closed|construction|category|tag|author|page|wp-|feed|xmlrpc)\//i)) continue
    if (!seen.has(url)) { seen.add(url); links.push(url) }
  }
  return links
}

// ---------------------------------------------------------------------------
// Park page parsing
// ---------------------------------------------------------------------------
function parsePage(html) {
  // --- Coordinates ---
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

  // --- Gallery images ---
  const gallerySet = new Set()
  const galleryRe = /(https?:\/\/lh3\.googleusercontent\.com\/pw\/[A-Za-z0-9_-]+)/g
  let m
  while ((m = galleryRe.exec(html)) !== null) gallerySet.add(m[1] + '=w2560')

  // --- Lights from meta description ---
  // Formats: "LIGHTS: Yes | 10:00 PM", "LIGHTS: Yes till 10pm", "LIGHTS: No"
  const lightsFieldMatch = html.match(/LIGHTS:\s*(Yes|No)([^<"]*)/i)
  let lighting = null
  let lightsTime = null
  if (lightsFieldMatch) {
    lighting = lightsFieldMatch[1].toLowerCase() === 'yes' ? 'Lights' : 'No Lights'
    if (lighting === 'Lights') {
      const after = lightsFieldMatch[2]
      const timeMatch = after.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
      if (timeMatch) {
        const h = timeMatch[1]
        const min = timeMatch[2]
        const period = timeMatch[3].toLowerCase()
        lightsTime = (min && min !== '00') ? `${h}:${min}${period}` : `${h}${period}`
      }
    }
  }

  // --- Status: closed or under construction ---
  // Check category tags and body text
  let status = 'active'
  const lowerHtml = html.toLowerCase()
  // Category-based detection (class="cat-X" text)
  if (/category-closed|cat-closed|"closed"/i.test(html)) status = 'closed'
  else if (/category-under-construction|cat-construction|"under.construction"/i.test(html)) status = 'construction'
  // Body text indicators (look in content area only, avoid sidebar matches)
  if (status === 'active') {
    const entryContent = html.match(/class="entry-content"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || ''
    if (/\bthis park is (permanently )?closed\b/i.test(entryContent)) status = 'closed'
    else if (/\bthis park is under construction\b/i.test(entryContent)) status = 'construction'
    else if (/\bpermanently closed\b/i.test(entryContent)) status = 'closed'
  }
  // STATUS field in meta description
  if (status === 'active') {
    if (/STATUS:\s*closed/i.test(html)) status = 'closed'
    else if (/STATUS:\s*under construction/i.test(html)) status = 'construction'
  }

  // --- YouTube ---
  const ytMatch =
    html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/i) ||
    html.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i)
  const youtubeUrl = ytMatch ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : null

  return { lat, lng, rawTitle, coverUrl, galleryUrls: [...gallerySet], lighting, lightsTime, youtubeUrl, status }
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
// Haversine distance in metres
// ---------------------------------------------------------------------------
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ---------------------------------------------------------------------------
// Perceptual hash (dHash 8×8)
// ---------------------------------------------------------------------------
async function pHash(buf) {
  const { data } = await sharp(buf)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const bits = []
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits.push(data[y * 9 + x] > data[y * 9 + x + 1])
  return bits
}

function hammingDistance(a, b) {
  let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d
}

async function deduplicateBuffers(buffers) {
  const hashes = await Promise.all(buffers.map(b => pHash(b)))
  const kept = []
  for (let i = 0; i < hashes.length; i++) {
    if (!kept.some(j => hammingDistance(hashes[i], hashes[j]) < 10)) kept.push(i)
  }
  return kept
}

// ---------------------------------------------------------------------------
// Black bar detection + improved crop with safety margin and re-check
// ---------------------------------------------------------------------------
async function detectAndCropBar(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  let barEndRow = -1, consecutiveBarRows = 0
  for (let y = 0; y < Math.min(height, 300); y++) {
    let dark = 0, light = 0
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels
      const r = data[o], g = data[o + 1], b = data[o + 2]
      if (r < 60 && g < 60 && b < 60) dark++
      else if (r > 200 && g > 200 && b > 200) light++
    }
    if ((dark + light) / width >= 0.80) {
      consecutiveBarRows++; barEndRow = y
    } else {
      if (consecutiveBarRows >= 10) break
      barEndRow = -1; consecutiveBarRows = 0
    }
  }
  if (barEndRow < 9) return { cropped: false, buf, rowsRemoved: 0 }

  const margin = Math.max(1, Math.round(height * 0.02))
  let cropTop = barEndRow + 1 + margin

  for (let attempt = 0; attempt < 10; attempt++) {
    if (cropTop + 10 >= height) return { cropped: false, buf, rowsRemoved: 0, skipped: true }
    const { data: cd, info: ci } = await sharp(buf)
      .extract({ left: 0, top: cropTop, width, height: Math.min(10, height - cropTop) })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let darkRows = 0
    for (let y = 0; y < ci.height; y++) {
      let d = 0
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * ci.channels
        if (cd[o] < 60 && cd[o + 1] < 60 && cd[o + 2] < 60) d++
      }
      if (d / width >= 0.5) darkRows++
    }
    if (darkRows <= 2) break
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
// Storage path from public URL
// ---------------------------------------------------------------------------
function storagePathFromUrl(url) {
  const idx = url.indexOf('/spot-photos/')
  return idx === -1 ? null : url.slice(idx + '/spot-photos/'.length)
}

// ---------------------------------------------------------------------------
// Download, crop, dedupe, compress photos
// ---------------------------------------------------------------------------
async function processPhotos(coverUrl, galleryUrls, slug, maxPhotos = 8) {
  mkdirSync('scripts/import-output', { recursive: true })

  const sources = []
  if (coverUrl) sources.push({ url: coverUrl, isCover: true })
  for (const u of galleryUrls) {
    if (sources.length >= maxPhotos + 4) break
    sources.push({ url: u, isCover: false })
  }

  const downloaded = []
  for (let i = 0; i < sources.length; i++) {
    const { url, isCover } = sources[i]
    try {
      const buf = await fetchBinary(url)
      downloaded.push({ buf, url, isCover })
    } catch (err) {
      console.log(`    photo [${i + 1}] SKIPPED (${err.message})`)
    }
  }

  const rawBufs = downloaded.map(d => d.buf)
  const uniqueIndices = await deduplicateBuffers(rawBufs)
  const duplicatesRemoved = downloaded.length - uniqueIndices.length
  if (duplicatesRemoved > 0) console.log(`    deduped: removed ${duplicatesRemoved} duplicate(s)`)
  const unique = uniqueIndices.map(i => downloaded[i])

  let coverCropRows = 0
  const processed = []
  for (let i = 0; i < unique.length && processed.length < maxPhotos; i++) {
    const { buf, url, isCover } = unique[i]
    const { cropped, buf: croppedBuf, rowsRemoved, skipped } = await detectAndCropBar(buf)
    if (skipped) { console.log(`    photo [${i + 1}] bar unremovable — SKIPPED`); continue }
    const finalBuf = cropped ? croppedBuf : buf
    if (cropped && isCover) coverCropRows = rowsRemoved
    if (isCover) {
      const previewBuf = await sharp(finalBuf).jpeg({ quality: 85 }).toBuffer()
      writeFileSync(`scripts/import-output/${slug}-cover.jpg`, previewBuf)
    }
    const compressed = await compressImage(finalBuf)
    processed.push({ compressed, url, isCover, rowsRemoved: cropped ? rowsRemoved : 0 })
  }
  return { processed, coverCropRows, duplicatesRemoved }
}

// ---------------------------------------------------------------------------
// Upload photos, return public URLs; on failure delete already-uploaded paths
// ---------------------------------------------------------------------------
async function uploadPhotos(admin, processed) {
  const photoUrls = []
  const uploadedPaths = []
  for (let i = 0; i < processed.length; i++) {
    const path = `spots/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
    const { error: upErr } = await admin.storage
      .from('spot-photos').upload(path, processed[i].compressed, { contentType: 'image/jpeg' })
    if (upErr) {
      // Clean up already uploaded files before propagating
      if (uploadedPaths.length > 0)
        await admin.storage.from('spot-photos').remove(uploadedPaths).catch(() => {})
      throw new Error(`Photo [${i + 1}] upload failed: ${upErr.message}`)
    }
    uploadedPaths.push(path)
    const { data: { publicUrl } } = admin.storage.from('spot-photos').getPublicUrl(path)
    photoUrls.push(publicUrl)
  }
  return photoUrls
}

// ---------------------------------------------------------------------------
// File a spot report (mirrors ReportSection.jsx insert)
// Table: spot_reports; columns: spot_id, user_id, report_type, custom_text
// CONTENT_REPORT_TYPES is empty set → no edge function call needed
// ---------------------------------------------------------------------------
async function fileReport(admin, spotId, userId, reportType, customText = null) {
  const payload = {
    spot_id: spotId,
    user_id: userId,
    report_type: reportType,
    custom_text: reportType === 'Other' ? customText : null,
  }
  const { data, error } = await admin.from('spot_reports').insert(payload).select().single()
  if (error || !data) throw new Error(`Report insert failed: ${error?.message}`)
  return data
}

// ---------------------------------------------------------------------------
// Verify photo URLs (HEAD requests)
// ---------------------------------------------------------------------------
async function verifyPhotos(urls) {
  const results = []
  for (let i = 0; i < urls.length; i++) {
    try {
      const r = await fetch(urls[i], { method: 'HEAD' })
      results.push({ ok: r.ok, status: r.status })
      process.stdout.write(r.ok ? '✓' : `✗(${r.status})`)
    } catch {
      results.push({ ok: false, status: 0 })
      process.stdout.write('✗(err)')
    }
  }
  console.log()
  return results
}

// ---------------------------------------------------------------------------
// Print spot fields
// ---------------------------------------------------------------------------
function printSpot(spot) {
  const fields = [
    ['id', spot.id], ['slug', spot.slug], ['title', spot.title], ['type', spot.type],
    ['features', JSON.stringify(spot.features)], ['lighting', spot.lighting],
    ['description', JSON.stringify(spot.description)], ['address', spot.address],
    ['lat/lng', `${spot.latitude}, ${spot.longitude}`],
    ['visibility', spot.visibility], ['moderation_status', spot.moderation_status],
    ['added_by', spot.added_by], ['credit_name', spot.credit_name],
    ['credit_url', spot.credit_url], ['photos', spot.photos?.length],
  ]
  for (const [k, v] of fields) console.log(`    ${k.padEnd(18)}: ${v}`)
}

// ---------------------------------------------------------------------------
// Import one park — shared by --url and --page modes
// Returns result object for the final report
// ---------------------------------------------------------------------------
async function importOnePark({ parkUrl, admin, userId, existingSpots, skipUrls, visibility = 'public' }) {
  const result = {
    url: parkUrl, title: null, spotId: null, status: 'unknown',
    action: null, lighting: null, description: '', photoCount: 0,
    reportFiled: null, youtubeUrl: null, nearbyFlag: null, error: null,
    duplicateOf: null, slug: null,
  }

  try {
    const html = await fetchText(parkUrl)
    const { lat, lng, rawTitle, coverUrl, galleryUrls, lighting: pageLighting, lightsTime, youtubeUrl, status } = parsePage(html)

    if (!rawTitle) throw new Error('Could not extract title from H1')
    if (!lat || !lng) throw new Error('Could not extract coordinates — no Google Maps embed found')

    const title = normalizeTitle(rawTitle)
    result.title = title
    result.youtubeUrl = youtubeUrl
    result.status = status

    console.log(`  Title   : ${title}`)
    console.log(`  Coords  : ${lat}, ${lng}`)
    console.log(`  Status  : ${status}`)
    console.log(`  Lights  : ${pageLighting ?? 'not detected'}${lightsTime ? ` till ${lightsTime}` : ''}`)

    const lighting = pageLighting
    const description = (lighting === 'Lights' && lightsTime) ? `Lights on till ${lightsTime}.` : ''
    result.lighting = lighting
    result.description = description

    // --- Duplicate / proximity check (location only, name irrelevant) ---
    // ≤50 m → skip; 50–200 m → add + flag in report
    if (existingSpots && lat && lng) {
      let closestDup = null
      for (const ex of existingSpots) {
        if (!ex.latitude || !ex.longitude) continue
        const dist = haversineMeters(lat, lng, ex.latitude, ex.longitude)
        if (dist <= 50) {
          if (!closestDup || dist < closestDup.dist)
            closestDup = { id: ex.id, title: ex.title, dist: Math.round(dist) }
        } else if (dist <= 200) {
          if (!result.nearbyFlag || dist < result.nearbyFlag.dist)
            result.nearbyFlag = { id: ex.id, title: ex.title, dist: Math.round(dist) }
        }
      }
      if (closestDup) {
        console.log(`  SKIP: duplicate of "${closestDup.title}" (${closestDup.dist}m, id: ${closestDup.id})`)
        result.action = 'skipped-duplicate'
        result.duplicateOf = closestDup
        return result
      }
      if (result.nearbyFlag) {
        console.log(`  FLAG: nearby spot "${result.nearbyFlag.title}" (${result.nearbyFlag.dist}m) — proceeding`)
      }
    }

    // --- Address ---
    const { address: mapboxAddr } = await reverseGeocode(lat, lng)
    const address = mapboxAddr || `${lat.toFixed(4)}, ${lng.toFixed(4)}`

    // --- Photos ---
    const slug = slugify(title, Math.random().toString(36).slice(2, 6))
    result.slug = slug
    console.log(`  Slug    : ${slug}`)
    console.log(`  Address : ${address}`)
    console.log(`  Photos  : downloading ${coverUrl ? 1 : 0} cover + ${galleryUrls.length} gallery...`)

    const { processed, coverCropRows, duplicatesRemoved } = await processPhotos(coverUrl, galleryUrls, slug)
    console.log(`  Photos  : ${processed.length} unique (${duplicatesRemoved} dupes removed, cover crop ${coverCropRows}r)`)
    result.photoCount = processed.length

    if (dryRun) {
      console.log(`  DRY RUN: would insert with ${processed.length} photos`)
      result.action = 'dry-run'
      return result
    }

    if (processed.length === 0) throw new Error('No photos processed')

    // --- Upload ---
    const photoUrls = await uploadPhotos(admin, processed)

    // --- Insert ---
    const payload = {
      title, slug, type: 'Skatepark', features: [], bust_rating: null,
      lighting, is_multi_spot: false, description,
      address, latitude: lat, longitude: lng, photos: photoUrls,
      added_by: userId, moderation_status: 'approved', visibility,
      credit_name: 'Speak Easy Skate', credit_url: 'https://speakeasyskate.com/',
    }
    const { data: spot, error: insertErr } = await admin.from('spots').insert(payload).select().single()
    if (insertErr || !spot) {
      // Clean up uploaded photos
      await admin.storage.from('spot-photos').remove(photoUrls.map(storagePathFromUrl).filter(Boolean)).catch(() => {})
      throw new Error(`Insert failed: ${insertErr?.message}`)
    }

    result.spotId = spot.id
    result.action = 'added'
    printSpot(spot)

    // --- Verify photos ---
    process.stdout.write(`  Verify  : `)
    await verifyPhotos(spot.photos)

    // --- Report if closed or under construction ---
    if (status === 'closed') {
      const rpt = await fileReport(admin, spot.id, userId, "Spot Doesn't Exist")
      result.reportFiled = { type: "Spot Doesn't Exist", id: rpt.id }
      console.log(`  Report  : filed "Spot Doesn't Exist" (id: ${rpt.id})`)
    } else if (status === 'construction') {
      const rpt = await fileReport(admin, spot.id, userId, 'Other', 'Under Construction')
      result.reportFiled = { type: 'Other', customText: 'Under Construction', id: rpt.id }
      console.log(`  Report  : filed "Other / Under Construction" (id: ${rpt.id})`)
    }

    console.log(`  ✓ Done`)
  } catch (err) {
    result.action = 'failed'
    result.error = err.message
    console.error(`  ✗ FAILED: ${err.message}`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Backfill lights times for today's Speak Easy spots
// Fetches all speakeasyskate.com park pages, matches by coordinates,
// and sets description = "Lights on till <time>." for spots that have
// lighting='Lights' but an empty description.
// ---------------------------------------------------------------------------
async function backfillLightsTimes(admin, userId) {
  const today = new Date().toISOString().slice(0, 10)

  // Find spots created today by this user from speakeasyskate.com with Lights
  const { data: allSpots, error: qErr } = await admin.from('spots')
    .select('id, title, latitude, longitude, description')
    .eq('added_by', userId)
    .eq('credit_url', 'https://speakeasyskate.com/')
    .eq('lighting', 'Lights')
    .gte('created_at', `${today}T00:00:00.000Z`)
  if (qErr) throw new Error(`Backfill query: ${qErr.message}`)

  const spots = (allSpots || []).filter(s => !s.description || s.description.trim() === '')
  if (!spots.length) { console.log('  No spots need backfill.'); return { updated: [], noTime: [] } }
  console.log(`  Found ${spots.length} spot(s) needing backfill: ${spots.map(s => s.title).join(', ')}`)

  // Collect all park URLs from listing pages
  const allParkUrls = []
  for (let p = 1; p <= 10; p++) {
    try {
      const listHtml = await fetchText(`https://speakeasyskate.com/skateparks/?_page=${p}`)
      const links = extractParkLinks(listHtml)
      if (!links.length) break
      allParkUrls.push(...links)
      await sleep(400)
    } catch { break }
  }
  console.log(`  Scanning ${allParkUrls.length} park URLs for light times ...`)

  // Fetch each park with Lights and build a coord→time map
  const coordEntries = []
  for (const url of allParkUrls) {
    try {
      await sleep(300)
      const html = await fetchText(url)
      const { lat, lng, lighting: pl, lightsTime } = parsePage(html)
      if (lat && lng && pl === 'Lights') coordEntries.push({ url, lat, lng, lightsTime })
    } catch { /* skip unreachable pages */ }
  }

  const updated = []
  const noTime = []
  for (const spot of spots) {
    const match = coordEntries.find(e => haversineMeters(spot.latitude, spot.longitude, e.lat, e.lng) < 10)
    if (!match) {
      console.log(`  BACKFILL: no matching page found for "${spot.title}"`)
      noTime.push(spot.title)
      continue
    }
    if (!match.lightsTime) {
      console.log(`  BACKFILL: "${spot.title}" — Lights=Yes but no time on page (${match.url})`)
      noTime.push(spot.title)
      continue
    }
    const desc = `Lights on till ${match.lightsTime}.`
    const { data: updatedSpot, error: upErr } = await admin
      .from('spots').update({ description: desc }).eq('id', spot.id).select().single()
    if (upErr || !updatedSpot) {
      console.log(`  BACKFILL: failed to update "${spot.title}": ${upErr?.message}`)
    } else {
      console.log(`  BACKFILL: "${spot.title}" → "${desc}"`)
      updated.push({ title: spot.title, description: desc, id: spot.id })
    }
  }
  return { updated, noTime }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // User lookup
  const { data: { users }, error: userErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (userErr) throw new Error(`listUsers: ${userErr.message}`)
  const targetUser = users.find(u => u.email === 'taylorselgas@gmail.com')
  if (!targetUser) throw new Error('taylorselgas@gmail.com not found in auth.users')
  const userId = targetUser.id

  // ── BACKFILL MODE: --backfill ──
  if (doBackfill) {
    console.log('\nSesh Wars — Speak Easy Lights Backfill')
    console.log('─'.repeat(70))
    const { updated, noTime } = await backfillLightsTimes(admin, userId)
    console.log('\nBACKFILL RESULTS')
    if (updated.length) {
      console.log(`  Updated ${updated.length} spot(s):`)
      for (const s of updated) console.log(`    ${s.title} → "${s.description}"`)
    } else {
      console.log('  No spots updated.')
    }
    if (noTime.length) {
      console.log(`  Lights=Yes but no time found (${noTime.length}): ${noTime.join(', ')}`)
    }
    return
  }

  // ── BATCH MODE: --page ──
  if (pageUrl) {
    console.log(`\nSesh Wars — Speak Easy Batch Import`)
    console.log(`Listing : ${pageUrl}`)
    console.log(`Mode    : ${dryRun ? 'DRY RUN' : 'LIVE'}`)
    console.log('─'.repeat(70))

    // Explicit skip list (already-imported parks by URL)
    const SKIP_URLS = new Set([
      'https://speakeasyskate.com/3rdst/',
    ])

    // Fetch listing page
    console.log('\nFetching listing page ...')
    const listHtml = await fetchText(pageUrl)
    const parkLinks = extractParkLinks(listHtml)
    console.log(`Found ${parkLinks.length} park link(s)`)

    // Load all existing spots for duplicate checking
    console.log('Loading existing spots for duplicate check ...')
    const { data: existingSpots, error: spotsErr } = await admin
      .from('spots').select('id, title, latitude, longitude, slug')
    if (spotsErr) throw new Error(`Could not load existing spots: ${spotsErr.message}`)
    console.log(`Loaded ${existingSpots.length} existing spot(s)`)

    const results = []
    let idx = 0
    for (const link of parkLinks) {
      idx++
      console.log(`\n[${ idx}/${parkLinks.length}] ${link}`)

      if (SKIP_URLS.has(link)) {
        console.log('  SKIP: in explicit skip list (already imported)')
        results.push({ url: link, action: 'skipped-explicit', title: '(3rd St — already imported)' })
        continue
      }

      await sleep(1000)
      const result = await importOnePark({ parkUrl: link, admin, userId, existingSpots, skipUrls: SKIP_URLS })
      results.push(result)

      // Add successfully-inserted spot to existingSpots for subsequent proximity checks
      if (result.action === 'added' && result.spotId) {
        // Fetch the new spot's coords to add to the in-memory list
        const { data: newSpot } = await admin.from('spots')
          .select('id, title, latitude, longitude, slug').eq('id', result.spotId).single()
        if (newSpot) existingSpots.push(newSpot)
      }
    }

    // Final report table
    console.log('\n' + '═'.repeat(80))
    console.log('BATCH RESULTS\n')
    console.log('URL slug'.padEnd(26) + ' Title'.padEnd(36) + ' Action'.padEnd(20) + ' Lights'.padEnd(14) + ' Photos  Report')
    console.log('─'.repeat(118))
    for (const r of results) {
      const slug = r.url?.split('/').filter(Boolean).pop() || ''
      const title = (r.title || '').slice(0, 34).padEnd(34)
      const action = (r.action || '').padEnd(18)
      const lights = (r.lighting || '').padEnd(12)
      const photos = String(r.photoCount || 0).padEnd(7)
      const rpt = r.reportFiled ? r.reportFiled.type.slice(0, 20) : (r.error ? `ERR: ${r.error.slice(0, 20)}` : 'none')
      console.log(`${slug.padEnd(25)} ${title} ${action} ${lights} ${photos} ${rpt}`)
    }

    const added = results.filter(r => r.action === 'added')
    const skipped = results.filter(r => r.action?.startsWith('skipped'))
    const failed = results.filter(r => r.action === 'failed')
    const reported = results.filter(r => r.reportFiled)
    const youtubeFound = results.filter(r => r.youtubeUrl)
    const nearbyFlagged = results.filter(r => r.nearbyFlag)

    console.log(`\n  Added:   ${added.length}`)
    console.log(`  Skipped: ${skipped.length}`)
    console.log(`  Failed:  ${failed.length}`)
    console.log(`  Reports: ${reported.length}`)

    if (skipped.length > 0) {
      console.log('\nSkipped:')
      for (const r of skipped) {
        const dup = r.duplicateOf
        console.log(`  ${r.url} → ${r.action}${dup ? ` (matches "${dup.title}", ${dup.dist}m, id: ${dup.id})` : ''}`)
      }
    }
    if (nearbyFlagged.length > 0) {
      console.log('\nNearby flags (added despite proximity):')
      for (const r of nearbyFlagged) {
        console.log(`  ${r.title} near "${r.nearbyFlag.title}" (${r.nearbyFlag.dist}m)`)
      }
    }
    if (youtubeFound.length > 0) {
      console.log('\nYouTube URLs found (not imported):')
      for (const r of youtubeFound) console.log(`  ${r.title}: ${r.youtubeUrl}`)
    }
    if (failed.length > 0) {
      console.log('\nFailed parks:')
      for (const r of failed) console.log(`  ${r.url}: ${r.error}`)
    }
    return
  }

  // ── SINGLE URL MODE: --url ──
  const mode = updateId ? `UPDATE ${updateId}` : dryRun ? 'DRY RUN' : 'INSERT'
  console.log(`\nSesh Wars — Speak Easy Skate Importer`)
  console.log(`Park URL : ${parkUrl}`)
  console.log(`Mode     : ${mode}`)
  console.log('─'.repeat(70))

  if (updateId) {
    // ── UPDATE ──
    console.log(`\nFetching existing spot ${updateId} ...`)
    const { data: existingSpot, error: fetchErr } = await admin.from('spots').select('*').eq('id', updateId).single()
    if (fetchErr || !existingSpot) throw new Error(`Could not fetch spot: ${fetchErr?.message}`)
    console.log(`  Found: "${existingSpot.title}" (${existingSpot.photos?.length} photos)`)

    const html = await fetchText(parkUrl)
    const { lat, lng, rawTitle, coverUrl, galleryUrls, lighting, lightsTime, youtubeUrl } = parsePage(html)
    if (!rawTitle || !lat || !lng) throw new Error('Missing title or coordinates')

    const title = normalizeTitle(rawTitle)
    const description = (lighting === 'Lights' && lightsTime) ? `Lights on till ${lightsTime}.` : ''
    const slug = existingSpot.slug

    console.log(`  New title: ${title}  Lighting: ${lighting}  Description: "${description}"`)

    const { processed, coverCropRows, duplicatesRemoved } = await processPhotos(coverUrl, galleryUrls, slug)
    console.log(`  Photos: ${processed.length} (${duplicatesRemoved} dupes removed, cover crop ${coverCropRows}r)`)

    const photoUrls = await uploadPhotos(admin, processed)

    const oldPaths = (existingSpot.photos || []).map(storagePathFromUrl).filter(Boolean)
    if (oldPaths.length > 0) {
      await admin.storage.from('spot-photos').remove(oldPaths)
      console.log(`  Deleted ${oldPaths.length} old storage file(s)`)
    }

    const { data: spot, error: upErr } = await admin
      .from('spots').update({ title, description, lighting, photos: photoUrls }).eq('id', updateId).select().single()
    if (upErr || !spot) throw new Error(`Update failed: ${upErr?.message}`)

    console.log('\nUPDATE SUCCESSFUL')
    printSpot(spot)
    process.stdout.write('Verifying photos: ')
    await verifyPhotos(spot.photos)
    if (youtubeUrl) console.log(`YouTube (not imported): ${youtubeUrl}`)
    return
  }

  // ── SINGLE INSERT ──
  const result = await importOnePark({ parkUrl, admin, userId, existingSpots: null, skipUrls: new Set(), visibility: 'public' })
  if (result.action === 'failed') process.exit(1)
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
