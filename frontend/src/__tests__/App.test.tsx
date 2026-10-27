import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

describe('App controls and state integration', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    queryClient.clear()
  })

  it('renders controls, updates range state on preset click, and displays inline error on invalid range', async () => {
    const mockMeta = {
      actuals: {
        min_time: '2026-01-01T00:00:00Z',
        max_time: '2026-01-31T23:30:00Z',
        row_count: 1488,
      },
      forecasts: {
        min_time: '2026-01-01T00:00:00Z',
        max_time: '2026-01-31T23:00:00Z',
        row_count: 18080,
      },
      default_cutoff: '09:00',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/meta')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockMeta), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      }
      return Promise.resolve(
        new Response(JSON.stringify({ count: 0, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )

    // Wait for metadata to resolve and initialize
    await screen.findByText(/Loaded \(1488 actuals/i)

    // Click 1 day preset (start: 2026-01-31T00:00, end: 2026-02-01T00:00)
    const preset1d = screen.getByRole('button', { name: /1 day/i })
    fireEvent.click(preset1d)

    await waitFor(() => {
      expect(screen.getByDisplayValue('2026-01-31T00:00')).toBeInTheDocument()
    })

    // Now change end time to be earlier than start time (e.g. 2026-01-15T00:00)
    const endInput = screen.getByLabelText(/end time/i)
    fireEvent.change(endInput, { target: { value: '2026-01-15T00:00' } })

    // Error message should appear inline
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert).toHaveTextContent(
        'Start time must be strictly earlier than end time.'
      )
    })

    // Selection status confirms queries are paused
    expect(screen.getByText(/Paused \(validation error\)/i)).toBeInTheDocument()
  })
})
