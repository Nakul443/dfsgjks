import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Controls } from '../components/Controls'

describe('Controls component', () => {
  const defaultProps = {
    range: {
      start: '2026-01-01T00:00:00Z',
      end: '2026-02-01T00:00:00Z',
    },
    window: {
      start: '2026-01-01T00:00:00Z',
      end: '2026-02-01T00:00:00Z',
    },
    cutoff: '09:00',
    errorMessage: null,
    onRangeChange: vi.fn(),
    onCutoffChange: vi.fn(),
    onPresetSelect: vi.fn(),
  }

  it('renders start, end, presets, and cutoff inputs', () => {
    render(<Controls {...defaultProps} />)

    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/decision cutoff/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /1 day/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3 days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7 days/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /full month/i })).toBeInTheDocument()
  })

  it('triggers onPresetSelect when a preset button is clicked', () => {
    const onPresetSelect = vi.fn()
    render(<Controls {...defaultProps} onPresetSelect={onPresetSelect} />)

    fireEvent.click(screen.getByRole('button', { name: /7 days/i }))
    expect(onPresetSelect).toHaveBeenCalledWith('7d')
  })

  it('triggers onCutoffChange when cutoff input is changed', () => {
    const onCutoffChange = vi.fn()
    render(<Controls {...defaultProps} onCutoffChange={onCutoffChange} />)

    const cutoffInput = screen.getByLabelText(/decision cutoff/i)
    fireEvent.change(cutoffInput, { target: { value: '11:30' } })
    expect(onCutoffChange).toHaveBeenCalledWith('11:30')
  })

  it('displays error banner when errorMessage is passed', () => {
    render(
      <Controls
        {...defaultProps}
        errorMessage="Start time must be strictly earlier than end time."
      />
    )

    const errorBanner = screen.getByRole('alert')
    expect(errorBanner).toBeInTheDocument()
    expect(errorBanner).toHaveTextContent(
      'Start time must be strictly earlier than end time.'
    )
  })
})
