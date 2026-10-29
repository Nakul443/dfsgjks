import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ByHorizonChart } from '../components/ByHorizonChart'
import type { HorizonMetricItem } from '../api/types'

describe('ByHorizonChart component', () => {
  const mockHorizonData: HorizonMetricItem[] = [
    { bucket: '0-6', mae: 1767, bias: 1548, count: 1488 },
    { bucket: '6-12', mae: 1833, bias: 1616, count: 1488 },
    { bucket: '12-24', mae: 1990, bias: 1811, count: 2976 },
    { bucket: '24-36', mae: 2122, bias: 1838, count: 2976 },
    { bucket: '36-48', mae: 2337, bias: 2004, count: 2945 },
    { bucket: '48+', mae: 2371, bias: 1479, count: 2510 },
  ]

  it('renders loading state when isLoading is true', () => {
    render(<ByHorizonChart isLoading={true} />)
    expect(
      screen.getByText(/loading horizon accuracy curve/i)
    ).toBeInTheDocument()
  })

  it('renders error state when isError is true', () => {
    render(
      <ByHorizonChart
        isError={true}
        errorMessage="Failed to fetch horizon metrics"
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to fetch horizon metrics'
    )
  })

  it('renders empty message when data is empty', () => {
    render(<ByHorizonChart data={[]} />)
    expect(
      screen.getByText(/no horizon data available/i)
    ).toBeInTheDocument()
  })

  it('renders title, subtitle, and methodology caption when data is provided', () => {
    render(<ByHorizonChart data={mockHorizonData} />)

    expect(
      screen.getByText(/error by forecast horizon \(hours ahead\)/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/mae degradation across all published windfor forecasts/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /uses all published forecasts, hourly slots only\. does not depend on the cutoff\./i
      )
    ).toBeInTheDocument()
  })
})
