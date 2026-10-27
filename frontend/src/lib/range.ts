// this file is responsible for defining utility functions and types
// related to date ranges used in the frontend application,
// including clamping, validation, and conversion between ISO and local date-time formats
// in simple words, this file contains functions that help manage and manipulate date ranges for the frontend application

import type { MetaResponse } from '../api/types'

export interface DateRange {
  start: string
  end: string
}

export type PresetKey = '1d' | '3d' | '7d' | 'month'

export const FALLBACK_WINDOW: DateRange = {
  start: '2026-01-01T00:00:00Z',
  end: '2026-02-01T00:00:00Z',
}

export function getWindowFromMeta(meta?: MetaResponse | null): DateRange {
  if (!meta) {
    return FALLBACK_WINDOW
  }
  const minTime = meta.actuals?.min_time || FALLBACK_WINDOW.start
  const maxTime = meta.actuals?.max_time
  let endTime = FALLBACK_WINDOW.end
  if (maxTime) {
    const endMs = new Date(maxTime).getTime() + 30 * 60 * 1000
    endTime = new Date(endMs).toISOString()
  }
  return {
    start: minTime,
    end: endTime,
  }
}

export function clampRange(range: DateRange, window: DateRange): DateRange {
  const winStartMs = new Date(window.start).getTime()
  const winEndMs = new Date(window.end).getTime()

  let startMs = new Date(range.start).getTime()
  let endMs = new Date(range.end).getTime()

  if (isNaN(startMs)) startMs = winStartMs
  if (isNaN(endMs)) endMs = winEndMs

  startMs = Math.max(winStartMs, Math.min(startMs, winEndMs))
  endMs = Math.min(winEndMs, Math.max(endMs, winStartMs))

  if (startMs >= endMs) {
    // If clamped to zero or inverted, keep at least 30m if possible
    if (endMs - winStartMs >= 30 * 60 * 1000) {
      startMs = endMs - 30 * 60 * 1000
    } else {
      endMs = startMs + 30 * 60 * 1000
    }
  }

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
  }
}

export function buildPreset(preset: PresetKey, window: DateRange): DateRange {
  const endMs = new Date(window.end).getTime()
  let durationMs = 0

  switch (preset) {
    case '1d':
      durationMs = 24 * 60 * 60 * 1000
      break
    case '3d':
      durationMs = 3 * 24 * 60 * 60 * 1000
      break
    case '7d':
      durationMs = 7 * 24 * 60 * 60 * 1000
      break
    case 'month':
    default:
      return { start: window.start, end: window.end }
  }

  const startMs = endMs - durationMs
  return clampRange(
    {
      start: new Date(startMs).toISOString(),
      end: window.end,
    },
    window
  )
}

export function isoToDateTimeLocal(isoString: string): string {
  if (!isoString) return ''
  // e.g. "2026-01-01T00:00:00Z" -> "2026-01-01T00:00"
  return isoString.slice(0, 16)
}

export function dateTimeLocalToIso(localString: string): string {
  if (!localString) return ''
  // localString is "YYYY-MM-DDTHH:mm"
  // Interpret directly as UTC
  return `${localString}:00Z`
}

export function validateRange(range: DateRange, window: DateRange): string | null {
  if (!range.start || !range.end) {
    return 'Start and end time must be specified.'
  }
  const startMs = new Date(range.start).getTime()
  const endMs = new Date(range.end).getTime()
  const winStartMs = new Date(window.start).getTime()
  const winEndMs = new Date(window.end).getTime()

  if (isNaN(startMs) || isNaN(endMs)) {
    return 'Invalid date format.'
  }

  if (startMs >= endMs) {
    return 'Start time must be strictly earlier than end time.'
  }

  if (startMs < winStartMs || endMs > winEndMs) {
    return `Range must be inside delivery window (${window.start.slice(0, 10)} to ${window.end.slice(0, 10)}).`
  }

  return null
}
