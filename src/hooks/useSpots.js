import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const LS_SAVED_KEY = 'seshwars_saved_spots'
const STALE_MS = 30_000

// Module-level cache so spots survive App unmount/remount (e.g. navigating back from SpotPage)
let _cachedSpots = []
let _spotsReady = false
let _lastFetched = 0
let _lastFingerprint = ''

function spotsFingerprint(arr) {
  return arr.map(s => `${s.id}:${s.updated_at}:${s.report_count}`).join('|')
}

// Patches a single spot into the module-level cache so the next mount of
// App.jsx (e.g. after navigating back from an edit) reads fresh data
// immediately, without waiting on the 30s staleness gate in fetchSpots().
// Preserves computed fields (avg_rating, report_count, ...) that aren't
// part of the raw `spots` row returned by an update.
export function mergeSpotIntoCache(updatedSpot) {
  if (!updatedSpot?.id) return
  _cachedSpots = _cachedSpots.map(s => (s.id === updatedSpot.id ? { ...s, ...updatedSpot } : s))
  _lastFingerprint = spotsFingerprint(_cachedSpots)
}

// Same idea as mergeSpotIntoCache, for a confirmed-successful delete: removes
// the spot from the module-level cache so the next mount of App.jsx (e.g.
// navigating back after deleting) reads its absence immediately, without
// waiting on the 30s staleness gate in fetchSpots().
export function removeSpotFromCache(spotId) {
  if (!spotId) return
  _cachedSpots = _cachedSpots.filter(s => s.id !== spotId)
  _lastFingerprint = spotsFingerprint(_cachedSpots)
}

export function useSpots() {
  const [spots, setSpots] = useState(_cachedSpots)
  const [loading, setLoading] = useState(!_spotsReady)

  const fetchSpots = useCallback(async ({ force = false } = {}) => {
    // Skip if cache is fresh and not forced (prevents re-render on back navigation)
    if (!force && _spotsReady && Date.now() - _lastFetched < STALE_MS) return
    if (!_spotsReady) setLoading(true)
    _lastFetched = Date.now()
    const [spotsRes, reviewsRes, reportsRes] = await Promise.all([
      supabase.from('spots').select('*').order('created_at', { ascending: false }),
      supabase.from('spot_reviews').select('spot_id, rating'),
      supabase.from('spot_reports').select('spot_id, report_type, custom_text').order('created_at', { ascending: false }),
    ])
    if (!spotsRes.error && spotsRes.data) {
      const rMap = {}
      for (const r of (reviewsRes.data || [])) {
        if (!rMap[r.spot_id]) rMap[r.spot_id] = { sum: 0, count: 0 }
        rMap[r.spot_id].sum += r.rating
        rMap[r.spot_id].count++
      }
      const repMap = {}
      for (const r of (reportsRes.data || [])) {
        if (!repMap[r.spot_id]) repMap[r.spot_id] = { count: 0, most_recent: r.report_type, most_recent_custom: r.custom_text }
        repMap[r.spot_id].count++
      }
      const merged = spotsRes.data.map(s => {
        const r = rMap[s.id]
        const rep = repMap[s.id]
        return {
          ...s,
          avg_rating: r ? parseFloat((r.sum / r.count).toFixed(1)) : null,
          rating_count: r ? r.count : 0,
          report_count: rep?.count || 0,
          most_recent_report: rep?.most_recent || null,
          most_recent_report_custom: rep?.most_recent_custom || null,
        }
      })
      const fp = spotsFingerprint(merged)
      if (fp !== _lastFingerprint) {
        _lastFingerprint = fp
        _cachedSpots = merged
        _spotsReady = true
        setSpots(merged)
      } else {
        _spotsReady = true
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSpots() }, [fetchSpots])

  return { spots, loading, refetch: () => fetchSpots({ force: true }) }
}

export function useSavedSpots(userId) {
  const [saved, setSaved] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_SAVED_KEY) || '[]')
      return new Set(stored)
    } catch {
      return new Set()
    }
  })

  // Fetch ALL saved spot_ids for this user, regardless of list — used for icon state
  const refetchSaved = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('saved_spots')
      .select('spot_id')
      .eq('user_id', userId)
    if (!error && data) setSaved(new Set(data.map(d => d.spot_id)))
  }, [userId])

  useEffect(() => {
    if (userId) {
      refetchSaved()
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem(LS_SAVED_KEY) || '[]')
        setSaved(new Set(stored))
      } catch {
        setSaved(new Set())
      }
    }
  }, [userId, refetchSaved])

  return { saved, refetchSaved }
}

export function useHiddenSpots(userId) {
  const [hiddenIds, setHiddenIds] = useState(new Set())

  const refetchHidden = useCallback(async () => {
    if (!userId) { setHiddenIds(new Set()); return }
    const { data } = await supabase.from('hidden_spots').select('spot_id').eq('user_id', userId)
    if (data) setHiddenIds(new Set(data.map(d => d.spot_id)))
  }, [userId])

  useEffect(() => { refetchHidden() }, [refetchHidden])

  // Single source of truth for hide/unhide — every caller (map peek card,
  // list card, Hidden Spots page) goes through these so hiddenIds updates
  // once and every consumer re-renders from it, no refetch/reload needed.
  // A blocked RLS write returns { data: [], error: null } and would look
  // like success if we trusted `error` alone — chain .select() and require
  // a non-empty result before touching local state.
  const hideSpot = useCallback(async (spotId) => {
    if (!userId) return { error: new Error('Not signed in') }
    const { data, error } = await supabase
      .from('hidden_spots')
      .insert({ user_id: userId, spot_id: spotId })
      .select()
    if (error) return { error }
    if (!data || data.length === 0) return { error: new Error('Hide was not applied') }
    setHiddenIds(prev => new Set(prev).add(spotId))
    return { error: null }
  }, [userId])

  const unhideSpot = useCallback(async (spotId) => {
    if (!userId) return { error: new Error('Not signed in') }
    const { data, error } = await supabase
      .from('hidden_spots')
      .delete()
      .eq('user_id', userId)
      .eq('spot_id', spotId)
      .select()
    if (error) return { error }
    if (!data || data.length === 0) return { error: new Error('Unhide was not applied') }
    setHiddenIds(prev => {
      const next = new Set(prev)
      next.delete(spotId)
      return next
    })
    return { error: null }
  }, [userId])

  return { hiddenIds, refetchHidden, hideSpot, unhideSpot }
}
