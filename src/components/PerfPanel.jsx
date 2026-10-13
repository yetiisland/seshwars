import { useEffect, useState } from 'react'
import { subscribe, getEntries, getDomNodeCount, clearEntries } from '../lib/perfReadout'

export default function PerfPanel() {
  const [entries, setEntries] = useState(() => getEntries())
  const [domCount, setDomCount] = useState(() => getDomNodeCount())

  useEffect(() => {
    return subscribe(() => {
      setEntries(getEntries())
      setDomCount(getDomNodeCount())
    })
  }, [])

  return (
    <div style={{
      position: 'fixed', top: 8, right: 8, zIndex: 999999,
      background: 'rgba(0,0,0,0.85)', color: '#0f0', fontFamily: 'monospace',
      fontSize: 10, lineHeight: 1.5, padding: '6px 8px', borderRadius: 4,
      maxWidth: 220, pointerEvents: 'auto',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>PERF &middot; {domCount} nodes</div>
      {entries.length === 0 && <div style={{ opacity: 0.7 }}>No entries yet</div>}
      {entries.map((e, i) => (
        <div key={i}>
          {e.actionName}: {e.totalMs}ms{e.netWaitMs != null ? ` (net ${e.netWaitMs}ms)` : ''}{e.sizeKB != null ? ` (${e.sizeKB}kb)` : ''}
        </div>
      ))}
      <button
        onClick={clearEntries}
        style={{
          marginTop: 4, fontSize: 9, padding: '2px 6px', cursor: 'pointer',
          background: '#111', color: '#0f0', border: '1px solid #0f0', borderRadius: 3,
        }}
      >
        CLEAR
      </button>
    </div>
  )
}
