// this file is responsible for defining the custom React hooks used in the frontend application
// to fetch and manage wind data from the backend API, including meta information, series data, and metrics

import { useQuery } from '@tanstack/react-query'
import { getJson } from '../api/client'
import type {
  HorizonMetricItem,
  HourMetricItem,
  MetaResponse,
  MetricsResponse,
  SeriesResponse,
} from '../api/types'

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => getJson<MetaResponse>('/api/meta'),
    staleTime: Infinity,
  })
}

export function useSeries(start: string, end: string, cutoff: string, enabled = true) {
  return useQuery({
    queryKey: ['series', start, end, cutoff],
    queryFn: () =>
      getJson<SeriesResponse>('/api/series', {
        start,
        end,
        cutoff,
      }),
    enabled: enabled && Boolean(start && end),
    staleTime: Infinity,
  })
}

export function useMetrics(start: string, end: string, cutoff: string, enabled = true) {
  return useQuery({
    queryKey: ['metrics', start, end, cutoff],
    queryFn: () =>
      getJson<MetricsResponse>('/api/metrics', {
        start,
        end,
        cutoff,
      }),
    enabled: enabled && Boolean(start && end),
    staleTime: Infinity,
  })
}

export function useMetricsByHour(start: string, end: string, cutoff: string, enabled = true) {
  return useQuery({
    queryKey: ['metricsByHour', start, end, cutoff],
    queryFn: () =>
      getJson<HourMetricItem[]>('/api/metrics/by-hour', {
        start,
        end,
        cutoff,
      }),
    enabled: enabled && Boolean(start && end),
    staleTime: Infinity,
  })
}

// Notice: byHorizon does NOT include cutoff in its queryKey or params per domain rules
export function useMetricsByHorizon(start: string, end: string, enabled = true) {
  return useQuery({
    queryKey: ['metricsByHorizon', start, end],
    queryFn: () =>
      getJson<HorizonMetricItem[]>('/api/metrics/by-horizon', {
        start,
        end,
      }),
    enabled: enabled && Boolean(start && end),
    staleTime: Infinity,
  })
}
