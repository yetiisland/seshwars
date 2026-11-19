import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// The current user's own accepted friend ids, loaded once at app level via
// the existing get_friends RPC (the same one FriendsView.jsx/
// SendToFriendsSheet.jsx already call) so canSeeInFeeds
// (src/lib/spotVisibility.js) can check friendship without every surface
// fetching it separately. Refreshes on the same seshwars:friends-changed
// event every friend-request mutation already dispatches (send, accept,
// deny, cancel, remove — see AddFriendButton.jsx/FriendsView.jsx/
// ProfileView.jsx) — a couple of those don't actually change the accepted
// set, but refetching on all of them is simpler than filtering by type and
// the RPC is cheap and infrequent. Logged-out users get an empty set.
export function useFriendIds(userId) {
  const [friendIds, setFriendIds] = useState(new Set())

  const refetchFriendIds = useCallback(async () => {
    if (!userId) { setFriendIds(new Set()); return }
    const { data, error } = await supabase.rpc('get_friends')
    if (error) return
    setFriendIds(new Set((data || []).map(f => f.id)))
  }, [userId])

  useEffect(() => { refetchFriendIds() }, [refetchFriendIds])

  useEffect(() => {
    if (!userId) return
    window.addEventListener('seshwars:friends-changed', refetchFriendIds)
    return () => window.removeEventListener('seshwars:friends-changed', refetchFriendIds)
  }, [userId, refetchFriendIds])

  return { friendIds }
}
