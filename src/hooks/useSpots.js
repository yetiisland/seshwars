import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const LS_SAVED_KEY = 'seshwars_saved_spots'

// Module-level cache so spots survive App unmount/remount (e.g. navigating back from SpotPage)
let _cachedSpots = []
let _spotsReady = false

export function useSpots() {
  const [spots, setSpots] = useState(_cachedSpots)
  const [loading, setLoading] = useState(!_spotsReady)

  const fetchSpots = useCallback(async () => {
    if (!_spotsReady) setLoading(true)
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
      _cachedSpots = merged
      _spotsReady = true
      setSpots(merged)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSpots() }, [fetchSpots])

  return { spots, loading, refetch: fetchSpots }
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
