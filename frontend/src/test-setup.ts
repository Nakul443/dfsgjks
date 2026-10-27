import '@testing-library/jest-dom/vitest'
import React from 'react'
import { vi } from 'vitest'

// Mock recharts components for reliable jsdom testing without layout engine dependencies
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>()
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    ComposedChart: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'composed-chart' }, children),
    Legend: () =>
      React.createElement(
        'div',
        { 'data-testid': 'chart-legend' },
        React.createElement('span', null, 'Actual (FUELHH)'),
        React.createElement('span', null, 'Forecast at decision time (WINDFOR)'),
        React.createElement('span', null, 'Historical error band')
      ),
  }
})
