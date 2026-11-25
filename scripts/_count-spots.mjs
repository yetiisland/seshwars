import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
function load(p) { try { return Object.fromEntries(readFileSync(p,'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]})) } catch { return {} } }
const env = { ...load('.env'), ...load('.env.import.local') }
const a = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const { count } = await a.from('spots').select('*', { count: 'exact', head: true }).eq('moderation_status','approved')
console.log('approved spots:', count)
const { count: total } = await a.from('spots').select('*', { count: 'exact', head: true })
console.log('total spots:', total)
