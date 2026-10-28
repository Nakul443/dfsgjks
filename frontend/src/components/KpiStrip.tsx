// this file is responsible for defining the KpiStrip component used in the frontend application
// to display key performance indicators (KPIs) such as average forecast,
// average outturn, mean absolute error, and forecast bias
// in simple words,
// this file contains the code for the user interface that shows important metrics related to wind data analysis

import React, { useMemo } from 'react'
import type { MetricsResponse, SeriesItem } from '../api/types'
import { formatBiasText, formatMW } from '../lib/format'

interface KpiStripProps {
  series?: SeriesItem[]
  metrics?: MetricsResponse | null
  isLoading?: boolean
}

export const KpiStrip: React.FC<KpiStripProps> = ({
  series,
  metrics,
  isLoading,
}) => {
  const { avgForecast, avgActual } = useMemo(() => {
    if (!series || series.length === 0) {
      return { avgForecast: null, avgActual: null }
    }
    const forecasts = series
      .map((s) => s.forecast)
      .filter((v): v is number => v !== null && v !== undefined && !isNaN(v))
    const actuals = series
      .map((s) => s.actual)
      .filter((v): v is number => v !== null && v !== undefined && !isNaN(v))

    const meanForecast =
      forecasts.length > 0
        ? forecasts.reduce((a, b) => a + b, 0) / forecasts.length
        : null
    const meanActual =
      actuals.length > 0
        ? actuals.reduce((a, b) => a + b, 0) / actuals.length
        : null

    return { avgForecast: meanForecast, avgActual: meanActual }
  }, [series])

  const biasValue = metrics?.bias
  const biasClass =
    biasValue !== null && biasValue !== undefined
      ? biasValue > 0
        ? 'kpi-over'
        : biasValue < 0
          ? 'kpi-under'
          : 'kpi-neutral'
      : ''

  return (
    <div className="kpi-strip" role="region" aria-label="Key Performance Indicators">
      <div className="kpi-card">
        <span className="kpi-label">Average Forecast</span>
        <div className="kpi-value-row">
          <span className="kpi-value">{isLoading ? '—' : formatMW(avgForecast)}</span>
          <span className="kpi-unit">MW</span>
        </div>
        <span className="kpi-sub">Mean decision-time forecast</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Average Outturn</span>
        <div className="kpi-value-row">
          <span className="kpi-value">{isLoading ? '—' : formatMW(avgActual)}</span>
          <span className="kpi-unit">MW</span>
        </div>
        <span className="kpi-sub">Mean actual wind produced</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">Mean Absolute Error (MAE)</span>
        <div className="kpi-value-row">
          <span className="kpi-value">{isLoading ? '—' : formatMW(metrics?.mae)}</span>
          <span className="kpi-unit">MW</span>
        </div>
        <span className="kpi-sub">Average error magnitude</span>
      </div>

      <div className={`kpi-card kpi-card-bias ${biasClass}`}>
        <span className="kpi-label">Forecast Bias</span>
        <div className="kpi-value-row">
          <span className="kpi-bias-text">{isLoading ? '—' : formatBiasText(biasValue)}</span>
        </div>
        <span className="kpi-sub">
          {biasValue !== null && biasValue !== undefined
            ? `Mean signed error: ${biasValue > 0 ? '+' : ''}${formatMW(biasValue)} MW`
            : 'Forecast minus actual'}
        </span>
      </div>
    </div>
  )
}
