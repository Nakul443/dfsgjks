import { describe, expect, it } from 'vitest'
import {
  buildPreset,
  clampRange,
  dateTimeLocalToIso,
  FALLBACK_WINDOW,
  getWindowFromMeta,
  isoToDateTimeLocal,
  validateRange,
} from '../lib/range'
import type { MetaResponse } from '../api/types'

describe('range utilities', () => {
  const customMeta: MetaResponse = {
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

  it('getWindowFromMeta computes correct start and +30m end', () => {
    const fallback = getWindowFromMeta(null)
    expect(fallback).toEqual(FALLBACK_WINDOW)

    const window = getWindowFromMeta(customMeta)
    expect(window.start).toBe('2026-01-01T00:00:00Z')
    expect(window.end).toBe('2026-02-01T00:00:00.000Z')
  })

  it('buildPreset returns ranges relative to window end', () => {
    const window = {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-02-01T00:00:00.000Z',
    }

    const p1d = buildPreset('1d', window)
    expect(p1d.start).toBe('2026-01-31T00:00:00.000Z')
    expect(p1d.end).toBe('2026-02-01T00:00:00.000Z')

    const p3d = buildPreset('3d', window)
    expect(p3d.start).toBe('2026-01-29T00:00:00.000Z')
    expect(p3d.end).toBe('2026-02-01T00:00:00.000Z')

    const p7d = buildPreset('7d', window)
    expect(p7d.start).toBe('2026-01-25T00:00:00.000Z')
    expect(p7d.end).toBe('2026-02-01T00:00:00.000Z')

    const pMonth = buildPreset('month', window)
    expect(pMonth.start).toBe('2026-01-01T00:00:00.000Z')
    expect(pMonth.end).toBe('2026-02-01T00:00:00.000Z')
  })

  it('clampRange confines out-of-bounds ranges into window', () => {
    const window = {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-02-01T00:00:00.000Z',
    }

    const clamped = clampRange(
      {
        start: '2025-12-25T00:00:00.000Z',
        end: '2026-02-15T00:00:00.000Z',
      },
      window
    )
    expect(clamped.start).toBe(window.start)
    expect(clamped.end).toBe(window.end)
  })

  it('converts between ISO and datetime-local format', () => {
    const iso = '2026-01-15T14:30:00Z'
    const local = isoToDateTimeLocal(iso)
    expect(local).toBe('2026-01-15T14:30')
    expect(dateTimeLocalToIso(local)).toBe('2026-01-15T14:30:00Z')
  })

  it('validateRange detects start >= end and out of window', () => {
    const window = {
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-02-01T00:00:00.000Z',
    }

    expect(
      validateRange(
        { start: '2026-01-05T00:00:00Z', end: '2026-01-10T00:00:00Z' },
        window
      )
    ).toBeNull()

    expect(
      validateRange(
        { start: '2026-01-10T00:00:00Z', end: '2026-01-05T00:00:00Z' },
        window
      )
    ).toBe('Start time must be strictly earlier than end time.')

    expect(
      validateRange(
        { start: '2025-12-31T00:00:00Z', end: '2026-01-05T00:00:00Z' },
        window
      )
    ).toContain('Range must be inside delivery window')
  })
})
