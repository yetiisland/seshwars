import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'

const PAGE_SIZE = 20

function formatCount(n) {
  if (n > 99) return '99+'
  return String(n)
}

export { formatCount }

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const pageRef = useRef(0)

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) { setUnreadCount(0); return }
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null)
    setUnreadCount(count || 0)
  }, [userId])

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!userId) return
    setLoading(true)
    const from = reset ? 0 : pageRef.current * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data: notifs, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (!error && notifs) {
      const actorIds = [...new Set(notifs.filter(n => n.actor_id).map(n => n.actor_id))]
      const spotIds = [...new Set(notifs.filter(n => n.spot_id).map(n => n.spot_id))]
      const [profilesRes, spotsRes] = await Promise.all([
        actorIds.length > 0
          ? supabase.from('profiles').select('id, username, avatar_url, first_name').in('id', actorIds)
          : { data: [] },
        spotIds.length > 0
          ? supabase.from('spots').select('id, title, slug').in('id', spotIds)
          : { data: [] },
      ])
      const profileMap = {}
      for (const p of profilesRes.data || []) profileMap[p.id] = p
      const spotMap = {}
      for (const s of spotsRes.data || []) spotMap[s.id] = s

      const enriched = notifs.map(n => {
        let actorUsername = 'Someone'
        let actorAvatar = null
        if (n.type === 'admin_update') {
          actorUsername = null
        } else if (n.actor_id && profileMap[n.actor_id]) {
          const p = profileMap[n.actor_id]
          actorUsername = p.username || p.first_name || 'Someone'
          actorAvatar = p.avatar_url || null
        }
        const spot = n.spot_id ? spotMap[n.spot_id] : null
        return {
          ...n,
          actorUsername,
          actorAvatar,
          spotTitle: spot?.title || null,
          spotSlug: spot?.slug || null,
        }
      })

      setNotifications(prev => reset ? enriched : [...prev, ...enriched])
      setHasMore(notifs.length === PAGE_SIZE)
      pageRef.current = reset ? 1 : pageRef.current + 1
    }
    setLoading(false)
  }, [userId])

  const markRead = useCallback(async (notificationId) => {
    if (!userId) return false
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_id', userId)
      .select()
    if (error || !data?.length) return false
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read_at: data[0].read_at } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
    return true
  }, [userId])

  const markAllRead = useCallback(async () => {
    if (!userId) return false
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('recipient_id', userId)
      .is('read_at', null)
      .select()
    if (error || !data?.length) return false
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    setUnreadCount(0)
    return true
  }, [userId])

  useEffect(() => {
    fetchUnreadCount()
  }, [fetchUnreadCount])

  useEffect(() => {
    if (!userId) return
    const handleVisibility = () => {
      if (!document.hidden) fetchUnreadCount()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    let capSub
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) fetchUnreadCount()
      }).then(s => { capSub = s }).catch(() => {})
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      capSub?.remove()
    }
  }, [userId, fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    fetchNotifications,
    markRead,
    markAllRead,
    refetchCount: fetchUnreadCount,
  }
}
