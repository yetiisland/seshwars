// On-device navigation performance readout. Only activates when the app is
// opened with ?perf=1 in the URL (persisted in sessionStorage so it survives
// in-app navigation). When inactive, every exported function below is a
// no-op that bails out before touching performance.now, rAF, fetch, or any
// listener/timer, so there is zero runtime cost.

let active = null

export function isPerfActive() {
  if (active === null) {
    try {
      active = sessionStorage.getItem('seshwars:perf') === '1'
    } catch {
      active = false
    }
  }
  return active
}

export function initPerfFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('perf') === '1') {
      sessionStorage.setItem('seshwars:perf', '1')
    }
    active = sessionStorage.getItem('seshwars:perf') === '1'
  } catch {
    active = false
  }
  if (active) patchFetch()
}

let entries = []
const listeners = new Set()

function notify() {
  listeners.forEach(fn => fn())
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getEntries() {
  return entries
}

export function clearEntries() {
  entries = []
  notify()
}

export function getDomNodeCount() {
  return document.getElementsByTagName('*').length
}

// Armed by perfBeginNav, consumed by the patched fetch below: the next
// fetch issued while a nav is in flight is attributed to that nav as "the
// network request the destination waits on." Cleared at first paint so a
// later nav's fetches are never misattributed to a stale handle.
let pendingNavHandle = null
let fetchPatched = false

function patchFetch() {
  if (fetchPatched) return
  fetchPatched = true
  const originalFetch = window.fetch.bind(window)
  window.fetch = function (...args) {
    const promise = originalFetch(...args)
    if (pendingNavHandle && pendingNavHandle.netStart == null) {
      const handle = pendingNavHandle
      handle.netStart = performance.now()
      handle.netPromise = promise
      handle.netEndPromise = promise.then(
        () => { handle.netEnd = performance.now() },
        () => { handle.netEnd = performance.now() },
      )
    }
    return promise
  }
}

function doubleRAF(cb) {
  requestAnimationFrame(() => requestAnimationFrame(cb))
}

function timeoutPromise(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function finish(handle, endTime) {
  const totalMs = Math.round(endTime - handle.tapTime)
  const netWaitMs = (handle.netStart != null && handle.netEnd != null)
    ? Math.round(handle.netEnd - handle.netStart)
    : null
  entries = [{ actionName: handle.actionName, totalMs, netWaitMs }, ...entries].slice(0, 10)
  notify()
}

// One-shot page-load entry: time from page start (performance.now()'s own
// origin) to the spots list's first paint with content, plus the initial
// spots payload size — tracks when the list is getting big enough that
// Phase 2 (server-side paging/etc.) is due. Call once per app load.
export function recordPageLoad(totalMs, sizeKB) {
  if (!isPerfActive()) return
  entries = [{ actionName: 'page load', totalMs: Math.round(totalMs), netWaitMs: null, sizeKB }, ...entries].slice(0, 10)
  notify()
}

// Call synchronously inside a navigation tap handler, before triggering the
// navigation. Returns a handle to pass to perfEndNav, or null when inactive.
export function perfBeginNav(actionName) {
  if (!isPerfActive()) return null
  const handle = { actionName, tapTime: performance.now(), netStart: null, netEnd: null, netPromise: null, netEndPromise: null }
  pendingNavHandle = handle
  return handle
}

// Call synchronously at the end of the same tap handler, right after
// triggering the navigation.
export function perfEndNav(handle) {
  if (!handle || !isPerfActive()) return
  doubleRAF(() => {
    const firstPaintTime = performance.now()
    if (pendingNavHandle === handle) pendingNavHandle = null
    if (handle.netPromise) {
      Promise.race([handle.netEndPromise, timeoutPromise(3000)]).then(() => {
        doubleRAF(() => finish(handle, performance.now()))
      })
    } else {
      finish(handle, firstPaintTime)
    }
  })
}
