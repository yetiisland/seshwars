import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { supabase } from '../lib/supabase'
import { compressImage } from '../utils/compressImage'
import { useProfileStore, setProfileDirect, reloadProfile } from '../lib/profileStore'
import Navbar from '../components/Navbar'
import TabBar from '../components/TabBar'
import SpotCard from '../components/SpotCard'
import TermsOfService from './TermsOfService'
import PrivacyPolicy from './PrivacyPolicy'
import SupportPage from './SupportPage'
import DeleteAccountPage from './DeleteAccountPage'
import ImageCropModal from '../components/ImageCropModal'
import FriendsView from '../components/FriendsView'
import TrickListPage from './TrickListPage'
import AddFriendButton from '../components/AddFriendButton'
import { ListIcon, ProfileIcon, HiddenEyeIcon } from '../components/Icons'
import { transformImageUrl } from '../utils/imageUrl'
import { openLocationSettings } from '../lib/locationSettings'

const BOTTOM_PAD = 'calc(80px + env(safe-area-inset-bottom))'

let _mySpotsScrollTop = 0

// Module-level trick-count cache — same event-refresh approach as
// SavedView.jsx's list-count cache. A trick can be added/toggled/deleted
// from a spot's own page (a separate route, not nested under ProfileView),
// so a plain mount-time fetch would go stale the moment the user navigates
// away and back without this component hearing about it directly.
// invalidateTrickCounts() is wired to an always-on module-scope listener
// below, so the next mount sees fresh data regardless of whether
// ProfileView happened to be mounted when the change was made.
let _cachedTrickCounts = { landed: 0, total: 0 }
let _trickCountsUserId = null

export function invalidateTrickCounts() {
  _trickCountsUserId = null
}

if (typeof window !== 'undefined') {
  window.addEventListener('seshwars:tricks-changed', invalidateTrickCounts)
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 4) return `${w}w ago`
  const mo = Math.floor(d / 30.44)
  if (mo < 12) return `${mo}mo ago`
  const y = Math.floor(d / 365.25)
  return `${y}y ago`
}

function notifMessage(n) {
  if (n.type === 'admin_update') return 'Updates have been made to your spot by the Sesh Wars Admin Account'
  const who = n.actorUsername || 'Someone'
  if (n.type === 'rating') return `${who} rated your spot`
  if (n.type === 'comment') return `${who} commented on your spot`
  if (n.type === 'report') return `${who} reported your spot`
  return `${who} interacted with your spot`
}

export default function ProfileView({ user, spots, onAddSpot, showNav = true, onSearch, searchOverlay, userLocation, locationPermission, requestLocation, saved, onSavePress, onSpotClick, onListClick, onTrickListClick, notifications = [], unreadCount = 0, notifLoading = false, notifHasMore = false, onFetchNotifications, onMarkNotificationRead, onMarkAllNotificationsRead, onTabChange, hiddenIds, onUnhideSpot, openTrickListId, onOpenTrickListIdHandled }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [mode, setMode] = useState('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showMySpots, setShowMySpots] = useState(() => sessionStorage.getItem('mySpots:open') === '1')
  const [showFriendsScreen, setShowFriendsScreen] = useState(false)
  const [showTrickList, setShowTrickList] = useState(false)

  // VIEW TRICK LIST from a spot page's Add To Trick List sheet — same
  // deep-link shape as openListId/onOpenListIdHandled for shared spot
  // lists (App.jsx sets this from sessionStorage on remount after
  // navigating back from /spots/:slug).
  useEffect(() => {
    if (openTrickListId) setShowTrickList(true)
  }, [openTrickListId])
  const [trickCounts, setTrickCounts] = useState(() => _trickCountsUserId === user?.id ? _cachedTrickCounts : { landed: 0, total: 0 })
  const [friendCount, setFriendCount] = useState(0)
  const [friendReqState, setFriendReqState] = useState({})
  const [showNotifications, setShowNotifications] = useState(false)
  // Snapshot of which notification ids were unread at the moment this visit
  // opened — captured BEFORE mark_notifications_read runs, so cards keep
  // their unread styling/section for this visit even though the server-side
  // read_at column gets set out from under them a moment later. Recomputed
  // fresh on every open (see openNotifications below), so the next visit
  // correctly shows yesterday's notifications as read while anything new
  // since then still renders as unread.
  const [unreadSnapshot, setUnreadSnapshot] = useState(() => new Set())
  const [viewProfileFor, setViewProfileFor] = useState(null) // { id, username, avatar_url, friendshipStatus } | null
  // Update password modal state
  const [showEditSheet, setShowEditSheet] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [pwModalClosing, setPwModalClosing] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)
  const [showPassAuth, setShowPassAuth] = useState(false)
  const [showPwCurrent, setShowPwCurrent] = useState(false)
  const [showPwNew, setShowPwNew] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)
  const mySpotsScrollRef = useRef(null)
  const mySpotsScrollRestoredRef = useRef(false)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769)
  const [showFeedbackSheet, setShowFeedbackSheet] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSending, setFeedbackSending] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [showTos, setShowTos] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showSupport, setShowSupport] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteAccountPage, setShowDeleteAccountPage] = useState(false)
  const [showSettingsSheet, setShowSettingsSheet] = useState(false)
  const [showHiddenSpots, setShowHiddenSpots] = useState(false)
  const [unhideTarget, setUnhideTarget] = useState(null)
  const [showUnhideConfirm, setShowUnhideConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [locationToast, setLocationToast] = useState('')

  const handleTurnOnLocation = () => {
    if (!openLocationSettings()) {
      setLocationToast('Re-enable location for this app in your browser or device settings.')
      setTimeout(() => setLocationToast(''), 4000)
    }
  }

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 769)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const fetchFriendCount = () => {
    if (!user?.id) return
    supabase.rpc('get_friend_count').then(({ data, error }) => {
      if (error) return
      const count = typeof data === 'number' ? data : (data?.[0]?.count ?? data?.count ?? 0)
      setFriendCount(count)
    })
  }

  useEffect(() => {
    fetchFriendCount()
  }, [user?.id])

  const fetchTrickCounts = async () => {
    if (!user?.id) return
    const { data, error } = await supabase.from('user_tricks').select('landed').eq('user_id', user.id)
    if (error || !data) return
    const counts = { landed: data.filter(t => t.landed).length, total: data.length }
    _cachedTrickCounts = counts
    _trickCountsUserId = user.id
    setTrickCounts(counts)
  }

  useEffect(() => {
    if (!user?.id) return
    if (_trickCountsUserId === user.id) return
    fetchTrickCounts()
  }, [user?.id])

  // Live refresh while mounted — mirrors SavedView.jsx's dual-listener
  // approach: the module-scope listener above keeps the cache correct for
  // the next mount, this one updates the number on screen immediately if
  // ProfileView happens to already be open when a trick changes.
  useEffect(() => {
    const handler = () => fetchTrickCounts()
    window.addEventListener('seshwars:tricks-changed', handler)
    return () => window.removeEventListener('seshwars:tricks-changed', handler)
  }, [user?.id])

  // seshwars:friends-changed — same event-refresh approach as
  // seshwars:lists-changed/seshwars:tricks-changed: every friendship add/
  // accept/deny/cancel/remove dispatches this (AddFriendButton, FriendsView,
  // the notification-card accept/deny below), so the count updates
  // immediately regardless of where the action happened.
  useEffect(() => {
    const handler = () => fetchFriendCount()
    window.addEventListener('seshwars:friends-changed', handler)
    return () => window.removeEventListener('seshwars:friends-changed', handler)
  }, [user?.id])

  // Older fallback coverage for the same thing, kept alongside the event
  // above: refetch on coming back from the Friends screen, and on the app
  // regaining focus (same visibilitychange/appStateChange signal
  // useNotifications.js uses for the unread badge).
  const prevShowFriendsScreenRef = useRef(false)
  useEffect(() => {
    if (prevShowFriendsScreenRef.current && !showFriendsScreen) {
      fetchFriendCount()
    }
    prevShowFriendsScreenRef.current = showFriendsScreen
  }, [showFriendsScreen])

  useEffect(() => {
    if (!user?.id) return
    const handleVisibility = () => {
      if (!document.hidden) fetchFriendCount()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    let capSub
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) fetchFriendCount()
      }).then(s => { capSub = s }).catch(() => {})
    }
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      capSub?.remove()
    }
  }, [user?.id])

  const storeProfile = useProfileStore()
  const [editDraft, setEditDraft] = useState(null)
  const [editProfileError, setEditProfileError] = useState('')
  const [saving, setSaving] = useState(false)
  const [cropFile, setCropFile] = useState(null)
  const [avatarError, setAvatarError] = useState('')
  const avatarRef = useRef()

  const mySpots = spots.filter(s => s.added_by === user?.id)
  const hiddenSpots = spots.filter(s => hiddenIds.has(s.id))

  const confirmUnhide = async () => {
    if (!unhideTarget) return
    const { error } = await onUnhideSpot(unhideTarget.id)
    if (error) {
      console.error('unhide failed:', error)
      alert('Could not unhide this spot: ' + error.message)
      return
    }
    setShowUnhideConfirm(false)
    setUnhideTarget(null)
  }

  useEffect(() => {
    if (!showMySpots) { mySpotsScrollRestoredRef.current = false; return }
    if (mySpotsScrollRestoredRef.current) return
    if (!mySpotsScrollRef.current) return
    if (mySpots.length > 0) {
      mySpotsScrollRef.current.scrollTop = _mySpotsScrollTop
      mySpotsScrollRestoredRef.current = true
    }
  }, [showMySpots, mySpots.length])

  const handleAuth = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message) }
      else {
        setMessage('Check your email to confirm your account!')
        if (data?.user) {
          const { data: profileRow, error: profileErr } = await supabase.from('profiles').upsert({
            id: data.user.id,
            username: email.split('@')[0],
            first_name: firstName,
            last_name: lastName,
          }).select()
          if (profileErr || !profileRow || profileRow.length === 0) {
            console.error('[ProfileView] signup profile upsert failed:', profileErr)
            // Keep the "check your email" success message — the account was
            // created — but also surface that the profile details didn't save.
            setError('Your profile details could not be saved. You can update them after signing in.')
          }
        }
      }
    }
    setLoading(false)
  }

  const handleSaveProfile = async () => {
    if (!user?.id || !editDraft) return
    setSaving(true)
    setEditProfileError('')
    const { data, error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: editDraft.username,
      first_name: editDraft.first_name,
      last_name: editDraft.last_name,
    }).select().single()
    setSaving(false)
    if (error || !data) {
      console.error('[ProfileView] handleSaveProfile failed:', error)
      setEditProfileError('Could not save your profile. Try again.')
      return
    }
    setProfileDirect({ ...storeProfile, ...editDraft }, user)
    setEditDraft(null)
    setShowEditSheet(false)
  }

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    e.target.value = ''
    setCropFile(file)
  }

  const handleCropConfirm = async (croppedFile) => {
    setCropFile(null)
    if (!user?.id) return
    setAvatarError('')
    let compressed
    try {
      compressed = await compressImage(croppedFile, 250, 0.8)
    } catch {
      return
    }
    const newPath = `${user.id}_${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('avatars').upload(newPath, compressed, { contentType: 'image/jpeg' })
    if (upErr) return
    const oldUrl = storeProfile?.avatar_url
    if (oldUrl) {
      try {
        const parts = oldUrl.split('/object/public/avatars/')
        if (parts.length > 1) {
          const oldPath = decodeURIComponent(parts[1].split('?')[0])
          if (oldPath) await supabase.storage.from('avatars').remove([oldPath])
        }
      } catch {}
    }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(newPath)
    const { data, error } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: publicUrl }).select()
    if (error || !data || data.length === 0) {
      console.error('[ProfileView] avatar upload upsert failed:', error)
      setAvatarError('Could not save your new photo. Try again.')
      return
    }
    setProfileDirect({ ...storeProfile, avatar_url: publicUrl }, user)
  }

  const handleRemoveAvatar = async () => {
    if (!user?.id) return
    setAvatarError('')
    const oldUrl = storeProfile?.avatar_url
    if (oldUrl) {
      try {
        const parts = oldUrl.split('/object/public/avatars/')
        if (parts.length > 1) {
          const oldPath = decodeURIComponent(parts[1].split('?')[0])
          if (oldPath) await supabase.storage.from('avatars').remove([oldPath])
        }
      } catch {}
    }
    const { data, error } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: null }).select()
    if (error || !data || data.length === 0) {
      console.error('[ProfileView] avatar removal upsert failed:', error)
      setAvatarError('Could not remove your photo. Try again.')
      return
    }
    setProfileDirect({ ...storeProfile, avatar_url: null }, user)
  }

  const EyeIcon = ({ visible }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {visible ? (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      )}
    </svg>
  )

  const openEditSheet = () => {
    setEditDraft({ username: storeProfile.username, first_name: storeProfile.first_name, last_name: storeProfile.last_name })
    setEditProfileError('')
    setShowEditSheet(true)
  }
  const closeEditSheet = () => {
    setShowEditSheet(false)
    setEditDraft(null)
    setEditProfileError('')
  }

  const openSettingsSheet = () => setShowSettingsSheet(true)
  const closeSettingsSheet = () => setShowSettingsSheet(false)

  const openPasswordModal = () => {
    setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwError(''); setPwSuccess(false)
    setShowPwCurrent(false); setShowPwNew(false); setShowPwConfirm(false)
    setShowPasswordModal(true)
  }
  const closePasswordModal = () => {
    setPwModalClosing(true)
    setTimeout(() => { setPwModalClosing(false); setShowPasswordModal(false) }, 180)
  }
  const handleUpdatePassword = async () => {
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match.'); return }
    if (pwNew.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    setPwError(''); setPwLoading(true)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwCurrent })
    if (authErr) { setPwError('Current password is incorrect.'); setPwLoading(false); return }
    const { error: updateErr } = await supabase.auth.updateUser({ password: pwNew })
    setPwLoading(false)
    if (updateErr) { setPwError(updateErr.message); return }
    setPwSuccess(true)
    setTimeout(() => closePasswordModal(), 1800)
  }

  const openNotifications = async () => {
    setShowNotifications(true)
    // Always refetch (not just on first open this session) so a notification
    // that arrived since the last visit is actually in the list — otherwise
    // it would never appear at all, let alone under the wrong section.
    const fresh = await onFetchNotifications?.(true)
    const unreadIds = (fresh || notifications).filter(n => !n.read_at).map(n => n.id)
    setUnreadSnapshot(new Set(unreadIds))
    // Captured the pre-read snapshot above before this fires.
    onMarkAllNotificationsRead?.()
  }

  // Minimal read-only profile preview for a friend_request/friend_accepted
  // notification's VIEW button — no dedicated "other user's profile" page
  // exists in the app yet, so this reuses the existing modal-sheet pattern
  // plus AddFriendButton (which already renders whatever action is valid
  // for the current friendship status, never one that would fail).
  const openUserProfile = (n) => {
    const status = n.type === 'friend_accepted' ? 'accepted'
      : friendReqState[n.id]?.resolved === 'accepted' ? 'accepted'
      : friendReqState[n.id]?.resolved === 'ignored' ? null
      : 'pending'
    setViewProfileFor({ id: n.actor_id, username: n.actorUsername, avatar_url: n.actorAvatar, friendshipStatus: status })
  }

  const handleNotifTap = async (notif) => {
    if (notif.type === 'friend_request' || notif.type === 'friend_accepted') {
      await onMarkNotificationRead?.(notif.id)
      openUserProfile(notif)
      return
    }
    if (notif.type === 'list_invite') {
      if (!notif.list_id) return
      await onMarkNotificationRead?.(notif.id)
      onListClick?.(notif.list_id)
      return
    }
    if (notif.type === 'trick_list_invite') {
      if (!notif.trick_list_id) return
      await onMarkNotificationRead?.(notif.id)
      onTrickListClick?.(notif.trick_list_id)
      return
    }
    if (!notif.spotSlug && !notif.spot_id) return
    await onMarkNotificationRead?.(notif.id)
    const fullSpot = spots.find(s => s.id === notif.spot_id) || { slug: notif.spotSlug, id: notif.spot_id }
    const isCommentNotif = notif.type === 'comment_mention' || notif.type === 'comment_reply'
    onSpotClick?.(fullSpot, isCommentNotif && notif.comment_id ? { scrollToCommentId: notif.comment_id } : {})
  }

  // 'friend_request' notification cards resolve a pending friendships row
  // by (requester_id = actor, addressee_id = me, status = 'pending') on
  // demand — the notification row itself carries no friendship_id.
  const findPendingFriendshipForNotif = async (n) => {
    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .eq('requester_id', n.actor_id)
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .maybeSingle()
    if (error || !data) return null
    return data.id
  }

  // Friend-request cards must reflect the real, current friendship status —
  // not just whether *this card* resolved it — since the same request can
  // be accepted/denied from the Friends page (or another device) without
  // this screen hearing about it. Bulk-checks every not-yet-checked
  // friend_request notification's actor against the live friendships table
  // as soon as it shows up in `notifications`, so a stale ACCEPT/DENY pair
  // that would just fail never renders.
  const friendReqCheckedRef = useRef(new Set())
  const checkFriendRequestStatuses = async (notifs) => {
    if (!user?.id) return
    const actorIds = [...new Set(notifs.map(n => n.actor_id).filter(Boolean))]
    if (actorIds.length === 0) return
    const { data, error } = await supabase
      .from('friendships')
      .select('requester_id, status')
      .in('requester_id', actorIds)
      .eq('addressee_id', user.id)
    if (error || !data) return
    const statusByActor = {}
    for (const row of data) statusByActor[row.requester_id] = row.status
    setFriendReqState(s => {
      const next = { ...s }
      for (const n of notifs) {
        const st = statusByActor[n.actor_id]
        if (st === 'pending') continue // genuinely still pending — leave Accept/Deny showing
        // Accepted elsewhere -> show "Accepted". No row (denied/cancelled)
        // or any other status -> same "Ignored" display the Deny button
        // already produces; never leave a now-stale Accept/Deny visible.
        next[n.id] = { ...(next[n.id] || {}), resolved: st === 'accepted' ? 'accepted' : 'ignored' }
      }
      return next
    })
  }

  useEffect(() => {
    const toCheck = notifications.filter(n => n.type === 'friend_request' && n.actor_id && !friendReqCheckedRef.current.has(n.id))
    // friend_request notifications whose actor's account was since deleted
    // (actor_id cascades to null, not the notification row itself) have no
    // friendships row left to check — that table cascades away with the
    // deleted actor too — so there's nothing to accept/deny. Resolve them
    // locally instead of leaving a stale Accept/Deny pair that would just
    // fail (findPendingFriendshipForNotif queries eq('requester_id', null),
    // which never matches).
    const orphaned = notifications.filter(n => n.type === 'friend_request' && !n.actor_id && !friendReqCheckedRef.current.has(n.id))
    if (orphaned.length > 0) {
      orphaned.forEach(n => friendReqCheckedRef.current.add(n.id))
      setFriendReqState(s => {
        const next = { ...s }
        for (const n of orphaned) next[n.id] = { ...(next[n.id] || {}), resolved: 'ignored' }
        return next
      })
    }
    if (toCheck.length === 0) return
    toCheck.forEach(n => friendReqCheckedRef.current.add(n.id))
    checkFriendRequestStatuses(toCheck)
  }, [notifications, user?.id])

  const handleAcceptFriendRequestNotif = async (n) => {
    setFriendReqState(s => ({ ...s, [n.id]: { ...s[n.id], loading: true, error: '' } }))
    const rowId = await findPendingFriendshipForNotif(n)
    if (!rowId) {
      setFriendReqState(s => ({ ...s, [n.id]: { loading: false, resolved: null, error: 'Could not accept request' } }))
      return
    }
    const { data, error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', rowId)
      .select()
      .single()
    if (error || !data) {
      setFriendReqState(s => ({ ...s, [n.id]: { loading: false, resolved: null, error: 'Could not accept request' } }))
      return
    }
    setFriendReqState(s => ({ ...s, [n.id]: { loading: false, resolved: 'accepted', error: '' } }))
    fetchFriendCount()
    window.dispatchEvent(new Event('seshwars:friends-changed'))
  }

  const handleIgnoreFriendRequestNotif = async (n) => {
    setFriendReqState(s => ({ ...s, [n.id]: { ...s[n.id], loading: true, error: '' } }))
    const rowId = await findPendingFriendshipForNotif(n)
    if (!rowId) {
      setFriendReqState(s => ({ ...s, [n.id]: { loading: false, resolved: null, error: 'Could not ignore request' } }))
      return
    }
    const { data, error } = await supabase.from('friendships').delete().eq('id', rowId).select()
    if (error || !data || data.length === 0) {
      console.error('[ProfileView] handleIgnoreFriendRequestNotif delete failed:', error)
      setFriendReqState(s => ({ ...s, [n.id]: { loading: false, resolved: null, error: 'Could not ignore request' } }))
      return
    }
    setFriendReqState(s => ({ ...s, [n.id]: { loading: false, resolved: 'ignored', error: '' } }))
    window.dispatchEvent(new Event('seshwars:friends-changed'))
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  const handleDeleteAccount = async () => {
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const { error } = await supabase.functions.invoke('delete-account')
      if (error) throw error
      await supabase.auth.signOut()
    } catch (e) {
      setDeleteError(e.message || 'Failed to delete account. Please try again.')
      setDeleteLoading(false)
    }
  }

  const handleSendFeedback = async () => {
    if (!feedbackText.trim() || feedbackSending) return
    setFeedbackSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-feedback', {
        body: {
          feedback: feedbackText.trim(),
          senderEmail: user?.email || '',
          firstName: storeProfile?.first_name || '',
          lastName: storeProfile?.last_name || '',
          username: storeProfile?.username || '',
        },
      })
    } catch {
    }
    setFeedbackSending(false)
    setFeedbackSent(true)
    setFeedbackText('')
    setTimeout(() => {
      setShowFeedbackSheet(false)
      setFeedbackSent(false)
    }, 1800)
  }

  if (!user) {
    return (
      <>
        {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
        {searchOverlay || (
        <div className="scroll-area">
          <div style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480, margin: '0 auto', width: '100%' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {mode === 'login' ? 'Sign In' : 'Join the Crew'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {mode === 'login' ? 'Sign in to save spots and drop new ones.' : 'Create an account to start adding spots.'}
            </div>
            {mode === 'signup' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-input" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} />
                <input className="form-input" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            )}
            <input className="form-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <div style={{ position: 'relative' }}>
              <input className="form-input" type={showPassAuth ? 'text' : 'password'} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()}
                style={{ paddingRight: 44 }} />
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPassAuth(v => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9a8878', display: 'flex', alignItems: 'center' }}
                tabIndex={-1}>
                <EyeIcon visible={!showPassAuth} />
              </button>
            </div>
            {error && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{error}</div>}
            {message && <div style={{ fontSize: 11, color: '#d4785a', fontWeight: 700 }}>{message}</div>}
            <button className="btn-salmon" onClick={handleAuth} disabled={loading}>
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}>
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </div>
          </div>
          <div style={{ height: BOTTOM_PAD }} />
        </div>
        )}
      </>
    )
  }

  const displayName = storeProfile?.first_name
    ? `${storeProfile.first_name}${storeProfile.last_name ? ' ' + storeProfile.last_name : ''}`
    : storeProfile?.username || ''

  if (!storeProfile) return null

  return (
    <>
      {showNav && <Navbar onAddSpot={onAddSpot} onSearch={onSearch} />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {searchOverlay || (
      <>
      <div className="scroll-area">
        <div style={{ padding: '24px 14px 0', maxWidth: 480, margin: '0 auto', width: '100%' }}>

          {/* Avatar + name — always rendered (all 3 tabs), so the segmented
              control below it stays usable for tab-switching regardless of
              which tab is active. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div
                onClick={() => avatarRef.current?.click()}
                style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECEDF2', border: '2px solid #C8CAD4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
              >
                {storeProfile.avatar_url ? (
                  <img src={storeProfile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#6a6c7a' }}>
                    {storeProfile.initials}
                  </span>
                )}
              </div>
              {editDraft && (
                <div
                  onClick={() => avatarRef.current?.click()}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.42)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M14.5 5.5l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              {storeProfile.avatar_url && editDraft && (
                <div onClick={handleRemoveAvatar} style={{ position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: '50%', background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /><line x1="7" y1="1" x2="1" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                </div>
              )}
              <input ref={avatarRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</div>
              {storeProfile.username && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>@{storeProfile.username}</div>}
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 1 }}>{user.email}</div>
            </div>
            {/* Settings + Bell cluster */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {/* Gear icon — settings */}
              <div
                onClick={openSettingsSheet}
                style={{ width: 36, height: 36, borderRadius: 6, border: '1.5px solid #d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="3" stroke="#d4785a" strokeWidth="1.8" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#d4785a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              {/* Bell icon — notifications */}
              <div
                onClick={openNotifications}
                style={{ position: 'relative', width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#FDF8F0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" stroke="#FDF8F0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {unreadCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -6, right: -6,
                    minWidth: 17, height: 17, borderRadius: 9,
                    background: '#FDF8F0', border: '1.5px solid #d4785a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#d4785a', lineHeight: 1 }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {avatarError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: -8, marginBottom: 12 }}>{avatarError}</div>}

          {/* Stat cards — 2x2 grid, same card style/gap as the original
              Spots Added / Spots Hidden pair (#FFFFFF bg, #EAD8C8 border,
              radius 6, padding 12px 14px, gap 12). Row 2 (Trick List,
              Friends) routes to their own full-screen pages instead of the
              removed Spots/Tricks/Friends segmented control. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div
              onClick={() => { sessionStorage.setItem('mySpots:open', '1'); setShowMySpots(true) }}
              style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="22" viewBox="0 0 20 24" fill="none">
                  <path d="M10 0C4.5 0 0 4.5 0 10C0 13.5 2 16.5 10 24C18 16.5 20 13.5 20 10C20 4.5 15.5 0 10 0Z" fill="#d4785a" />
                  <circle cx="10" cy="10" r="4" fill="#fff" />
                </svg>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--salmon)' }}>{mySpots.length}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Spots Added</div>
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div
              onClick={() => setShowHiddenSpots(true)}
              style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <HiddenEyeIcon color="#d4785a" size={16} slashed={false} />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--salmon)' }}>{hiddenSpots.length}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Spots Hidden</div>
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div
              onClick={() => setShowTrickList(true)}
              style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ListIcon color="#d4785a" size={18} filled />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--salmon)' }}>{trickCounts.landed}/{trickCounts.total}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Trick List</div>
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div
              onClick={() => setShowFriendsScreen(true)}
              style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ProfileIcon color="#d4785a" size={18} filled />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--salmon)' }}>{friendCount}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Friends</div>
                </div>
              </div>
              <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Persistent location CTA — only while permission is actually
              denied (never granted/prompt/unsupported). */}
          {locationPermission === 'denied' && (
            <button className="btn-salmon" onClick={handleTurnOnLocation} style={{ marginTop: 20 }}>
              Turn On Location
            </button>
          )}
          <div style={{ height: BOTTOM_PAD }} />

          {/* Feedback bottom sheet — portalled above bottom nav; opened from
              the Settings sheet's Send Feedback row now (Section E). Lives
              outside the spots-tab fragment (along with Settings/ToS/
              Privacy/Support/Delete-account below) so they stay reachable
              regardless of which tab is active, since the header that
              triggers them is now rendered for all 3 tabs. */}
          {showFeedbackSheet && createPortal(
            <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
                background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
              }}>
                <div onClick={() => setShowFeedbackSheet(false)} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Send Feedback</div>
                <div style={{ width: 36 }} />
              </div>
              <div className="scroll-area">
                <div style={{ padding: '16px 16px 28px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
                  {feedbackSent ? (
                    <div style={{ fontSize: 13, color: '#4a9a5a', fontWeight: 700, textAlign: 'center', padding: '20px 0' }}>
                      Thanks! Your feedback was sent.
                    </div>
                  ) : (
                    <>
                      <textarea
                        className="form-input"
                        placeholder="Share your feedback, ideas, or report a bug..."
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        style={{ marginBottom: 12, minHeight: 100, resize: 'none' }}
                        autoFocus
                      />
                      <button
                        onClick={handleSendFeedback}
                        disabled={feedbackSending || !feedbackText.trim()}
                        style={{ width: '100%', padding: '13px 16px', borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: (!feedbackText.trim() || feedbackSending) ? 0.5 : 1 }}
                      >
                        {feedbackSending ? 'Sending...' : 'Send'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}

          <div style={{ height: BOTTOM_PAD }} />
          {cropFile && <ImageCropModal imageFile={cropFile} onConfirm={handleCropConfirm} onCancel={() => setCropFile(null)} />}

          {/* Settings — full page (Section E), reached from the gear icon.
              Rows below navigate to their own pages without closing this
              one, so the back arrow on each destination returns here. */}
          {showSettingsSheet && createPortal(
            <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
                background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
              }}>
                <div onClick={closeSettingsSheet} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Settings</div>
                <div style={{ width: 36 }} />
              </div>
              <div className="scroll-area">
                <div style={{ padding: '16px 16px 28px', maxWidth: 480, margin: '0 auto', width: '100%' }}>
                  {/* ACCOUNT — card/list-row style copied from the stat tiles
                      and notification cards (#FFFFFF bg, #EAD8C8 border,
                      borderRadius 10, same chevron svg) */}
                  <div className="section-label">Account</div>
                  <div
                    onClick={openEditSheet}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Edit Profile</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div
                    onClick={openNotifications}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Notifications</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div
                    onClick={() => setShowHiddenSpots(true)}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Hidden Spots</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div
                    onClick={() => setShowDeleteAccountPage(true)}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Delete Account</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* SUPPORT — "Terms and privacy" is Terms of Service +
                      Privacy Policy as two rows (they're separate existing
                      pages with no combined view to route a single row to) */}
                  <div className="section-label">Support</div>
                  <div
                    onClick={() => setShowFeedbackSheet(true)}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Send Feedback</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div
                    onClick={() => setShowTos(true)}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Terms of Service</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div
                    onClick={() => setShowPrivacy(true)}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Privacy Policy</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div
                    onClick={() => setShowSupport(true)}
                    style={{ background: '#FFFFFF', border: '1px solid #EAD8C8', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Support</span>
                    <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
                      <path d="M1 1L7 7L1 13" stroke="#d4785a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="divider" style={{ margin: '16px 0' }} />
                  <button
                    className="btn-salmon"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
          {showTos && createPortal(<TermsOfService onClose={() => setShowTos(false)} />, document.body)}
          {showPrivacy && createPortal(<PrivacyPolicy onClose={() => setShowPrivacy(false)} />, document.body)}
          {showSupport && createPortal(<SupportPage onClose={() => setShowSupport(false)} />, document.body)}
          {showDeleteAccountPage && createPortal(<DeleteAccountPage onClose={() => setShowDeleteAccountPage(false)} onDeleteClick={() => setShowDeleteConfirm(true)} />, document.body)}
          {showDeleteConfirm && createPortal(
            <div
              className="modal-overlay"
              onClick={() => !deleteLoading && setShowDeleteConfirm(false)}
              style={{ position: 'fixed', zIndex: 1000000 }}
            >
              <div
                className="modal-sheet"
                onClick={e => e.stopPropagation()}
                style={{ paddingLeft: 20, paddingRight: 20, paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)' }}
              >
                <div className="modal-handle" />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div className="modal-title">Delete Account</div>
                  <div
                    onClick={() => !deleteLoading && setShowDeleteConfirm(false)}
                    style={{ width: 28, height: 28, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                      <line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
                  Are you sure? This permanently deletes your account and all your data. <strong style={{ color: 'var(--text-primary)' }}>This cannot be undone.</strong>
                </div>
                {deleteError && (
                  <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700, marginBottom: 12 }}>{deleteError}</div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleteLoading}
                    style={{ flex: 1, padding: '13px 16px', borderRadius: 6, background: 'transparent', border: '1.5px solid rgba(100,100,120,0.35)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleteLoading ? 0.5 : 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteLoading}
                    style={{ flex: 1, padding: '13px 16px', borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: deleteLoading ? 0.5 : 1 }}
                  >
                    {deleteLoading ? 'Deleting...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>

      {/* Hidden Spots overlay — full screen. z-index matches the settings-
          reachable tier (Edit Profile / Feedback / ToS / Privacy) since this
          is also opened from a Settings row now, not just the stat card. */}
      {showHiddenSpots && createPortal(
        <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 14px 10px', paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
            background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
          }}>
            <div onClick={() => setShowHiddenSpots(false)} style={{ width: 32, height: 32, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: 1, textTransform: 'uppercase' }}>Hidden Spots</div>
            <div style={{ width: 32 }} />
          </div>
          <div className="scroll-area">
            {hiddenSpots.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No hidden spots.</div>
            ) : (
              hiddenSpots.map((spot, i) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  saved={false}
                  onSavePress={() => {}}
                  onClick={onSpotClick}
                  onUnhidePress={(s) => { setUnhideTarget(s); setShowUnhideConfirm(true) }}
                  priority={i < 3}
                />
              ))
            )}
            <div style={{ height: BOTTOM_PAD }} />
          </div>
          {onTabChange && <TabBar active="profile" onChange={t => { setShowHiddenSpots(false); onTabChange(t) }} user={user} profileAvatar={storeProfile?.avatar_url} profileInitials={storeProfile?.initials} notificationCount={unreadCount} />}
        </div>,
        document.body
      )}

      {showUnhideConfirm && createPortal(
        <div className="modal-overlay" onClick={() => { setShowUnhideConfirm(false); setUnhideTarget(null) }}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 16px 12px', fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Unhide This Spot?
            </div>
            <div style={{ padding: '0 16px 16px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This spot will show back up in your feed and search results.
            </div>
            <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={confirmUnhide}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Unhide Spot
              </button>
              <button
                onClick={() => { setShowUnhideConfirm(false); setUnhideTarget(null) }}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* My Spots overlay — full screen, covers top nav */}
      {showMySpots && createPortal(
        <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
          }}>
            <div onClick={() => { sessionStorage.removeItem('mySpots:open'); setShowMySpots(false) }} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              My Spots
            </div>
            <div style={{ width: 36 }} />
          </div>
          <div ref={mySpotsScrollRef} className="scroll-area" style={{ paddingTop: 14 }}>
            {mySpots.length === 0 ? (
              <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
                No spots added yet
              </div>
            ) : (
              mySpots.map((spot, i) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  saved={saved?.has(spot.id) ?? false}
                  onSavePress={onSavePress}
                  onClick={s => {
                    _mySpotsScrollTop = mySpotsScrollRef.current?.scrollTop || 0
                    onSpotClick?.(s)
                  }}
                  priority={i < 3}
                />
              ))
            )}
            <div style={{ height: BOTTOM_PAD }} />
          </div>
          {onTabChange && <TabBar active="profile" onChange={t => { sessionStorage.removeItem('mySpots:open'); setShowMySpots(false); onTabChange(t) }} user={user} profileAvatar={storeProfile?.avatar_url} profileInitials={storeProfile?.initials} notificationCount={unreadCount} />}
        </div>,
        document.body
      )}

      {/* Friends screen — full page (Section A), reached from the Friends
          stat card. Same shell as My Spots; FriendsView supplies the body. */}
      {showFriendsScreen && createPortal(
        <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 99999, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
          }}>
            <div onClick={() => setShowFriendsScreen(false)} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Friends
            </div>
            <div style={{ width: 36 }} />
          </div>
          <div className="scroll-area">
            <div style={{ padding: '14px 14px 0', maxWidth: 480, margin: '0 auto', width: '100%' }}>
              <FriendsView user={user} userLocation={userLocation} locationPermission={locationPermission} requestLocation={requestLocation} onFriendsChanged={fetchFriendCount} />
            </div>
            <div style={{ height: BOTTOM_PAD }} />
          </div>
          {onTabChange && <TabBar active="profile" onChange={t => { setShowFriendsScreen(false); onTabChange(t) }} user={user} profileAvatar={storeProfile?.avatar_url} profileInitials={storeProfile?.initials} notificationCount={unreadCount} />}
        </div>,
        document.body
      )}

      {/* Trick List screen — fully self-contained (list-of-lists plus a
          per-list detail view), same two-level shape as SavedView.jsx, so
          it owns its own header/back-navigation instead of sharing the
          simple single-level shell My Spots/Friends/Hidden Spots use. */}
      {showTrickList && createPortal(
        <TrickListPage
          user={user}
          spots={spots}
          onSpotClick={onSpotClick}
          onClose={() => setShowTrickList(false)}
          openListId={openTrickListId}
          onOpenListIdHandled={onOpenTrickListIdHandled}
          onTabChange={onTabChange ? (t => { setShowTrickList(false); onTabChange(t) }) : undefined}
          profileAvatar={storeProfile?.avatar_url}
          profileInitials={storeProfile?.initials}
          unreadCount={unreadCount}
        />,
        document.body
      )}
      </>
      )}
      </div>{/* end content wrapper */}

      {/* Edit Profile — full page (Section E), reached from Settings */}
      {showEditSheet && createPortal(
        <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
          }}>
            <div onClick={closeEditSheet} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Edit Profile</div>
            <div style={{ width: 36 }} />
          </div>
          <div className="scroll-area">
            <div style={{ padding: '16px 16px 28px', maxWidth: 480, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Avatar */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
                <div style={{ position: 'relative', width: 72, height: 72 }}>
                  <div
                    onClick={() => avatarRef.current?.click()}
                    style={{ width: 72, height: 72, borderRadius: '50%', background: '#ECEDF2', border: '2px solid #C8CAD4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: 'pointer' }}
                  >
                    {storeProfile.avatar_url ? (
                      <img src={storeProfile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 28, fontWeight: 900, color: '#6a6c7a' }}>{storeProfile.initials}</span>
                    )}
                  </div>
                  <div
                    onClick={() => avatarRef.current?.click()}
                    style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                      <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="M14.5 5.5l4 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </div>
                  {storeProfile.avatar_url && (
                    <div onClick={handleRemoveAvatar} style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderRadius: '50%', background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><line x1="1" y1="1" x2="7" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /><line x1="7" y1="1" x2="1" y2="7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </div>
                  )}
                </div>
              </div>
              {avatarError && <div style={{ textAlign: 'center', fontSize: 11, color: '#e07070', fontWeight: 700, marginTop: -4 }}>{avatarError}</div>}
              {editDraft && (
                <>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div className="section-label" style={{ marginBottom: 4 }}>First Name</div>
                      <input className="form-input" placeholder="First name" value={editDraft.first_name} onChange={e => setEditDraft(p => ({ ...p, first_name: e.target.value }))} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="section-label" style={{ marginBottom: 4 }}>Last Name</div>
                      <input className="form-input" placeholder="Last name" value={editDraft.last_name} onChange={e => setEditDraft(p => ({ ...p, last_name: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <div className="section-label" style={{ marginBottom: 4 }}>Username</div>
                    <input className="form-input" placeholder="Username" value={editDraft.username} onChange={e => setEditDraft(p => ({ ...p, username: e.target.value }))} />
                  </div>
                </>
              )}
              {editProfileError && <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{editProfileError}</div>}
              <button className="btn-salmon" onClick={handleSaveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
              <button
                onClick={() => { closeEditSheet(); setTimeout(openPasswordModal, 200) }}
                style={{ width: '100%', padding: 13, borderRadius: 6, background: 'transparent', border: '1.5px solid #d4785a', color: '#d4785a', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}
              >
                Update Password
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Update Password modal */}
      {(showPasswordModal || pwModalClosing) && createPortal(
        <div className="modal-overlay" onClick={closePasswordModal}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={pwModalClosing ? { animation: 'slideOutDown 0.18s ease-in forwards' } : undefined}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px' }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Update Password</div>
              <div onClick={closePasswordModal} style={{ width: 28, height: 28, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <line x1="2" y1="2" x2="10" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="10" y1="2" x2="2" y2="10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            {pwSuccess ? (
              <div style={{ padding: '20px 16px 28px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#4caf50' }}>Password updated successfully!</div>
            ) : (
              <div style={{ padding: '0 16px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>Current Password</div>
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" type={showPwCurrent ? 'text' : 'password'} placeholder="Current password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} style={{ paddingRight: 44 }} />
                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPwCurrent(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9a8878', display: 'flex', alignItems: 'center' }}
                      tabIndex={-1}>
                      <EyeIcon visible={!showPwCurrent} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>New Password</div>
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" type={showPwNew ? 'text' : 'password'} placeholder="New password" value={pwNew} onChange={e => setPwNew(e.target.value)} style={{ paddingRight: 44 }} />
                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPwNew(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9a8878', display: 'flex', alignItems: 'center' }}
                      tabIndex={-1}>
                      <EyeIcon visible={!showPwNew} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 4 }}>Confirm New Password</div>
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" type={showPwConfirm ? 'text' : 'password'} placeholder="Confirm new password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} style={{ paddingRight: 44 }} />
                    <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => setShowPwConfirm(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9a8878', display: 'flex', alignItems: 'center' }}
                      tabIndex={-1}>
                      <EyeIcon visible={!showPwConfirm} />
                    </button>
                  </div>
                </div>
                {pwError && (
                  <div style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{pwError}</div>
                )}
                <button
                  onClick={handleUpdatePassword}
                  disabled={pwLoading}
                  style={{ width: '100%', padding: 13, borderRadius: 6, background: '#d4785a', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Barlow, sans-serif', opacity: pwLoading ? 0.6 : 1 }}
                >
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Notifications overlay — full screen. Same z-index tier as the
          other settings-reachable pages (also opened from the bell icon
          directly, which works fine at this tier too). */}
      {showNotifications && createPortal(
        <div className="desktop-page-root" style={{ position: 'fixed', inset: 0, background: '#FDF8F0', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '12px 16px', paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
            background: '#FDF8F0', borderBottom: '1px solid #E8DDD0', flexShrink: 0,
          }}>
            <div onClick={() => setShowNotifications(false)} style={{ width: 36, height: 36, borderRadius: 6, background: '#d4785a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6L8 10" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Notifications
            </div>
            <div style={{ width: 36 }} />
          </div>
          <div className="scroll-area">
            {notifLoading && notifications.length === 0 ? (
              <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '60px 32px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>No notifications yet</div>
            ) : (
              <>
                {(() => { const firstReadIdx = notifications.findIndex(n => !unreadSnapshot.has(n.id)); return notifications.map((n, i) => {
                  const actionText = n.type === 'friend_request' ? `${n.actorUsername || 'A skater'} wants to be friends`
                    : n.type === 'friend_accepted' ? `${n.actorUsername || 'A skater'} accepted your friend request`
                    : n.type === 'comment_mention' ? `${n.actorUsername || 'A skater'} tagged you in a comment`
                    : n.type === 'comment_reply' ? `${n.actorUsername || 'A skater'} replied to your comment`
                    : n.type === 'list_invite' ? `${n.actorUsername || 'A skater'} added you to a list`
                    : n.type === 'trick_list_invite' ? `${n.actorUsername || 'A skater'} shared a trick list with you`
                    : n.type === 'spot_share' ? `${n.actorUsername || 'A skater'} shared ${n.spotTitle || 'a spot'} with you`
                    : n.type === 'admin_update' ? 'Updated Your Spot'
                    : n.type === 'rating' ? 'Rated Your Spot'
                    : n.type === 'comment' ? 'Commented On Your Spot'
                    : n.type === 'report' ? 'Reported Your Spot'
                    : 'Interacted With Your Spot'
                  return (
                    <div key={n.id}>
                    {i === firstReadIdx && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 12px 4px' }}>
                        <span className="section-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Read Messages</span>
                        <div style={{ flex: 1, height: 1, background: '#E8DDD0' }} />
                      </div>
                    )}
                    <div
                      style={{
                        margin: '8px 12px',
                        borderRadius: 10,
                        background: unreadSnapshot.has(n.id) ? '#FFFFFF' : 'transparent',
                        border: `1px solid ${unreadSnapshot.has(n.id) ? 'rgba(212,120,90,0.3)' : '#EAD8C8'}`,
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      }}
                    >
                      {/* Avatar — spot_share shows the spot's own cover photo
                          (card-image placeholder treatment) instead of the
                          actor's avatar */}
                      {n.type === 'spot_share' ? (
                        <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 6, background: '#F0E8DE', border: '1px solid #C8CAD4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {n.spotPhoto && (
                            <img src={transformImageUrl(n.spotPhoto, 80)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          )}
                        </div>
                      ) : (
                        <div style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: '#ECEDF2', border: '1px solid #C8CAD4', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {n.type === 'admin_update' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#d4785a" strokeWidth="1.6" strokeLinejoin="round" />
                              <path d="M2 17l10 5 10-5" stroke="#d4785a" strokeWidth="1.6" strokeLinejoin="round" />
                              <path d="M2 12l10 5 10-5" stroke="#d4785a" strokeWidth="1.6" strokeLinejoin="round" />
                            </svg>
                          ) : n.actorAvatar ? (
                            <img src={n.actorAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 15, fontWeight: 900, color: '#6a6c7a' }}>
                              {n.actorUsername ? n.actorUsername[0].toUpperCase() : '?'}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Text column */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {n.actorUsername && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{n.actorUsername}</div>
                        )}
                        <div style={{ fontSize: 11, fontWeight: unreadSnapshot.has(n.id) ? 700 : 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{actionText}</div>
                        {n.spotTitle && n.type !== 'spot_share' && (
                          <div style={{ fontSize: 11, color: '#d4785a', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.spotTitle}</div>
                        )}
                        {n.type === 'spot_share' && n.message && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4, overflowWrap: 'break-word' }}>{n.message}</div>
                        )}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{relativeTime(n.created_at)}</div>
                      </div>

                      {/* Friend request controls (when unresolved), plus a
                          View button on every notification — routes to the
                          spot/list/profile per handleNotifTap/openUserProfile. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {n.type === 'friend_request' && (
                          friendReqState[n.id]?.resolved ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#4a9a5a', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                              {friendReqState[n.id].resolved === 'accepted' ? 'Accepted' : 'Ignored'}
                            </span>
                          ) : (
                            <>
                              {friendReqState[n.id]?.error && (
                                <span style={{ fontSize: 11, color: '#e07070', fontWeight: 700 }}>{friendReqState[n.id].error}</span>
                              )}
                              <div
                                onClick={() => !friendReqState[n.id]?.loading && handleAcceptFriendRequestNotif(n)}
                                style={{ flexShrink: 0, background: '#d4785a', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: friendReqState[n.id]?.loading ? 0.6 : 1 }}
                              >
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1 }}>Accept</span>
                              </div>
                              <div
                                onClick={() => !friendReqState[n.id]?.loading && handleIgnoreFriendRequestNotif(n)}
                                style={{ flexShrink: 0, border: '1px solid rgba(212,120,90,0.5)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: friendReqState[n.id]?.loading ? 0.6 : 1 }}
                              >
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--salmon)', letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1 }}>Deny</span>
                              </div>
                            </>
                          )
                        )}
                        {(((n.type === 'friend_request' || n.type === 'friend_accepted') && n.actor_id) || n.spotSlug || n.spot_id || n.list_id || n.trick_list_id) && (
                          <div
                            onClick={() => handleNotifTap(n)}
                            style={{ flexShrink: 0, background: '#d4785a', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          >
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 0.5, textTransform: 'uppercase', lineHeight: 1 }}>View</span>
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  )
                }) })()}
                {notifHasMore && (
                  <div
                    onClick={() => onFetchNotifications?.()}
                    style={{ padding: 16, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#d4785a', cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase' }}
                  >
                    Load More
                  </div>
                )}
              </>
            )}
            <div style={{ height: BOTTOM_PAD }} />
          </div>
          {onTabChange && <TabBar active="profile" onChange={t => { setShowNotifications(false); onTabChange(t) }} user={user} profileAvatar={storeProfile?.avatar_url} profileInitials={storeProfile?.initials} notificationCount={unreadCount} />}
        </div>,
        document.body
      )}

      {/* Minimal read-only profile preview — VIEW target for friend_request/
          friend_accepted notifications. No dedicated "other user's profile"
          page exists elsewhere in the app; reuses the existing modal-sheet
          pattern plus AddFriendButton for a status-correct action. */}
      {viewProfileFor && createPortal(
        <div className="modal-overlay" onClick={() => setViewProfileFor(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ padding: '4px 20px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#ECEDF2', border: '2px solid #C8CAD4', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {viewProfileFor.avatar_url ? (
                  <img src={viewProfileFor.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#6a6c7a' }}>{viewProfileFor.username ? viewProfileFor.username[0].toUpperCase() : '?'}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{viewProfileFor.username || 'skater'}</div>
                <div style={{ marginTop: 8 }}>
                  <AddFriendButton
                    targetUserId={viewProfileFor.id}
                    friendshipStatus={viewProfileFor.friendshipStatus}
                    isRequester={false}
                    friendshipId={null}
                    onChange={(newStatus) => {
                      fetchFriendCount()
                      window.dispatchEvent(new Event('seshwars:friends-changed'))
                      setViewProfileFor(p => p && { ...p, friendshipStatus: newStatus })
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {locationToast && createPortal(
        <div style={{ position: 'fixed', bottom: 'calc(max(env(safe-area-inset-bottom), 24px) + 88px)', left: '50%', transform: 'translateX(-50%)', background: '#2a1e14', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', zIndex: 2000, maxWidth: 'calc(100vw - 48px)', textAlign: 'center', pointerEvents: 'none' }}>
          {locationToast}
        </div>,
        document.body
      )}
    </>
  )
}
