import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
function load(p) { try { return Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})) } catch { return {} } }
const env = { ...load('.env'), ...load('.env.import.local') }
const a = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const { data, error } = await a.from('spots')
  .select('id,title,photos,features,is_multi_spot,address,description,bust_rating,latitude,longitude,credit_url')
  .ilike('title','%valverde%')
  .like('credit_url','%denver_spot_locator%')
if (error) { console.error(error); process.exit(1) }
console.log(JSON.stringify(data, null, 2))
