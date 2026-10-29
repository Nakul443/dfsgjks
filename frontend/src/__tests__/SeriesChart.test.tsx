import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeriesChart } from '../components/SeriesChart'
import type { SeriesItem } from '../api/types'

describe('SeriesChart component', () => {
  const sampleData: SeriesItem[] = [
    {
      time: '2026-01-10T00:00:00Z',
      forecast: 11542,
      publish_time: '2026-01-09T07:30:00Z',
      horizon_hours: 16.5,
      actual: 11309,
      error: 233,
      band_low: 7267.1,
      band_high: 12086.1,
    },
    {
      time: '2026-01-10T00:30:00Z',
      forecast: 11542,
      publish_time: '2026-01-09T07:30:00Z',
      horizon_hours: 17.0,
      actual: 11280,
      error: 262,
      band_low: 7267.1,
      band_high: 12086.1,
    },
  ]

  it('renders loading state when isLoading is true', () => {
    render(<SeriesChart data={[]} isLoading={true} />)
    expect(screen.getByText(/loading decision-time wind series/i)).toBeInTheDocument()
  })

  it('renders error state when isError is true', () => {
    render(
      <SeriesChart
        data={[]}
        isError={true}
        errorMessage="Failed to fetch series from server"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to fetch series from server'
    )
  })

  it('renders empty message when data is empty', () => {
    render(<SeriesChart data={[]} />)
    expect(
      screen.getByText(/no delivery slots found/i)
    ).toBeInTheDocument()
  })

  it('renders chart title, slots badge, and legend labels when data is provided', () => {
    render(<SeriesChart data={sampleData} />)

    expect(
      screen.getByText(/wind generation: actual vs decision-time forecast/i)
    ).toBeInTheDocument()
    expect(screen.getByText('2 slots')).toBeInTheDocument()
    expect(screen.getByText('Actual (FUELHH)')).toBeInTheDocument()
    expect(
      screen.getByText('Forecast at decision time (WINDFOR)')
    ).toBeInTheDocument()
    expect(screen.getByText('Historical error band')).toBeInTheDocument()
  })
})
