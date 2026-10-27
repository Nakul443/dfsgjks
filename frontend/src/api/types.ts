// this file is responsible for defining the types used in the frontend application
// to represent the data structures returned by the backend API

export interface DatasetBounds {
  min_time: string
  max_time: string
  row_count: number
}

export interface MetaResponse {
  actuals: DatasetBounds
  forecasts: DatasetBounds
  default_cutoff: string
}

export interface SeriesItem {
  time: string
  forecast: number | null
  publish_time: string | null
  horizon_hours: number | null
  actual: number | null
  error: number | null
  band_low: number | null
  band_high: number | null
}

export interface SeriesResponse {
  count: number
  data: SeriesItem[]
}

export interface MetricsResponse {
  mae: number | null
  rmse: number | null
  bias: number | null
  mape: number | null
  p10: number | null
  p50: number | null
  p90: number | null
  count: number
  dropped_count: number
}

export interface HourMetricItem {
  hour: number
  mae: number | null
  bias: number | null
  count: number
}

export interface HorizonMetricItem {
  bucket: string
  mae: number | null
  bias: number | null
  count: number
}
