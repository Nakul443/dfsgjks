// this file is responsible for defining the MetricsPanel component used in the frontend application
// to display accuracy metrics such as MAE, RMSE, bias, MAPE, and error percentiles
// in simple words, this file contains the code for the user interface that shows forecast accuracy statistics

import React from 'react'
import type { MetricsResponse } from '../api/types'
import { formatMW, formatPercent } from '../lib/format'

interface MetricsPanelProps {
  metrics?: MetricsResponse | null
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({
  metrics,
  isLoading,
  isError,
  errorMessage,
}) => {
  if (isLoading) {
    return (
      <aside className="metrics-panel metrics-placeholder" aria-busy="true">
        <h2 className="panel-title">Accuracy Metrics</h2>
        <div className="spinner" />
        <p>Calculating forecast accuracy...</p>
      </aside>
    )
  }

  if (isError) {
    return (
      <aside className="metrics-panel error-box" role="alert">
        <h2 className="panel-title">Accuracy Metrics</h2>
        <p>⚠️ Unable to load metrics.</p>
        <small>{errorMessage || 'An error occurred while calculating metrics.'}</small>
      </aside>
    )
  }

  if (!metrics || metrics.count === 0) {
    return (
      <aside className="metrics-panel metrics-placeholder">
        <h2 className="panel-title">Accuracy Metrics</h2>
        <p>No valid forecast/actual pairs in this selection.</p>
        <small className="text-muted">Adjust the range or cutoff to view accuracy statistics.</small>
      </aside>
    )
  }

  return (
    <aside className="metrics-panel" aria-label="Forecast Accuracy Metrics">
      <div className="panel-header">
        <h2 className="panel-title">Accuracy Metrics</h2>
        <span className="badge badge-slots">{metrics.count} evaluated slots</span>
      </div>

      <div className="metrics-list">
        <div className="metric-row">
          <div className="metric-meta">
            <span className="metric-name">Mean Absolute Error (MAE)</span>
            <span className="metric-help">Average absolute error magnitude across all slots</span>
          </div>
          <div className="metric-num">
            <span className="metric-val">{formatMW(metrics.mae)}</span>
            <span className="metric-unit">MW</span>
          </div>
        </div>

        <div className="metric-row">
          <div className="metric-meta">
            <span className="metric-name">Root Mean Square Error (RMSE)</span>
            <span className="metric-help">Square root of mean squared errors (penalizes large misses)</span>
          </div>
          <div className="metric-num">
            <span className="metric-val">{formatMW(metrics.rmse)}</span>
            <span className="metric-unit">MW</span>
          </div>
        </div>

        <div className="metric-row">
          <div className="metric-meta">
            <span className="metric-name">Forecast Bias (Mean Error)</span>
            <span className="metric-help">Average signed error (forecast − actual)</span>
          </div>
          <div className="metric-num">
            <span className={`metric-val ${metrics.bias !== null && metrics.bias > 0 ? 'over-fc' : metrics.bias !== null && metrics.bias < 0 ? 'under-fc' : ''}`}>
              {metrics.bias !== null ? `${metrics.bias > 0 ? '+' : ''}${formatMW(metrics.bias)}` : '—'}
            </span>
            <span className="metric-unit">MW</span>
          </div>
        </div>

        <div className="metric-row">
          <div className="metric-meta">
            <span className="metric-name">MAPE</span>
            <span className="metric-help">Mean absolute percentage error (excluding 0 MW actuals)</span>
          </div>
          <div className="metric-num">
            <span className="metric-val">{formatPercent(metrics.mape)}</span>
          </div>
        </div>

        <div className="metric-divider" />

        <div className="metric-section-title">Error Distribution (forecast − actual)</div>

        <div className="percentiles-grid">
          <div className="percentile-box">
            <span className="p-label">P10</span>
            <span className="p-val">{metrics.p10 !== null ? `${metrics.p10 > 0 ? '+' : ''}${formatMW(metrics.p10)}` : '—'}</span>
            <span className="p-desc">10th percentile</span>
          </div>
          <div className="percentile-box">
            <span className="p-label">P50 (Median)</span>
            <span className="p-val">{metrics.p50 !== null ? `${metrics.p50 > 0 ? '+' : ''}${formatMW(metrics.p50)}` : '—'}</span>
            <span className="p-desc">Median error</span>
          </div>
          <div className="percentile-box">
            <span className="p-label">P90</span>
            <span className="p-val">{metrics.p90 !== null ? `${metrics.p90 > 0 ? '+' : ''}${formatMW(metrics.p90)}` : '—'}</span>
            <span className="p-desc">90th percentile</span>
          </div>
        </div>

        <div className="metric-divider" />

        <div className="sample-counts-row">
          <div className="sample-count-item">
            <span className="count-label">Slots Evaluated:</span>
            <span className="count-val">{metrics.count}</span>
          </div>
          <div className="sample-count-item">
            <span className="count-label">Dropped (missing data):</span>
            <span className="count-val">{metrics.dropped_count}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
