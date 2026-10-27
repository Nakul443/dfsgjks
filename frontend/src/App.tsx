
// this file is the main entry point for the frontend application,
// responsible for rendering the React components and managing the overall user interface

import { useEffect, useState } from 'react'
import { getJson } from './api/client'
import type { MetaResponse } from './api/types'

export function App() {
  const [backendStatus, setBackendStatus] = useState<string>('checking...')
  const [meta, setMeta] = useState<MetaResponse | null>(null)

  useEffect(() => {
    getJson<{ status: string }>('/health')
      .then((data) => {
        setBackendStatus(data.status === 'ok' ? 'backend: ok' : `backend: ${data.status}`)
      })
      .catch((err) => {
        setBackendStatus(`backend error: ${err.message}`)
      })

    getJson<MetaResponse>('/api/meta')
      .then((metaData) => {
        setMeta(metaData)
        console.log('[WindBand] /api/meta received:', metaData)
      })
      .catch((err) => {
        console.error('[WindBand] failed to load meta:', err)
      })
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>WindBand</h1>
      <p>UK Day-Ahead Wind Forecast Accuracy Portal</p>
      <div
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#f0f4f8',
          display: 'inline-block',
          borderRadius: '4px',
        }}
      >
        Status: <strong>{backendStatus}</strong>
      </div>
      {meta && (
        <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#4a5568' }}>
          Data loaded: {meta.actuals.row_count} actual slots, default cutoff: {meta.default_cutoff}
        </div>
      )}
    </div>
  )
}

export default App
