import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { profileCache } from './profileCache'

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : '' }

function _resolve(data, user) {
  const first = (data?.first_name || '').trim()
  const last = (data?.last_name || '').trim()
  const username = (data?.username || '').trim()
  const avatar = data?.avatar_url || null
  const f0 = first[0]?.toUpperCase() || ''
  const l0 = last[0]?.toUpperCase() || ''
  const initials = (f0 + l0) || user?.email?.[0]?.toUpperCase() || '?'
  const displayName = (first && last) ? `${cap(first)} ${cap(last)}`
    : first ? cap(first)
    : username || user?.email?.split('@')[0] || ''
  return { username, first_name: first, last_name: last, avatar_url: avatar, initials, displayName, userId: user?.id }
}

function _writeCache(p) {
  profileCache.avatar = p?.avatar_url || null
  profileCache.initials = p?.initials || ''
  profileCache.username = p?.username || ''
}

let _profile = null
let _loadedForUser = null
let _loading = false
const _listeners = new Set()

function _notify() { _listeners.forEach(fn => fn(_profile)) }

export async function loadProfile(user) {
  if (!user?.id) { clearProfile(); return }
  if (_loadedForUser === user.id && _profile) return
  if (_loading) return
  _loading = true
  try {
    const { data } = await supabase
      .from('profiles').select('username, first_name, last_name, avatar_url')
      .eq('id', user.id).maybeSingle()
    _profile = _resolve(data, user)
    _loadedForUser = user.id
    _writeCache(_profile)
    _notify()
  } finally {
    _loading = false
  }
}

export function setProfileDirect(data, user) {
  _profile = _resolve(data, user)
  _loadedForUser = user?.id || null
  _loading = false
  _writeCache(_profile)
  _notify()
}

export async function reloadProfile(user) {
  if (!user?.id) return
  _loadedForUser = null
  _loading = false
  _profile = null
  await loadProfile(user)
}

export function clearProfile() {
  _profile = null
  _loadedForUser = null
  _loading = false
  _writeCache(null)
  _notify()
}

export function useProfileStore() {
  const [profile, setProfile] = useState(_profile)
  useEffect(() => {
    setProfile(_profile)
    _listeners.add(setProfile)
    return () => { _listeners.delete(setProfile) }
  }, [])
  return profile
}
