import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MethodologyNote } from '../components/MethodologyNote'

describe('MethodologyNote component', () => {
  it('is collapsed by default with View Details button', () => {
    render(<MethodologyNote />)

    const toggle = screen.getByRole('button', { name: /methodology/i })
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByText(/the 09:00 utc cutoff assumption/i)
    ).not.toBeInTheDocument()
  })

  it('expands on click showing all 6 domain sections and collapses on second click', () => {
    render(<MethodologyNote />)

    const toggle = screen.getByRole('button', { name: /methodology/i })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(/1\. decision-time forecast \(windfor\)/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/2\. the 09:00 utc cutoff assumption/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/3\. hourly-to-half-hourly carry-forward/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/4\. error calculation & metrics/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/5\. historical planning error band/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/6\. data sources & time standard/i)
    ).toBeInTheDocument()

    // Collapse
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByText(/2\. the 09:00 utc cutoff assumption/i)
    ).not.toBeInTheDocument()
  })
})
