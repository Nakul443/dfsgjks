// this file is responsible for defining the SeriesChart component used in the frontend application
// to visualize the actual and forecasted wind generation data over time, including error bands and metrics
// in simple words, this file contains the code for the chart that displays wind generation data and its forecast

import React from 'react'
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SeriesItem } from '../api/types'
import { formatAxisDate, formatMW, formatUtcTime } from '../lib/format'

interface SeriesChartProps {
  data: SeriesItem[]
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
}

interface ChartRow extends SeriesItem {
  bandRange: [number, number] | null
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartRow }>
}) => {
  if (!active || !payload || !payload.length) return null

  const d = payload[0].payload

  return (
    <div className="chart-tooltip" role="tooltip">
      <div className="tooltip-header">{formatUtcTime(d.time)}</div>
      <div className="tooltip-grid">
        <div className="tooltip-row">
          <span className="tooltip-label forecast-dot">● Forecast (WINDFOR):</span>
          <span className="tooltip-val">{formatMW(d.forecast)} MW</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label actual-dot">● Actual (FUELHH):</span>
          <span className="tooltip-val">{formatMW(d.actual)} MW</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label error-dot">Error (fc - act):</span>
          <span className={`tooltip-val ${d.error && d.error > 0 ? 'over-fc' : 'under-fc'}`}>
            {d.error !== null && d.error !== undefined ? `${d.error > 0 ? '+' : ''}${formatMW(d.error)} MW` : '—'}
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label band-dot">● Error Band (P10-P90):</span>
          <span className="tooltip-val">
            [{formatMW(d.band_low)} – {formatMW(d.band_high)}] MW
          </span>
        </div>
        <div className="tooltip-divider" />
        <div className="tooltip-row text-muted">
          <span>Publish Time:</span>
          <span>{d.publish_time ? formatUtcTime(d.publish_time) : '—'}</span>
        </div>
        <div className="tooltip-row text-muted">
          <span>Horizon:</span>
          <span>{d.horizon_hours !== null && d.horizon_hours !== undefined ? `${d.horizon_hours.toFixed(1)} hrs` : '—'}</span>
        </div>
      </div>
    </div>
  )
}

export const SeriesChart: React.FC<SeriesChartProps> = ({
  data,
  isLoading,
  isError,
  errorMessage,
}) => {
  if (isLoading) {
    return (
      <div className="chart-card chart-placeholder" aria-busy="true">
        <div className="spinner" />
        <p>Loading decision-time wind series...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="chart-card chart-placeholder error-box" role="alert">
        <p>⚠️ Unable to load series data.</p>
        <small>{errorMessage || 'An error occurred while fetching the series.'}</small>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="chart-card chart-placeholder">
        <p>No delivery slots found for the selected range.</p>
      </div>
    )
  }

  // Pre-process data into bandRange [band_low, band_high]
  const chartData: ChartRow[] = data.map((d) => ({
    ...d,
    bandRange:
      d.band_low !== null && d.band_high !== null
        ? [d.band_low, d.band_high]
        : null,
  }))

  // Determine tick interval dynamically based on dataset length
  const tickInterval = Math.max(1, Math.floor(chartData.length / 10))

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h2 className="chart-title">Wind Generation: Actual vs Decision-Time Forecast</h2>
          <p className="chart-subtitle">
            30-minute delivery slots with latest WINDFOR forecast published prior to cutoff and fixed historical error band
          </p>
        </div>
        <div className="chart-badges">
          <span className="badge badge-slots">{chartData.length} slots</span>
        </div>
      </div>

      <div className="chart-body" style={{ width: '100%', height: 460 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 25, left: 10, bottom: 25 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="time"
              tickFormatter={formatAxisDate}
              interval={tickInterval}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              dy={8}
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              unit=" MW"
              width={65}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', paddingBottom: '8px' }}
            />

            {/* Shaded historical planning error band [band_low, band_high] */}
            <Area
              name="Historical error band"
              dataKey="bandRange"
              stroke="#93c5fd"
              fill="rgba(147, 197, 253, 0.35)"
              fillOpacity={0.4}
              connectNulls={false}
              isAnimationActive={false}
              legendType="rect"
            />

            {/* Actual generation line (FUELHH) */}
            <Line
              type="monotone"
              name="Actual (FUELHH)"
              dataKey="actual"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* Decision-time forecast line (WINDFOR) */}
            <Line
              type="monotone"
              name="Forecast at decision time (WINDFOR)"
              dataKey="forecast"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />

            {/* Brush for zooming and timeline panning */}
            <Brush
              dataKey="time"
              height={30}
              stroke="#94a3b8"
              fill="#f8fafc"
              tickFormatter={formatAxisDate}
              startIndex={0}
              endIndex={chartData.length - 1}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
