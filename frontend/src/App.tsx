
// this file is responsible for defining the main App component used in the frontend application
// to manage state, handle user interactions, and coordinate data fetching from the backend API
import { useEffect, useMemo, useState } from 'react'
import { ByHorizonChart } from './components/ByHorizonChart'
import { ByHourChart } from './components/ByHourChart'
import { Controls } from './components/Controls'
import { KpiStrip } from './components/KpiStrip'
import { MethodologyNote } from './components/MethodologyNote'
import { MetricsPanel } from './components/MetricsPanel'
import { SeriesChart } from './components/SeriesChart'
import { ErrorBox } from './components/States'
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

      {metaError && (
        <ErrorBox
          title="Failed to connect to backend"
          message={metaError.message}
          onRetry={() => window.location.reload()}
        />
      )}

      <KpiStrip
        series={seriesQuery.data?.data}
        metrics={metricsQuery.data}
        isLoading={seriesQuery.isLoading || metricsQuery.isLoading}
      />

      <main className="main-content-layout">
        <div className="series-chart-column">
          <SeriesChart
            data={seriesQuery.data?.data ?? []}
            isLoading={seriesQuery.isLoading}
            isError={seriesQuery.isError}
            errorMessage={seriesQuery.error?.message}
            onRetry={() => seriesQuery.refetch()}
          />
        </div>
        <div className="metrics-panel-column">
          <MetricsPanel
            metrics={metricsQuery.data}
            isLoading={metricsQuery.isLoading}
            isError={metricsQuery.isError}
            errorMessage={metricsQuery.error?.message}
            onRetry={() => metricsQuery.refetch()}
          />
        </div>
      </main>

      <section className="pattern-charts-grid" aria-label="Error Pattern Analysis">
        <ByHourChart
          data={byHourQuery.data}
          isLoading={byHourQuery.isLoading}
          isError={byHourQuery.isError}
          errorMessage={byHourQuery.error?.message}
          onRetry={() => byHourQuery.refetch()}
        />
        <ByHorizonChart
          data={byHorizonQuery.data}
          isLoading={byHorizonQuery.isLoading}
          isError={byHorizonQuery.isError}
          errorMessage={byHorizonQuery.error?.message}
          onRetry={() => byHorizonQuery.refetch()}
        />
      </section>

      <MethodologyNote />

      <footer className="dashboard-status-footer">
        <span className="status-item">
          <strong>Meta status:</strong> {isMetaLoading ? 'Loading metadata...' : metaError ? `Error: ${metaError.message}` : `Loaded (${meta?.actuals.row_count} actuals, ${meta?.forecasts.row_count} forecasts)`}
        </span>
        <span className="status-separator">•</span>
        <span className="status-item">
          <strong>Active Cutoff:</strong> {cutoff} (D-1 UTC)
        </span>
        <span className="status-separator">•</span>
        <span className="status-item">
          <strong>Status:</strong> {validationError ? 'Paused (validation error)' : seriesQuery.isLoading ? 'Updating...' : 'Ready'}
        </span>
      </footer>
    </div>
  )
}

export default App
