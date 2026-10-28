// this file is responsible for defining utility functions used in the frontend application
// to format numerical values and date-time strings for display in the user interface
// in simple words, this file contains functions that help present data in a readable format for users

export function formatMW(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }
  return new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '—'
  }
  return `${value.toFixed(1)}%`
}

export function formatBiasText(bias: number | null | undefined): string {
  if (bias === null || bias === undefined || isNaN(bias)) {
    return '—'
  }
  if (bias > 0) {
    return `Over-forecast by ${formatMW(bias)} MW on avg`
  }
  if (bias < 0) {
    return `Under-forecast by ${formatMW(Math.abs(bias))} MW on avg`
  }
  return 'Zero bias on avg'
}

export function formatUtcTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '—'

  const d = date.getUTCDate().toString().padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = months[date.getUTCMonth()]
  const hh = date.getUTCHours().toString().padStart(2, '0')
  const mm = date.getUTCMinutes().toString().padStart(2, '0')

  return `${d} ${m} ${hh}:${mm} UTC`
}

export function formatAxisDate(isoString: string): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''

  const d = date.getUTCDate().toString().padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = months[date.getUTCMonth()]
  const hh = date.getUTCHours().toString().padStart(2, '0')
  const mm = date.getUTCMinutes().toString().padStart(2, '0')

  return `${d} ${m} ${hh}:${mm}`
}
