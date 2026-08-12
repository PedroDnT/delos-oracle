import axios from 'axios'

// The dashboard reads rates straight from Supabase — the `latest_rates` view
// exposes the most recent row per rate type with staleness precomputed.
// Both values are public by design: the anon key ships in every Supabase
// client bundle and row access is limited by RLS to read-only.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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

const api = axios.create({
  baseURL: `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`,
  timeout: 10000,
  headers: {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
})

export const ratesAPI = {
  getAll: () => api.get<RateData[]>('/latest_rates', { params: { select: '*' } }),
  getHistory: (type: string, limit: number = 30) =>
    api.get<RateData[]>('/rates', {
      params: {
        select: '*',
        rate_type: `eq.${type}`,
        order: 'real_world_date.desc',
        limit,
      },
    }),
}

export default api
