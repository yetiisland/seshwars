import { supabase } from '../lib/supabase'

const cache = new Map()

export async function getProfiles(userIds) {
  const missing = userIds.filter(id => id && !cache.has(id))
  if (missing.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, first_name, avatar_url')
      .in('id', missing)
    if (data) {
      for (const p of data) cache.set(p.id, p)
    }
  }
  const result = {}
  for (const id of userIds) {
    result[id] = cache.get(id) || null
  }
  return result
}

export function invalidateProfile(userId) {
  cache.delete(userId)
}
