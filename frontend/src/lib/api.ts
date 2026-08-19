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
  implementation_status?: 'planned' | 'testing' | 'ready' | 'blocked' | 'deprecated' | string
  source_kind?: 'official' | 'auctioneer' | 'aggregator' | 'coverage_target' | string
  coverage_mode?: 'direct' | 'indirect' | 'none' | string
  covered_by_source_id?: string | null
  requires_external_service?: boolean
  last_attempted_at?: string | null
  last_successful_at?: string | null
  last_status?: string | null
  last_error?: string | null
  last_found_count?: number
  last_written_count?: number
  last_duration_ms?: number | null
  consecutive_failures?: number
  coverage_notes?: string | null
  collector_version?: string | null
  target_state?: string
  target_city?: string
  property_count?: number
  operational_status?: 'collecting' | 'paused' | 'covered_indirectly' | string
  coverages?: Array<{
    collector_source_id: string
    covered_source_id: string
    observed_count: number
    last_observed_at: string | null
    strategy: string
    evidence_notes: string | null
  }>
  implemented?: boolean
  can_activate?: boolean
}

export interface Property {
  id: string
  source_id: string
  external_id: string
  seller_id: string | null
  title: string
  address: string | null
  city: string | null
  state: string | null
  /** Bairro normalizado pelo pipeline. Opcional durante a transição da API. */
  neighborhood?: string | null
  property_type: string | null
  area_m2: number | null
  appraised_value: number | null
  auction_price: number
  discount_pct: number | null
  description: string | null
  listing_url: string | null
  edital_url: string | null
  photos: string[]
  auction_date: string | null
  auction_status: string
  auction_modality: string | null
  auction_stage: 'first' | 'second' | 'single' | 'unknown' | null
  auction_stages: Array<{
    stage: string
    label?: string
    sequence?: number
    price: number | null
    event_at: string | null
    status?: 'completed' | 'current' | 'upcoming' | 'possible' | string
    certainty?: 'official' | 'observed' | 'possible' | string
  }>
  current_stage_price: number | null
  current_stage_date: string | null
  target_stage: string | null
  journey_confidence: 'official' | 'observed' | 'partial' | 'unknown' | string
  area_classification: string | null   // heurística do scraper; IA sobrescreve via leila_evaluations.area_classification
  bedrooms: number | null
  bathrooms: number | null
  parking_spots: number | null
  useful_area_m2: number | null
  filter_area_m2: number | null
  price_per_m2?: number | null
  effective_price_per_m2?: number | null
  opportunity_score?: number | null
  opportunity_confidence?: 'high' | 'medium' | 'low' | 'alta' | 'média' | 'baixa' | string | null
  opportunity_components?: {
    discount?: { points?: number; max_points?: number; value_pct?: number | null }
    relative_value?: { points?: number; max_points?: number; property_price_per_m2?: number | null; neighborhood_median_price_per_m2?: number | null }
    data_quality?: { points?: number; max_points?: number; quality_score?: number | null }
    availability_trust?: { points?: number; max_points?: number; status?: string | null; last_verified_at?: string | null }
    scope?: string
    excludes?: string[]
  } | null
  opportunity_factors?: Array<string | {
    label?: string
    name?: string
    impact?: 'positive' | 'negative' | 'neutral' | string
    value?: number | string
  }> | null
  neighborhood_score?: number | null
  neighborhood_confidence?: 'high' | 'medium' | 'low' | 'alta' | 'média' | 'baixa' | string | null
  neighborhood_profile?: {
    score?: number | null
    confidence?: 'high' | 'medium' | 'low' | 'alta' | 'média' | 'baixa' | string | null
    label?: string | null
    summary?: string | null
    trend?: string | null
    liquidity?: string | null
    evidence_count?: number | null
  } | null
  is_occupied: boolean | null
  heat_score: number | null            // calculado no banco via trigger (migration 007)
  is_active: boolean
  availability_status: 'available' | 'suspect' | 'unavailable'
  last_seen_at: string | null
  last_verified_at: string | null
  missing_count: number
  data_quality_score: number
  scraped_at: string
  leila_sources?: Pick<Source, 'name' | 'icon_url' | 'url'>
  leila_evaluations?: Evaluation | null
  leila_document_analyses?: DocumentAnalysisRecord | null
  leila_favorites?: Array<{ id: string }>
  leila_discarded_properties?: Array<{ id: string }>
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
  area_classifications: string[]
  days_until_auction_max: number | null
  has_evaluation: boolean
  area_min: number | null
  area_max: number | null
  source_ids: string[]
  neighborhoods: string[]
  price_per_m2_min: number | null
  price_per_m2_max: number | null
  opportunity_score_min: number | null
  neighborhood_score_min: number | null
}

export interface CityOption {
  name: string
  count: number
}

export interface NeighborhoodProfile {
  id: string
  state: string
  city: string
  neighborhood: string
  property_count: number
  priced_property_count: number
  median_price_per_m2: number | null
  median_discount_pct: number | null
  score: number | null
  confidence: 'low' | 'medium' | 'high'
  calculated_at: string
}

export type DocumentFindingStatus = 'allowed' | 'not_allowed' | 'conditional' | 'not_found'

export interface DocumentAnalysisData {
  summary: string
  fgts: { status: DocumentFindingStatus; note: string }
  financing: { status: DocumentFindingStatus; note: string }
  occupancy: { status: 'occupied' | 'vacant' | 'unknown'; note: string }
  condominium_debt: { status: DocumentFindingStatus; responsibility: string; note: string }
  tax_debt: { status: DocumentFindingStatus; responsibility: string; note: string }
  payment_methods: string[]
  risks: Array<{ severity: 'high' | 'medium' | 'low'; title: string; detail: string }>
  confidence: 'high' | 'medium' | 'low'
}

export interface DocumentAnalysisRecord {
  id?: string
  property_id: string
  status: 'not_started' | 'processing' | 'done' | 'error' | 'unavailable'
  source_url?: string
  provider?: string | null
  model?: string | null
  tags?: string[]
  analysis?: DocumentAnalysisData | null
  evidence?: Array<{ field: string; excerpt: string }>
  input_tokens?: number
  output_tokens?: number
  error_message?: string | null
  analyzed_at?: string | null
}

export interface Favorite {
  id: string
  user_id: string
  property_id: string
  notes: string | null
  created_at: string
  leila_properties?: Property
}

export interface DiscardedProperty {
  id: string
  user_id: string
  property_id: string
  reason: string | null
  created_at: string
  leila_properties?: Property
}

export interface EvaluationFinancialData {
  resumo_executivo: {
    veredicto: 'COMPRAR' | 'NEGOCIAR' | 'EVITAR'
    score_geral: number
    frase_decisiva: string
  }
  preco_justo: {
    valor_minimo_regiao: number
    valor_mediano_regiao: number
    valor_maximo_regiao: number
    preco_justo_este_imovel: number
    preco_pedido: number
    percentual_acima_abaixo_mercado: number
    margem_negociacao_estimada_pct: number
  }
  potencial_pos_reforma: {
    custo_reforma_minimo: number
    custo_reforma_mediano: number
    custo_reforma_maximo: number
    valor_imovel_pos_reforma_minimo: number
    valor_imovel_pos_reforma_mediano: number
    valor_imovel_pos_reforma_maximo: number
    ganho_bruto_estimado_minimo: number
    ganho_bruto_estimado_mediano: number
    ganho_bruto_estimado_maximo: number
    roi_bruto_pct: number
    prazo_reforma_meses_estimado: number
  }
  analise_aluguel: {
    aluguel_mensal_minimo_regiao: number
    aluguel_mensal_mediano_regiao: number
    aluguel_mensal_maximo_regiao: number
    aluguel_esperado_pos_reforma: number
    yield_bruto_anual_pct: number
    vacancia_media_regiao_meses: number
    tempo_absorcao_mercado_dias: number
  }
  viabilidade_financeira: {
    custos_transacao?: {
      itbi: number
      comissao_leiloeiro: number
      registro_cartorio: number
      total: number
    }
    investimento_total_estimado: number
    payback_venda_meses: number
    payback_aluguel_anos: number
    tir_estimada_venda_pct: number
    tir_estimada_aluguel_pct: number
    comparativo_cdi_atual_pct: number
    supera_cdi: boolean
  }
  riscos: Array<{
    categoria: string
    descricao: string
    severidade: 'ALTO' | 'MÉDIO' | 'BAIXO'
    probabilidade_pct: number
    mitigacao: string
  }>
  indicadores_mercado: {
    liquidez_regiao: 'ALTA' | 'MÉDIA' | 'BAIXA'
    demanda_locacao: 'ALTA' | 'MÉDIA' | 'BAIXA'
    tendencia_preco_12m: 'SUBINDO' | 'ESTÁVEL' | 'CAINDO'
    variacao_preco_12m_estimada_pct: number
    perfil_comprador_alvo: string
    concorrencia_oferta_similar: 'ALTA' | 'MÉDIA' | 'BAIXA'
    tempo_medio_venda_regiao_dias: number
  }
  checklist_due_diligence: Array<{
    item: string
    prioridade: 'CRÍTICO' | 'IMPORTANTE' | 'RECOMENDADO'
    observacao: string
  }>
  recomendacao_reforma: {
    escopo_minimo: string
    escopo_recomendado: string
    itens_alto_impacto: string[]
    itens_evitar: string[]
    alerta_reforma: string
  }
  metadata: {
    regiao_referencia: string
    classificacao_regional?: 'GRANDE_CENTRO' | 'CAPITAL_MEDIA' | 'INTERIOR'
    confianca_analise: 'ALTA' | 'MÉDIA' | 'BAIXA'
    ressalvas: string
  }
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
  unchanged?: number
  rejected?: number
  errors: number
  run_id?: string | null
}

// ── LLM Settings ──────────────────────────────────────────────────────────────

export const LLM_PROVIDERS = {
  anthropic: {
    label: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (recomendado)' },
      { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6 (mais capaz)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (econômico)' },
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    models: [
      { id: 'openai/gpt-4o',                         label: 'GPT-4o' },
      { id: 'openai/gpt-4o-mini',                    label: 'GPT-4o Mini (econômico)' },
      { id: 'google/gemini-2.0-flash-001',           label: 'Gemini 2.0 Flash' },
      { id: 'google/gemini-2.5-pro-preview-03-25',   label: 'Gemini 2.5 Pro' },
      { id: 'meta-llama/llama-3.3-70b-instruct',     label: 'Llama 3.3 70B' },
      { id: 'deepseek/deepseek-chat-v3-0324',        label: 'DeepSeek V3' },
      { id: 'anthropic/claude-sonnet-4-5',           label: 'Claude Sonnet 4.5 (via OR)' },
    ],
  },
} as const

export type LlmProvider = keyof typeof LLM_PROVIDERS

export interface LlmSettings {
  user_id?: string
  llm_provider: LlmProvider
  llm_model: string
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
    cities: (search: string, states: string[] = []) => {
      const q = new URLSearchParams()
      if (search.trim()) q.set('search', search.trim())
      if (states.length) q.set('state', states.join(','))
      return apiFetch<CityOption[]>(`/api/properties/cities?${q}`)
    },
    neighborhoods: (search: string, state?: string, city?: string) => {
      const q = new URLSearchParams()
      if (search.trim()) q.set('search', search.trim())
      if (state) q.set('state', state)
      if (city) q.set('city', city)
      q.set('limit', '200')
      return apiFetch<NeighborhoodProfile[]>(`/api/properties/neighborhoods?${q}`)
    },
    documentAnalysis: (id: string) => apiFetch<DocumentAnalysisRecord>(`/api/properties/${id}/document-analysis`),
    requestDocumentAnalysis: (id: string, force = false) =>
      apiFetch<DocumentAnalysisRecord>(`/api/properties/${id}/document-analysis`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      }),
    discarded: () => apiFetch<DiscardedProperty[]>('/api/properties/discarded'),
    discard: (id: string, reason?: string) =>
      apiFetch<DiscardedProperty>(`/api/properties/${id}/discard`, {
        method: 'POST',
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    restore: (id: string) => apiFetch<void>(`/api/properties/${id}/discard`, { method: 'DELETE' }),
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
    status: () => apiFetch<{ service: string; proxy_count: number; available_sources: Record<string, unknown> }>('/api/scraper/status'),
    runAll: () => apiFetch<Record<string, ScrapeResult>>('/api/scraper/run/all', { method: 'POST' }),
    runSource: (source_id: string) =>
      apiFetch<ScrapeResult>(`/api/scraper/run/${source_id}`, { method: 'POST' }),
  },

  // ── LLM Settings ─────────────────────────────────────────────────────────
  settings: {
    get: () => apiFetch<LlmSettings>('/api/settings'),
    save: (settings: Pick<LlmSettings, 'llm_provider' | 'llm_model'>) =>
      apiFetch<LlmSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  },
}
