import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Source {
  id: string
  name: string
  url: string
  icon_url: string | null
  active: boolean
  scraper_key: string
  last_scraped_at: string | null
}

export interface Property {
  id: string
  source_id: string
  external_id: string
  title: string
  address: string | null
  city: string | null
  state: string | null
  property_type: string | null
  area_m2: number | null
  appraised_value: number | null
  auction_price: number
  discount_pct: number | null
  description: string | null
  edital_url: string | null
  photos: string[]
  auction_date: string | null
  auction_status: string
  auction_modality: string | null
  area_classification: string | null   // heurística do scraper; IA sobrescreve via leila_evaluations.area_classification
  scraped_at: string
  leila_sources?: Pick<Source, 'name' | 'icon_url'>
  leila_evaluations?: Evaluation | null
}

export interface PropertiesResponse {
  data: Property[]
  total: number
  page: number
  limit: number
}

export interface PropertyFilters {
  user_id?: string
  price_min: number | null
  price_max: number | null
  states: string[]
  cities: string[]
  property_types: string[]
  discount_min: number | null
  modality_categories: string[]
}

export interface Favorite {
  id: string
  user_id: string
  property_id: string
  notes: string | null
  created_at: string
  leila_properties?: Property
}

export interface EvaluationFinancialData {
  estimated_total_cost: number
  total_cost_breakdown: {
    arrematacao: number
    itbi: number
    itbi_pct: number
    registro_cartorio: number
    comissao_leiloeiro: number
    custo_total: number
  }
  market_avg_price_m2: number | null
  price_vs_market_pct: number | null
  rental_estimate_monthly: number | null
  rental_yield_annual_pct: number | null
  financial_verdict: string
  liquidity_assessment: 'alta' | 'media' | 'baixa'
}

export interface Evaluation {
  id: string
  property_id: string
  status: 'pending' | 'processing' | 'done' | 'error'
  score: number | null
  recommendation: 'strong_buy' | 'consider' | 'risky' | 'avoid' | null
  summary: string | null
  area_classification: 'nobre' | 'intermediário' | 'popular' | 'comunidade' | 'indefinido' | null
  location_notes: string | null
  condition_notes: string | null
  documents_notes: string | null
  risks: string[]
  highlights: string[]
  price_per_m2: number | null
  financial_data: EvaluationFinancialData | null
  evaluated_at: string | null
}

export interface ScrapeResult {
  total: number
  inserted: number
  updated: number
  errors: number
}

// ── Sources ────────────────────────────────────────────────────────────────

export const api = {
  sources: {
    list: () => apiFetch<Source[]>('/api/sources'),
    toggle: (id: string, active: boolean) =>
      apiFetch<Source>(`/api/sources/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
  },

  // ── Properties ───────────────────────────────────────────────────────────
  properties: {
    list: (params: Record<string, string | number | undefined> = {}) => {
      const q = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
      return apiFetch<PropertiesResponse>(`/api/properties?${q}`)
    },
    get: (id: string) => apiFetch<Property>(`/api/properties/${id}`),
    cities: (search: string) => apiFetch<string[]>(`/api/properties/cities?search=${encodeURIComponent(search)}`),
  },

  // ── Filters ──────────────────────────────────────────────────────────────
  filters: {
    get: () => apiFetch<PropertyFilters>('/api/filters'),
    save: (filters: Partial<PropertyFilters>) =>
      apiFetch<PropertyFilters>('/api/filters', {
        method: 'PUT',
        body: JSON.stringify(filters),
      }),
  },

  // ── Favorites ────────────────────────────────────────────────────────────
  favorites: {
    list: () => apiFetch<Favorite[]>('/api/favorites'),
    add: (property_id: string) =>
      apiFetch<Favorite>('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ property_id }),
      }),
    remove: (property_id: string) =>
      apiFetch<void>(`/api/favorites/${property_id}`, { method: 'DELETE' }),
  },

  // ── Evaluations ──────────────────────────────────────────────────────────
  evaluations: {
    get: (property_id: string) => apiFetch<Evaluation>(`/api/evaluations/${property_id}`),
    request: (property_id: string) =>
      apiFetch<{ message: string; property_id: string }>('/api/evaluations', {
        method: 'POST',
        body: JSON.stringify({ property_id }),
      }),
  },

  // ── Scraper ──────────────────────────────────────────────────────────────
  scraper: {
    status: () => apiFetch<{ service: string; proxy_count: number }>('/api/scraper/status'),
    runAll: () => apiFetch<Record<string, ScrapeResult>>('/api/scraper/run/all', { method: 'POST' }),
    runSource: (source_id: string) =>
      apiFetch<ScrapeResult>(`/api/scraper/run/${source_id}`, { method: 'POST' }),
  },
}
