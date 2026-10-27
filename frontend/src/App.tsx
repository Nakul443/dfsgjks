
// this file is responsible for defining the main App component used in the frontend application
// to manage state, handle user interactions, and coordinate data fetching from the backend API
import { useEffect, useMemo, useState } from 'react'
import { Controls } from './components/Controls'
import { SeriesChart } from './components/SeriesChart'
import {
  useMeta,
  useMetrics,
  useMetricsByHorizon,
  useMetricsByHour,
  useSeries,
} from './hooks/useWindData'
import {
  buildPreset,
  FALLBACK_WINDOW,
  getWindowFromMeta,
  validateRange,
  type DateRange,
  type PresetKey,
} from './lib/range'

export function App() {
  const { data: meta, isLoading: isMetaLoading, error: metaError } = useMeta()

  // Window bounds derived from API meta (or fallback)
  const windowRange = useMemo(() => getWindowFromMeta(meta), [meta])

  // Active user selections
  const [range, setRange] = useState<DateRange>(FALLBACK_WINDOW)
  const [cutoff, setCutoff] = useState<string>('09:00')
  const [isInitialized, setIsInitialized] = useState(false)

  // Once meta loads, initialize range to full month and cutoff to default
  useEffect(() => {
    if (meta && !isInitialized) {
      const initialWin = getWindowFromMeta(meta)
      setRange(initialWin)
      if (meta.default_cutoff) {
        setCutoff(meta.default_cutoff)
      }
      setIsInitialized(true)
    }
  }, [meta, isInitialized])

  // Validation
  const validationError = useMemo(() => {
    return validateRange(range, windowRange)
  }, [range, windowRange])

  // Debounce range & cutoff (300ms) before querying API
  const [debouncedRange, setDebouncedRange] = useState<DateRange>(range)
  const [debouncedCutoff, setDebouncedCutoff] = useState<string>(cutoff)

  useEffect(() => {
    if (validationError) return

    const timer = setTimeout(() => {
      setDebouncedRange(range)
      setDebouncedCutoff(cutoff)
    }, 300)

    return () => clearTimeout(timer)
  }, [range, cutoff, validationError])

  // Query hooks with debounced values, disabled if validation error exists
  const isQueryEnabled = !validationError

  const seriesQuery = useSeries(
    debouncedRange.start,
    debouncedRange.end,
    debouncedCutoff,
    isQueryEnabled
  )

  const metricsQuery = useMetrics(
    debouncedRange.start,
    debouncedRange.end,
    debouncedCutoff,
    isQueryEnabled
  )

  const byHourQuery = useMetricsByHour(
    debouncedRange.start,
    debouncedRange.end,
    debouncedCutoff,
    isQueryEnabled
  )

  const byHorizonQuery = useMetricsByHorizon(
    debouncedRange.start,
    debouncedRange.end,
    isQueryEnabled
  )

  const handlePresetSelect = (preset: PresetKey) => {
    const newRange = buildPreset(preset, windowRange)
    setRange(newRange)
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-titles">
          <h1>WindBand</h1>
          <p className="header-subtitle">
            UK Day-Ahead Wind Forecast Accuracy Portal &amp; Decision-Time Intelligence
          </p>
        </div>
        <div className="header-meta">
          <span className="utc-note">Times in UTC (= UK local time in January)</span>
          <span className="window-note">
            Data window: 01 Jan 2026 – 31 Jan 2026
          </span>
        </div>
      </header>

      <Controls
        range={range}
        window={windowRange}
        cutoff={cutoff}
        errorMessage={validationError}
        onRangeChange={setRange}
        onCutoffChange={setCutoff}
        onPresetSelect={handlePresetSelect}
      />

      <main className="main-content-layout">
        <div className="series-chart-column">
          <SeriesChart
            data={seriesQuery.data?.data ?? []}
            isLoading={seriesQuery.isLoading}
            isError={seriesQuery.isError}
            errorMessage={seriesQuery.error?.message}
          />
        </div>
      </main>

      <section style={{ padding: '1rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0' }}>Selection Status</h2>
        <div style={{ fontSize: '0.875rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div>
            <strong>Meta status:</strong> {isMetaLoading ? 'Loading metadata...' : metaError ? `Error: ${metaError.message}` : `Loaded (${meta?.actuals.row_count} actuals, ${meta?.forecasts.row_count} forecasts)`}
          </div>
          <div>
            <strong>Active Range:</strong> {range.start} to {range.end}
          </div>
          <div>
            <strong>Active Cutoff:</strong> {cutoff} (D-1 UTC)
          </div>
          <div>
            <strong>Series Query:</strong> {validationError ? 'Paused (validation error)' : seriesQuery.isLoading ? 'Fetching series...' : seriesQuery.isError ? `Error: ${seriesQuery.error?.message}` : `Loaded ${seriesQuery.data?.count ?? 0} slots`}
          </div>
          <div>
            <strong>Metrics Query:</strong> {validationError ? 'Paused' : metricsQuery.isLoading ? 'Fetching metrics...' : `MAE: ${metricsQuery.data?.mae ?? '—'} MW, Bias: ${metricsQuery.data?.bias ?? '—'} MW`}
          </div>
          <div>
            <strong>By-Hour Query:</strong> {byHourQuery.isLoading ? 'Loading...' : `Loaded ${byHourQuery.data?.length ?? 0} hours`}
          </div>
          <div>
            <strong>By-Horizon Query:</strong> {byHorizonQuery.isLoading ? 'Loading...' : `Loaded ${byHorizonQuery.data?.length ?? 0} buckets`}
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
