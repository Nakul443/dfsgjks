import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ByHourChart } from '../components/ByHourChart'
import type { HourMetricItem } from '../api/types'

describe('ByHourChart component', () => {
  const mockHourData: HourMetricItem[] = [
    { hour: 0, mae: 2162, bias: 2084, count: 62 },
    { hour: 1, mae: 2301, bias: 2256, count: 62 },
    { hour: 2, mae: 2412, bias: 2366, count: 62 },
  ]

  it('renders loading state when isLoading is true', () => {
    render(<ByHourChart isLoading={true} />)
    expect(
      screen.getByText(/loading hourly accuracy patterns/i)
    ).toBeInTheDocument()
  })

  it('renders error state when isError is true', () => {
    render(
      <ByHourChart
        isError={true}
        errorMessage="Failed to fetch hourly metrics"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to fetch hourly metrics'
    )
  })

  it('renders empty message when data is empty', () => {
    render(<ByHourChart data={[]} />)
    expect(
      screen.getByText(/no hourly data available/i)
    ).toBeInTheDocument()
  })

  it('renders chart title and subtitles when data is provided', () => {
    render(<ByHourChart data={mockHourData} />)
    expect(
      screen.getByText(/error by hour of day \(utc\)/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/mean absolute error \(bars\) and forecast bias \(line\)/i)
    ).toBeInTheDocument()
  })
})
