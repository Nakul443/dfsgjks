// this file is responsible for defining the ByHorizonChart component used in the frontend application
// to visualize the mean absolute error (MAE) and forecast bias across different forecast horizons
// in simple words, this file contains the code for the user interface that shows how forecast accuracy changes with lead time

import React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HorizonMetricItem } from '../api/types'
import { formatMW } from '../lib/format'

interface ByHorizonChartProps {
  data?: HorizonMetricItem[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
}

const CustomByHorizonTooltip = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: HorizonMetricItem }>
}) => {
  if (!active || !payload || !payload.length) return null

  const d = payload[0].payload

  return (
    <div className="chart-tooltip" role="tooltip">
      <div className="tooltip-header">{d.bucket} Hours Ahead</div>
      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label">Mean Absolute Error (MAE):</span>
          <span className="tooltip-val">{formatMW(d.mae)} MW</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Forecast Bias:</span>
          <span className={`tooltip-val ${d.bias && d.bias > 0 ? 'over-fc' : d.bias && d.bias < 0 ? 'under-fc' : ''}`}>
            {d.bias !== null && d.bias !== undefined ? `${d.bias > 0 ? '+' : ''}${formatMW(d.bias)} MW` : '—'}
          </span>
        </div>
        <div className="tooltip-divider" />
        <div className="tooltip-row text-muted">
          <span>Sample Count:</span>
          <span>{d.count} forecasts evaluated</span>
        </div>
      </div>
    </div>
  )
}

export const ByHorizonChart: React.FC<ByHorizonChartProps> = ({
  data,
  isLoading,
  isError,
  errorMessage,
}) => {
  if (isLoading) {
    return (
      <div className="chart-card chart-placeholder" aria-busy="true">
        <h3 className="chart-title">Error by Forecast Horizon</h3>
        <div className="spinner" />
        <p>Loading horizon accuracy curve...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="chart-card chart-placeholder error-box" role="alert">
        <h3 className="chart-title">Error by Forecast Horizon</h3>
        <p>⚠️ Unable to load horizon patterns.</p>
        <small>{errorMessage || 'An error occurred.'}</small>
      </div>
    )
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="chart-card chart-placeholder">
        <h3 className="chart-title">Error by Forecast Horizon</h3>
        <p>No horizon data available for this range.</p>
      </div>
    )
  }

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Error by Forecast Horizon (Hours Ahead)</h3>
          <p className="chart-subtitle">
            MAE degradation across all published WINDFOR forecasts by lead time
          </p>
        </div>
      </div>

      <div className="chart-body" style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 15, right: 15, left: -5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="bucket"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              unit="h"
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              unit=" MW"
              width={55}
            />
            <Tooltip content={<CustomByHorizonTooltip />} />
            <Bar
              name="MAE (MW)"
              dataKey="mae"
              fill="#0284c7"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-caption">
        Uses all published forecasts, hourly slots only. Does not depend on the cutoff.
      </p>
    </div>
  )
}
