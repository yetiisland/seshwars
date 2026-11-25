#!/usr/bin/env node
/**
 * Tests the fixed fetchAll + spot index query pattern using the anon key (unauthenticated).
 * Run: node scripts/test-fetch-spots.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://owcaxgklusdofhqncxyh.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93Y2F4Z2tsdXNkb2ZocW5jeHloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTIzMzEsImV4cCI6MjA5MzU2ODMzMX0.nE8n1QOG7hZL9Xi4olOUxiy7XyjQf65xsK_ECH1obE4'

const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const INDEX_COLS = [
  'id', 'slug', 'title', 'type', 'photos',
  'bust_rating', 'lighting', 'features', 'description', 'is_multi_spot',
  'visibility', 'moderation_status', 'added_by',
  'latitude', 'longitude', 'address',
  'created_at',
].join(',')

function logResult(label, res) {
  if (res.error) {
    console.error(`\n[FAIL] ${label}`)
    console.error('  status :', res.status ?? '(none)')
    console.error('  code   :', res.error?.code ?? '(none)')
    console.error('  message:', res.error?.message ?? '(none)')
    console.error('  details:', res.error?.details ?? '(none)')
    console.error('  hint   :', res.error?.hint ?? '(none)')
  } else {
    const count = res.count ?? (Array.isArray(res.data) ? res.data.length : '(no data)')
    console.log(`\n[OK]   ${label} → ${count} rows`)
  }
}

// Fixed fetchAll: sequential pages, no count/HEAD call
async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = []
  let page = 0
  while (true) {
    const from = page * pageSize
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw Object.assign(new Error(`page ${page}: ${error.message}`), { res: { error } })
    if (!data || data.length === 0) break
    rows.push(...data)
    console.log(`       page ${page}: ${data.length} rows (running total: ${rows.length})`)
    if (data.length < pageSize) break
    page++
  }
  return rows
}

async function main() {
  console.log('=== test-fetch-spots.mjs (anon key, unauthenticated) — FIXED VERSION ===\n')

  // 1. Spots: single page with INDEX_COLS (no updated_at) + order
  console.log('--- Test 1: select(INDEX_COLS) + order + range(0,999) ---')
  const t1 = await supabase.from('spots').select(INDEX_COLS).order('created_at', { ascending: false }).order('id').range(0, 999)
  logResult('spots page 0 INDEX_COLS', t1)
  if (!t1.error && t1.data) {
    console.log('  sample columns:', Object.keys(t1.data[0] || {}).join(', '))
  }

  // 2. Full fetchAll for spots
  console.log('\n--- Test 2: full fetchAll for spots ---')
  try {
    const spots = await fetchAll(
      () => supabase.from('spots').select(INDEX_COLS).order('created_at', { ascending: false }).order('id')
    )
    console.log(`\n[OK]   fetchAll spots → ${spots.length} total rows`)
    if (spots.length > 0) {
      console.log('  first spot:', spots[0].title, '|', spots[0].id)
      console.log('  last spot :', spots[spots.length - 1].title, '|', spots[spots.length - 1].id)
    }
  } catch (err) {
    console.error(`\n[FAIL] fetchAll spots: ${err.message}`)
    if (err.res?.error) {
      console.error('  code   :', err.res.error.code)
      console.error('  details:', err.res.error.details)
      console.error('  hint   :', err.res.error.hint)
    }
  }

  // 3. Full fetchAll for spot_reviews
  console.log('\n--- Test 3: full fetchAll for spot_reviews ---')
  try {
    const reviews = await fetchAll(
      () => supabase.from('spot_reviews').select('spot_id,rating').order('id')
    )
    console.log(`\n[OK]   fetchAll spot_reviews → ${reviews.length} total rows`)
  } catch (err) {
    console.error(`\n[FAIL] fetchAll spot_reviews: ${err.message}`)
  }

  // 4. Full fetchAll for spot_reports
  console.log('\n--- Test 4: full fetchAll for spot_reports ---')
  try {
    const reports = await fetchAll(
      () => supabase.from('spot_reports').select('spot_id,report_type,custom_text').order('created_at', { ascending: false }).order('id')
    )
    console.log(`\n[OK]   fetchAll spot_reports → ${reports.length} total rows`)
  } catch (err) {
    console.error(`\n[FAIL] fetchAll spot_reports: ${err.message}`)
  }

  console.log('\n=== done ===')
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
