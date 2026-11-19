// The one shared check for "can this viewer see this spot in a feed"
// (map, list, search results, nearby) — every surface that used to ask
// "is this spot public" routes through here instead, so admin/owner/
// friend exceptions stay consistent everywhere instead of being
// duplicated (and potentially drifting) per component.
//
// 'friends' behaves exactly like 'unlisted' (hidden from feeds, but
// anyone with the direct link can still open the spot page) except the
// spot owner's own accepted friends also see it in feeds, same as if it
// were public. If a viewer stops being friends with the owner, the spot
// drops back out of their feeds immediately next time this is checked.
export function canSeeInFeeds(spot, viewerId, friendIdSet, isAdmin) {
  if (isAdmin) return true
  if (viewerId && spot.added_by === viewerId) return true
  const vis = spot.visibility || 'public'
  if (vis === 'public') return true
  if (vis === 'friends') return !!(friendIdSet && spot.added_by && friendIdSet.has(spot.added_by))
  return false // 'unlisted' / 'private' / anything else: link-only, never in feeds
}
