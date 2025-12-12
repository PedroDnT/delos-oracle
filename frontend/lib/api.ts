import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000',
  timeout: 10000,
})

export interface RateData {
  rate_type: string
  answer: number
  raw_value: number
  real_world_date: number
  timestamp: number
  source: string
  is_stale: boolean
  heartbeat_seconds: number
}

export interface RateHistoryItem {
  rate_type: string
  raw_value: number
  real_world_date: number
  bcb_timestamp: string
  fetch_timestamp: string
}

export interface SyncResponse {
  success: boolean
  rates_updated: number
  rates_skipped: number
  rates_failed: number
  anomalies_detected: number
  tx_hash: string | null
  error: string | null
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  bcb_api: boolean
  oracle_connection: boolean
  scheduler_running: boolean
  last_update: string
  version: string
}

export const ratesAPI = {
  getAll: () => api.get<RateData[]>('/rates'),
  getRate: (type: string) => api.get<RateData>(`/rates/${type}`),
  getHistory: (type: string, days: number = 30) =>
    api.get<{ rate_type: string; data: RateHistoryItem[] }>(
      `/rates/${type}/history?days=${days}`
    ),
  sync: (rateType?: string) =>
    api.post<SyncResponse>('/sync', { rate_type: rateType }),
  health: () => api.get<HealthResponse>('/health'),
}

export default api
