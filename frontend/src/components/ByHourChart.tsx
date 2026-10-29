// this file is responsible for defining the ByHourChart component used in the frontend application
// to visualize the mean absolute error (MAE) and forecast bias by hour of the day
// in simple words,
// this file contains the code for the user interface that shows how forecast accuracy varies throughout the day

import React from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HourMetricItem } from '../api/types'
import { formatMW } from '../lib/format'
import { EmptyState, ErrorBox } from './States'

interface ByHourChartProps {
  data?: HourMetricItem[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}

const CustomByHourTooltip = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: HourMetricItem }>
}) => {
  if (!active || !payload || !payload.length) return null

  const d = payload[0].payload
  const hourLabel = `${d.hour.toString().padStart(2, '0')}:00 – ${d.hour.toString().padStart(2, '0')}:59 UTC`

  return (
    <div className="chart-tooltip" role="tooltip">
      <div className="tooltip-header">{hourLabel}</div>
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
          <span>{d.count} half-hour slots</span>
        </div>
      </div>
    </div>
  )
}

export const ByHourChart: React.FC<ByHourChartProps> = ({
  data,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="chart-card chart-placeholder" aria-busy="true">
        <h3 className="chart-title">Error by Hour of Day</h3>
        <div className="spinner" />
        <p>Loading hourly accuracy patterns...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="chart-card chart-placeholder">
        <ErrorBox
          title="Unable to load hourly patterns"
          message={errorMessage || 'An error occurred.'}
          onRetry={onRetry}
        />
      </div>
    )
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="chart-card chart-placeholder">
        <EmptyState
          title="No hourly data available"
          message="No data points exist for the active date range."
        />
      </div>
    )
  }

  const chartData = data.map((d) => ({
    ...d,
    hourLabel: `${d.hour.toString().padStart(2, '0')}:00`,
  }))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Error by Hour of Day (UTC)</h3>
          <p className="chart-subtitle">
            Mean Absolute Error (bars) and Forecast Bias (line) by delivery hour
          </p>
        </div>
      </div>

      <div className="chart-body" style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 15, right: 15, left: -5, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="hourLabel"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              unit=" MW"
              width={55}
            />
            <Tooltip content={<CustomByHourTooltip />} />
            <Bar
              name="MAE (MW)"
              dataKey="mae"
              fill="#3b82f6"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              name="Bias (MW)"
              dataKey="bias"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 2, fill: '#ef4444' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
