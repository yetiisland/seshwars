#!/usr/bin/env node
/**
 * Fix Valverde Elementary spot:
 * - Replace photos with best selection from all 3 parts
 * - Update features, is_multi_spot
 * - Fix description (remove em dash, add school hours)
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { readFileSync, existsSync } from 'node:fs'
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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DSL_DIR = path.resolve(__dirname, 'import-output/dsl')

function storagePathFromUrl(url) {
  const i = url.indexOf('/spot-photos/')
  return i === -1 ? null : url.slice(i + '/spot-photos/'.length)
}

async function compressImage(buf) {
  return sharp(buf).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()
}

async function uploadPhotos(bufs) {
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
    try {
      const r = await fetch(url, { method: 'HEAD' })
      process.stdout.write(r.ok ? `✓` : `✗(${r.status})`)
    } catch { process.stdout.write('✗(err)') }
  }
  console.log()
}

async function main() {
  const SPOT_ID = '9aaaa089-acd9-4e45-b78f-241b2df7a113'

  // Fetch current spot
  const { data: spot, error: fetchErr } = await admin.from('spots').select('*').eq('id', SPOT_ID).single()
  if (fetchErr || !spot) throw new Error(`Fetch failed: ${fetchErr?.message}`)
  console.log(`Spot: "${spot.title}"`)
  console.log(`Current photos: ${spot.photos?.length}`)
  console.log(`Current features: ${JSON.stringify(spot.features)}`)

  // Selected photos — multi-spot order: 1 of each obstacle first, then extras grouped by obstacle
  // Obstacle 1: Curved circular concrete ledge (around grass) → Ledge
  // Obstacle 2: Curved stairset with concrete hubbas on both sides → Stairs + Hubba
  // Obstacle 3: 10-stair set + black handrail + bank approach → Stairs + Hand Rail + Banks
  // Obstacle 4: Curved amphitheater stairs with handrail → Stairs + Hand Rail
  // Obstacle 5: Small 2-stair section with rail → Stairs + Hand Rail
  // Obstacle 6: Big block concrete ledge (courtyard) → Ledge
  // Obstacle 7: Triangular wooden planter ledge → Ledge
  // Obstacle 8: Long concrete curb along building wall → Curb
  const selectedPhotos = [
    // Round 1: cover photo of each obstacle
    { dir: 'CJ39PGVlVO7',  file: 'photo-01.jpg' }, // O1 curved circular ledge - front view (COVER)
    { dir: 'CJ3-fJdFovM',  file: 'photo-01.jpg' }, // O2 curved stairs+hubbas - front approach
    { dir: 'C_yFZMgpUnG',  file: 'photo-03.jpg' }, // O3 10-stair+rail+bank - front
    { dir: 'C_3PenCpaqU',  file: 'photo-09.jpg' }, // O4 curved amphitheater stairs - clean front
    { dir: 'C_yFZMgpUnG',  file: 'photo-07.jpg' }, // O5 small 2-stair + rail
    { dir: 'C_-32rtJUtY',  file: 'photo-02.jpg' }, // O6 big block ledge - side view
    { dir: 'C_-32rtJUtY',  file: 'photo-08.jpg' }, // O7 triangular wooden ledge - corner view
    { dir: 'C_-32rtJUtY',  file: 'photo-10.jpg' }, // O8 curb along building
    // Round 2: extras grouped by obstacle
    { dir: 'C_8YKsgJ2D1',  file: 'photo-06.jpg' }, // O1 circular ledge close-up (grind marks)
    { dir: 'CJ3-fJdFovM',  file: 'photo-04.jpg' }, // O2 curved stairs+hubba side view
    { dir: 'C_yFZMgpUnG',  file: 'photo-04.jpg' }, // O3 10-stair side view
    { dir: 'C_3PenCpaqU',  file: 'photo-10.jpg' }, // O4 amphitheater stairs wider view
  ]

  // Load photo buffers
  console.log('\nLoading photos...')
  const buffers = []
  for (const { dir, file } of selectedPhotos) {
    const photoPath = path.join(DSL_DIR, dir, file)
    if (!existsSync(photoPath)) throw new Error(`Missing: ${photoPath}`)
    buffers.push(readFileSync(photoPath))
    process.stdout.write('.')
  }
  console.log(`\nLoaded ${buffers.length} photos`)

  // Compress
  console.log('Compressing...')
  const compressed = await Promise.all(buffers.map(b => compressImage(b)))
  console.log('Done.')

  // Delete old photos from storage
  console.log('\nDeleting old photos from storage...')
  const oldPaths = (spot.photos || []).map(storagePathFromUrl).filter(Boolean)
  if (oldPaths.length) {
    const { error: delErr } = await admin.storage.from('spot-photos').remove(oldPaths)
    if (delErr) console.warn(`  Warning: delete error: ${delErr.message}`)
    else console.log(`  Deleted ${oldPaths.length} old photos.`)
  }

  // Upload new photos
  console.log('\nUploading new photos...')
  const newUrls = await uploadPhotos(compressed)
  console.log(`Uploaded ${newUrls.length} photos.`)

  // Features visible in photos (all 8 obstacles):
  // Curved circular ledge, block ledge, triangular wooden ledge → Ledges
  // Multiple stair sets → Stairs
  // Handrails going down stairs at multiple spots → Hand Rail
  // Curved concrete walls running alongside stairs → Hubba
  // Bank/ramp approach at the 10-stair set → Banks
  // Long concrete curb along building wall → Curb
  const newFeatures = ['Ledges', 'Stairs', 'Hand Rail', 'Hubba', 'Banks', 'Curb']

  // Update spot — do NOT change description, title, address, coordinates, bust, credit, visibility
  console.log('\nUpdating spot...')
  const { data: updated, error: updateErr } = await admin
    .from('spots')
    .update({
      photos: newUrls,
      features: newFeatures,
      is_multi_spot: true,
    })
    .eq('id', SPOT_ID)
    .select()
    .single()

  if (updateErr || !updated) {
    // Rollback: delete newly uploaded photos
    await admin.storage.from('spot-photos').remove(newUrls.map(storagePathFromUrl).filter(Boolean)).catch(() => {})
    throw new Error(`Update failed: ${updateErr?.message}`)
  }

  console.log('Updated spot fields:')
  console.log(`  photos       : ${updated.photos?.length}`)
  console.log(`  features     : ${JSON.stringify(updated.features)}`)
  console.log(`  is_multi_spot: ${updated.is_multi_spot}`)

  console.log('\nVerifying photo URLs...')
  process.stdout.write('  ')
  await verifyPhotos(updated.photos)

  console.log('\nPART A COMPLETE')
  console.log(`  Spot ID      : ${SPOT_ID}`)
  console.log(`  Photos before: ${spot.photos?.length} → after: ${updated.photos?.length}`)
  console.log(`  Obstacles    : curved circular ledge, curved stairs+hubbas, 10-stair+rail+bank, amphitheater stairs+rail, small stairs+rail, block ledge, triangular wooden ledge, curb along building`)
  console.log(`  Features     : ${updated.features.join(', ')}`)
}

main().catch(err => {
  console.error('\nFATAL:', err.message)
  process.exit(1)
})
