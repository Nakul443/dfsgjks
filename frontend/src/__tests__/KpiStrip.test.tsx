import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KpiStrip } from '../components/KpiStrip'
import type { MetricsResponse, SeriesItem } from '../api/types'

describe('KpiStrip component', () => {
  const mockSeries: SeriesItem[] = [
    {
      time: '2026-01-01T00:00:00Z',
      forecast: 10000,
      publish_time: '2025-12-31T07:30:00Z',
      horizon_hours: 16.5,
      actual: 8000,
      error: 2000,
      band_low: 6000,
      band_high: 11000,
    },
    {
      time: '2026-01-01T00:30:00Z',
      forecast: 12000,
      publish_time: '2025-12-31T07:30:00Z',
      horizon_hours: 17.0,
      actual: 10000,
      error: 2000,
      band_low: 8000,
      band_high: 13000,
    },
  ]

  const mockMetrics: MetricsResponse = {
    mae: 2000,
    rmse: 2000,
    bias: 2000,
    mape: 22.2,
    p10: -500,
    p50: 1700,
    p90: 4200,
    count: 2,
    dropped_count: 0,
  }

  it('renders mean forecast, mean outturn, MAE, and plain language bias', () => {
    render(<KpiStrip series={mockSeries} metrics={mockMetrics} />)

    // Average forecast = (10000 + 12000) / 2 = 11,000 MW
    expect(screen.getByText('11,000')).toBeInTheDocument()

    // Average outturn = (8000 + 10000) / 2 = 9,000 MW
    expect(screen.getByText('9,000')).toBeInTheDocument()

    // MAE = 2,000 MW
    expect(screen.getByText('2,000')).toBeInTheDocument()

    // Plain language bias
    expect(
      screen.getByText('Over-forecast by 2,000 MW on avg')
    ).toBeInTheDocument()
  })

  it('handles negative bias with under-forecast label', () => {
    const underMetrics: MetricsResponse = {
      ...mockMetrics,
      bias: -1250,
    }
    render(<KpiStrip series={mockSeries} metrics={underMetrics} />)
    expect(
      screen.getByText('Under-forecast by 1,250 MW on avg')
    ).toBeInTheDocument()
  })

  it('displays dashes when loading or empty', () => {
    render(<KpiStrip series={[]} metrics={null} isLoading={true} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(4)
  })
})
