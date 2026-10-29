import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetricsPanel } from '../components/MetricsPanel'
import type { MetricsResponse } from '../api/types'

describe('MetricsPanel component', () => {
  const mockMetrics: MetricsResponse = {
    mae: 2145.17,
    rmse: 2615.81,
    bias: 1851.9,
    mape: 22.44,
    p10: -544.1,
    p50: 1703.0,
    p90: 4274.9,
    count: 1488,
    dropped_count: 0,
  }

  it('renders all accuracy metrics and percentile values', () => {
    render(<MetricsPanel metrics={mockMetrics} />)

    expect(screen.getByText('Accuracy Metrics')).toBeInTheDocument()
    expect(screen.getByText('1488 evaluated slots')).toBeInTheDocument()

    // MAE
    expect(screen.getByText('2,145')).toBeInTheDocument()
    // RMSE
    expect(screen.getByText('2,616')).toBeInTheDocument()
    // Bias
    expect(screen.getByText('+1,852')).toBeInTheDocument()
    // MAPE
    expect(screen.getByText('22.4%')).toBeInTheDocument()

    // Percentiles
    expect(screen.getByText('-544')).toBeInTheDocument()
    expect(screen.getByText('+1,703')).toBeInTheDocument()
    expect(screen.getByText('+4,275')).toBeInTheDocument()

    // Counts
    expect(screen.getByText('1488')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders loading state when isLoading is true', () => {
    render(<MetricsPanel isLoading={true} />)
    expect(
      screen.getByText(/calculating forecast accuracy/i)
    ).toBeInTheDocument()
  })

  it('renders error state when isError is true', () => {
    render(
      <MetricsPanel
        isError={true}
        errorMessage="Database snapshot not found"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Database snapshot not found'
    )
  })

  it('renders empty state when count is 0', () => {
    render(
      <MetricsPanel
        metrics={{
          mae: null,
          rmse: null,
          bias: null,
          mape: null,
          p10: null,
          p50: null,
          p90: null,
          count: 0,
          dropped_count: 10,
        }}
      />
    )
    expect(
      screen.getByText(/no evaluated slots/i)
    ).toBeInTheDocument()
  })
})
