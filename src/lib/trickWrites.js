import { supabase } from './supabase'

// Cross-component refresh event — dispatched after any trick/trick-list
// write that other mounted screens (TrickListPage, AddToTrickListSheet,
// ProfileView's trick count) need to react to.
export function notifyTricksChanged() {
  window.dispatchEvent(new Event('seshwars:tricks-changed'))
}

// When a user's last trick at a spot is deleted, that spot shouldn't keep
// sitting on any of the user's own trick lists as an empty entry — delete
// every trick_list_spots row for that spot across the user's own lists.
// Bulk delete: zero matches is a legitimate outcome (the spot may not be on
// any list), so only `error` is checked, per docs/supabase-writes.md.
export async function cascadeDeleteOrphanedSpot(userId, spotId) {
  const { data: remaining, error: remainingErr } = await supabase
    .from('user_tricks').select('id').eq('user_id', userId).eq('spot_id', spotId).limit(1)
  if (remainingErr) {
    console.error('[cascadeDeleteOrphanedSpot] remaining-tricks check failed:', remainingErr)
    return
  }
  if (remaining && remaining.length > 0) return

  const { data: ownLists, error: listsErr } = await supabase.from('trick_lists').select('id').eq('user_id', userId)
  if (listsErr) {
    console.error('[cascadeDeleteOrphanedSpot] own-lists lookup failed:', listsErr)
    return
  }
  const listIds = (ownLists || []).map(l => l.id)
  if (listIds.length === 0) return

  const { error } = await supabase.from('trick_list_spots').delete().eq('spot_id', spotId).in('list_id', listIds)
  if (error) console.error('[cascadeDeleteOrphanedSpot] trick_list_spots delete failed:', error)
}
