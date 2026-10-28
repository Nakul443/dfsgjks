import { describe, expect, it } from 'vitest'
import {
  formatAxisDate,
  formatBiasText,
  formatMW,
  formatPercent,
  formatUtcTime,
} from '../lib/format'

describe('format utilities', () => {
  it('formats MW with thousands separators and rounds to integer', () => {
    expect(formatMW(12345.67)).toBe('12,346')
    expect(formatMW(0)).toBe('0')
    expect(formatMW(null)).toBe('—')
    expect(formatMW(undefined)).toBe('—')
  })

  it('formats percentages with 1 decimal place', () => {
    expect(formatPercent(22.44)).toBe('22.4%')
    expect(formatPercent(0)).toBe('0.0%')
    expect(formatPercent(null)).toBe('—')
  })

  it('formats bias in plain language', () => {
    expect(formatBiasText(1851.9)).toBe('Over-forecast by 1,852 MW on avg')
    expect(formatBiasText(-450.2)).toBe('Under-forecast by 450 MW on avg')
    expect(formatBiasText(0)).toBe('Zero bias on avg')
    expect(formatBiasText(null)).toBe('—')
    expect(formatBiasText(undefined)).toBe('—')
  })

  it('formats UTC dates in standard UK notation', () => {
    const iso = '2026-01-10T14:30:00Z'
    expect(formatUtcTime(iso)).toBe('10 Jan 14:30 UTC')
    expect(formatAxisDate(iso)).toBe('10 Jan 14:30')
  })
})
