import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const LS_SAVED_KEY = 'seshwars_saved_spots'

export function useSpots() {
  const [spots, setSpots] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchSpots = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('spots')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) setSpots(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchSpots() }, [fetchSpots])

  return { spots, loading, refetch: fetchSpots }
}

export function useSavedSpots(userId) {
  const [saved, setSaved] = useState(() => {
    // Initialize from localStorage immediately so guests never start with empty set
    try {
      const stored = JSON.parse(localStorage.getItem(LS_SAVED_KEY) || '[]')
      return new Set(stored)
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    if (userId) {
      supabase
        .from('saved_spots')
        .select('spot_id')
        .eq('user_id', userId)
        .then(({ data, error }) => {
          if (error) {
            console.error('[saved_spots] fetch error:', error)
          } else if (data) {
            setSaved(new Set(data.map(d => d.spot_id)))
          }
        })
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem(LS_SAVED_KEY) || '[]')
        setSaved(new Set(stored))
      } catch {
        setSaved(new Set())
      }
    }
  }, [userId])

  const toggle = useCallback(async (spotId) => {
    if (userId) {
      setSaved(prev => {
        const next = new Set(prev)
        if (next.has(spotId)) {
          next.delete(spotId)
          supabase.from('saved_spots')
            .delete()
            .eq('user_id', userId)
            .eq('spot_id', spotId)
            .then(({ error }) => { if (error) console.error('[saved_spots] delete error:', error) })
        } else {
          next.add(spotId)
          supabase.from('saved_spots')
            .insert({ user_id: userId, spot_id: spotId })
            .then(({ error }) => { if (error) console.error('[saved_spots] insert error:', error) })
        }
        return next
      })
    } else {
      setSaved(prev => {
        const next = new Set(prev)
        if (next.has(spotId)) next.delete(spotId)
        else next.add(spotId)
        try { localStorage.setItem(LS_SAVED_KEY, JSON.stringify([...next])) } catch {}
        return next
      })
    }
  }, [userId])

  return { saved, toggleSave: toggle }
}
