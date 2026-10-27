
// this file is the main entry point for the frontend application,
// responsible for rendering the React components and managing the overall user interface

import { useEffect, useState } from 'react'

export function App() {
  const [backendStatus, setBackendStatus] = useState<string>('checking...')

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data: { status?: string }) => {
        if (data.status === 'ok') {
          setBackendStatus('backend: ok')
        } else {
          setBackendStatus(`backend: ${JSON.stringify(data)}`)
        }
      })
      .catch((err) => {
        setBackendStatus(`backend error: ${err.message}`)
      })
  }, [])

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>WindBand</h1>
      <p>UK Day-Ahead Wind Forecast Accuracy Portal</p>
      <div style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#f0f4f8', display: 'inline-block', borderRadius: '4px' }}>
        Status: <strong>{backendStatus}</strong>
      </div>
    </div>
  )
}

export default App
