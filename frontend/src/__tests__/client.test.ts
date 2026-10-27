import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getJson } from '../api/client'

describe('api client getJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches JSON successfully', async () => {
    const mockData = { status: 'ok' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const result = await getJson<{ status: string }>('/health')
    expect(result).toEqual(mockData)
  })

  it('serializes query parameters correctly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await getJson('/api/series', {
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-02T00:00:00Z',
      cutoff: '09:00',
      empty: '',
      skipped: undefined,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const callUrl = fetchSpy.mock.calls[0][0] as string
    expect(callUrl).toContain('start=2026-01-01T00%3A00%3A00Z')
    expect(callUrl).toContain('end=2026-01-02T00%3A00%3A00Z')
    expect(callUrl).toContain('cutoff=09%3A00')
    expect(callUrl).not.toContain('empty=')
    expect(callUrl).not.toContain('skipped=')
  })

  it('throws ApiError with detail message on 422 error', async () => {
    const errorBody = { detail: 'Range outside allowed delivery window' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(errorBody), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )

    await expect(getJson('/api/series', { start: 'invalid' })).rejects.toThrow(
      'Range outside allowed delivery window'
    )

    try {
      await getJson('/api/series', { start: 'invalid' })
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(ApiError)
      if (e instanceof ApiError) {
        expect(e.status).toBe(422)
        expect(e.detail).toBe('Range outside allowed delivery window')
      }
    }
  })

  it('throws ApiError on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Failed to connect'))

    await expect(getJson('/health')).rejects.toThrow('Network failure: Failed to connect')
  })
})
