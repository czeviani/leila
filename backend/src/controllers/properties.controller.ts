import { Request, Response } from 'express'

const SORT_FIELDS: Record<string, string> = {
  opportunity_score: 'opportunity_score',
  heat_score: 'opportunity_score',
  neighborhood_score: 'neighborhood_score',
  neighborhood: 'neighborhood',
  property_type: 'property_type',
  price_per_m2: 'price_per_m2',
  discount_pct: 'discount_pct',
  auction_price: 'auction_price',
  area_m2: 'filter_area_m2',
  filter_area_m2: 'filter_area_m2',
  scraped_at: 'scraped_at',
  auction_date: 'auction_date',
  data_quality_score: 'data_quality_score',
  last_verified_at: 'last_verified_at',
  last_seen_at: 'last_seen_at',
  work_distance_km: 'estimated_road_distance_km',
}

const AVAILABILITY_STATUSES = new Set(['available', 'suspect', 'unavailable'])
const AREA_CLASSIFICATIONS = new Set(['nobre', 'intermediário', 'popular', 'comunidade', 'indefinido'])

const parseAvailabilityStatuses = (value: unknown): string[] | null => {
  if (value === undefined) return []
  const statuses = String(value).split(',').map(status => status.trim()).filter(Boolean)
  return statuses.length > 0 && statuses.every(status => AVAILABILITY_STATUSES.has(status))
    ? [...new Set(statuses)]
    : null
}

const parseBoundedNumber = (value: unknown, min: number, max: number): number | null => {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

type TrustProperty = {
  availability_status?: string | null
  data_quality_score?: number | null
  last_verified_at?: string | null
}

const summarizePageTrust = (properties: TrustProperty[], freshnessHours: number) => {
  const freshnessCutoff = Date.now() - freshnessHours * 60 * 60 * 1000
  const statusCounts = { available: 0, suspect: 0, unavailable: 0, unknown: 0 }
  let qualityTotal = 0
  let qualitySamples = 0
  let freshCount = 0

  for (const property of properties) {
    const status = property.availability_status
    if (status === 'available' || status === 'suspect' || status === 'unavailable') {
      statusCounts[status] += 1
    } else {
      statusCounts.unknown += 1
    }

    if (typeof property.data_quality_score === 'number') {
      qualityTotal += property.data_quality_score
      qualitySamples += 1
    }

    if (property.last_verified_at && new Date(property.last_verified_at).getTime() >= freshnessCutoff) {
      freshCount += 1
    }
  }

  return {
    scope: 'page',
    sample_size: properties.length,
    availability: statusCounts,
    average_quality: qualitySamples ? Math.round(qualityTotal / qualitySamples) : null,
    freshness_hours: freshnessHours,
    verified_fresh: freshCount,
    verified_stale_or_unknown: properties.length - freshCount,
  }
}

export const getProperties = async (req: Request, res: Response) => {
  const {
    state, city, neighborhood, type, source, price_min, price_max, discount_min, modality,
    area_min, area_max, price_per_m2_min, price_per_m2_max,
    work_distance_max,
    opportunity_score_min, neighborhood_score_min,
    search, has_evaluation, area_classification, days_until_auction_max,
    availability_status, availability, status, verified_within_hours, quality_min, occupied,
    discarded = 'false', decision,
    page = 1, limit = 50,
    sort_by = 'opportunity_score', sort_order = 'desc',
  } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  const sortField = SORT_FIELDS[String(sort_by)] ?? 'opportunity_score'
  const ascending = String(sort_order) === 'asc'
  const areaMinimum = parseBoundedNumber(area_min, 0, 1_000_000)
  const areaMaximum = parseBoundedNumber(area_max, 0, 1_000_000)
  const pricePerM2Minimum = parseBoundedNumber(price_per_m2_min, 0, 10_000_000)
  const pricePerM2Maximum = parseBoundedNumber(price_per_m2_max, 0, 10_000_000)
  const opportunityMinimum = parseBoundedNumber(opportunity_score_min, 0, 100)
  const neighborhoodMinimum = parseBoundedNumber(neighborhood_score_min, 0, 100)
  const workDistanceMaximum = parseBoundedNumber(work_distance_max, 0, 20_000)

  if (area_min !== undefined && areaMinimum === null) {
    return res.status(400).json({ error: 'area_min deve ser um número entre 0 e 1.000.000' })
  }
  if (area_max !== undefined && areaMaximum === null) {
    return res.status(400).json({ error: 'area_max deve ser um número entre 0 e 1.000.000' })
  }
  if (areaMinimum !== null && areaMaximum !== null && areaMinimum > areaMaximum) {
    return res.status(400).json({ error: 'A área mínima não pode ser maior que a área máxima' })
  }
  if (price_per_m2_min !== undefined && pricePerM2Minimum === null) {
    return res.status(400).json({ error: 'price_per_m2_min deve ser um número válido' })
  }
  if (price_per_m2_max !== undefined && pricePerM2Maximum === null) {
    return res.status(400).json({ error: 'price_per_m2_max deve ser um número válido' })
  }
  if (pricePerM2Minimum !== null && pricePerM2Maximum !== null && pricePerM2Minimum > pricePerM2Maximum) {
    return res.status(400).json({ error: 'O preço por m² mínimo não pode superar o máximo' })
  }
  if (opportunity_score_min !== undefined && opportunityMinimum === null) {
    return res.status(400).json({ error: 'opportunity_score_min deve estar entre 0 e 100' })
  }
  if (neighborhood_score_min !== undefined && neighborhoodMinimum === null) {
    return res.status(400).json({ error: 'neighborhood_score_min deve estar entre 0 e 100' })
  }
  if (work_distance_max !== undefined && workDistanceMaximum === null) {
    return res.status(400).json({ error: 'work_distance_max deve estar entre 0 e 20.000 km' })
  }

  const requestedAvailability = availability_status ?? availability ?? status
  const availabilityStatuses = parseAvailabilityStatuses(requestedAvailability)
  if (availabilityStatuses === null) {
    return res.status(400).json({
      error: 'availability_status deve conter available, suspect e/ou unavailable',
    })
  }

  const verifiedHours = parseBoundedNumber(verified_within_hours, 1, 8760)
  if (verified_within_hours !== undefined && verifiedHours === null) {
    return res.status(400).json({ error: 'verified_within_hours deve ser um número entre 1 e 8760' })
  }

  const qualityMinimum = parseBoundedNumber(quality_min, 0, 100)
  if (quality_min !== undefined && qualityMinimum === null) {
    return res.status(400).json({ error: 'quality_min deve ser um número entre 0 e 100' })
  }
  if (!['false', 'true', 'all'].includes(String(discarded))) {
    return res.status(400).json({ error: 'discarded deve ser false, true ou all' })
  }
  if (decision !== undefined && !['approved', 'rejected', 'unreviewed'].includes(String(decision))) {
    return res.status(400).json({ error: 'decision deve ser approved, rejected ou unreviewed' })
  }

  let query = req.supabase!
    .from('leila_properties')
    .select('*, leila_sources:leila_sources!leila_properties_source_id_fkey(name, icon_url, url), leila_evaluations(*), leila_document_analyses(status, tags, analysis, analyzed_at), leila_favorites(id), leila_discarded_properties(id)', { count: 'exact' })
    .eq('in_scope', true)
    .order(sortField, { ascending, nullsFirst: false })
    .range(offset, offset + Number(limit) - 1)

  // Descartes são pessoais (RLS) e, por padrão, não ocupam espaço na paginação.
  if (decision === 'approved') {
    query = query.not('leila_favorites', 'is', null).is('leila_discarded_properties', null)
  } else if (decision === 'rejected') {
    query = query.not('leila_discarded_properties', 'is', null)
  } else if (decision === 'unreviewed') {
    query = query.is('leila_favorites', null).is('leila_discarded_properties', null)
  } else {
    if (discarded === 'false') query = query.is('leila_discarded_properties', null)
    if (discarded === 'true') query = query.not('leila_discarded_properties', 'is', null)
  }

  if (availabilityStatuses.length > 0) {
    query = availabilityStatuses.length === 1
      ? query.eq('availability_status', availabilityStatuses[0])
      : query.in('availability_status', availabilityStatuses)
    if (!availabilityStatuses.includes('unavailable')) query = query.eq('is_active', true)
  } else {
    // Default seguro: mantém compatibilidade com is_active e não oferece anúncios indisponíveis.
    query = query.eq('is_active', true).neq('availability_status', 'unavailable')
  }

  if (verified_within_hours !== undefined && verifiedHours !== null) {
    const cutoff = new Date(Date.now() - verifiedHours * 60 * 60 * 1000).toISOString()
    query = query.not('last_verified_at', 'is', null).gte('last_verified_at', cutoff)
  }

  if (quality_min !== undefined && qualityMinimum !== null) {
    query = query.gte('data_quality_score', qualityMinimum)
  }

  if (occupied !== undefined) {
    if (occupied !== 'true' && occupied !== 'false' && occupied !== 'unknown') {
      return res.status(400).json({ error: 'occupied deve ser true, false ou unknown' })
    }
    query = occupied === 'unknown'
      ? query.is('is_occupied', null)
      : query.eq('is_occupied', occupied === 'true')
  }

  if (state) {
    const states = String(state).split(',').map(s => s.trim()).filter(Boolean)
    query = states.length === 1 ? query.eq('state', states[0]) : query.in('state', states)
  }
  if (city) {
    const cities = String(city).split(',').map(c => c.trim()).filter(Boolean)
    query = cities.length === 1 ? query.eq('city', cities[0]) : query.in('city', cities)
  }
  if (neighborhood) {
    const neighborhoods = String(neighborhood).split(',').map(value => value.trim()).filter(Boolean)
    query = neighborhoods.length === 1
      ? query.eq('neighborhood', neighborhoods[0])
      : query.in('neighborhood', neighborhoods)
  }
  if (type) {
    const types = String(type).split(',').map(t => t.trim()).filter(Boolean)
    query = types.length === 1 ? query.eq('property_type', types[0]) : query.in('property_type', types)
  }
  if (price_min) query = query.gte('auction_price', Number(price_min))
  if (price_max) query = query.lte('auction_price', Number(price_max))
  if (discount_min) query = query.gte('discount_pct', Number(discount_min))
  if (areaMinimum !== null) query = query.gte('filter_area_m2', areaMinimum)
  if (areaMaximum !== null) query = query.lte('filter_area_m2', areaMaximum)
  if (pricePerM2Minimum !== null) query = query.gte('price_per_m2', pricePerM2Minimum)
  if (pricePerM2Maximum !== null) query = query.lte('price_per_m2', pricePerM2Maximum)
  if (opportunityMinimum !== null) query = query.gte('opportunity_score', opportunityMinimum)
  if (neighborhoodMinimum !== null) query = query.gte('neighborhood_score', neighborhoodMinimum)
  if (workDistanceMaximum !== null) query = query.lte('estimated_road_distance_km', workDistanceMaximum)
  if (source) {
    const sources = String(source).split(',').map(value => value.trim()).filter(Boolean)
    query = sources.length === 1 ? query.eq('source_id', sources[0]) : query.in('source_id', sources)
  }
  if (modality) {
    const modalities = String(modality).split(',').map(m => m.trim()).filter(Boolean)
    query = modalities.length === 1 ? query.eq('auction_modality', modalities[0]) : query.in('auction_modality', modalities)
  }

  // Busca textual no servidor (não mais client-side)
  if (search && String(search).trim().length >= 2) {
    const s = String(search).trim()
    query = query.or(`title.ilike.%${s}%,city.ilike.%${s}%,neighborhood.ilike.%${s}%,address.ilike.%${s}%`)
  }

  // Apenas imóveis com avaliação IA concluída
  if (has_evaluation === 'true') {
    query = query.not('leila_evaluations', 'is', null)
  }

  // Filtro por classificação de área
  if (area_classification) {
    const areas = String(area_classification).split(',').map(a => a.trim()).filter(Boolean)
    if (areas.some(area => !AREA_CLASSIFICATIONS.has(area))) {
      return res.status(400).json({ error: 'Classificação regional inválida' })
    }
    query = areas.length === 1 ? query.eq('area_classification', areas[0]) : query.in('area_classification', areas)
  }

  // Filtro por urgência: leilão nos próximos N dias
  if (days_until_auction_max) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + Number(days_until_auction_max))
    query = query
      .not('auction_date', 'is', null)
      .lte('auction_date', cutoff.toISOString())
      .gte('auction_date', new Date().toISOString())
  }

  const { data, error, count } = await query

  if (error) return res.status(500).json({ error: error.message })
  return res.json({
    data,
    total: count,
    page: Number(page),
    limit: Number(limit),
    trust: summarizePageTrust((data ?? []) as TrustProperty[], verifiedHours ?? 24),
  })
}

export const getPropertyCities = async (req: Request, res: Response) => {
  const search = String(req.query.search ?? '').trim().toLocaleLowerCase('pt-BR')
  const states = String(req.query.state ?? 'SP').split(',').map(value => value.trim().toUpperCase())
  if (!states.includes('SP') || (search && !'são paulo'.includes(search))) return res.json([])

  const { count, error } = await req.supabase!
    .from('leila_properties')
    .select('id', { count: 'exact', head: true })
    .eq('in_scope', true)
    .eq('is_active', true)
    .neq('availability_status', 'unavailable')

  if (error) return res.status(500).json({ error: error.message })
  return res.json([{ name: 'São Paulo', count: count ?? 0 }])
}

export const getPropertyById = async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await req.supabase!
    .from('leila_properties')
    .select('*, leila_sources:leila_sources!leila_properties_source_id_fkey(name, icon_url, url), leila_evaluations(*), leila_document_analyses(*), leila_discarded_properties(id)')
    .eq('id', id)
    .eq('in_scope', true)
    .single()

  if (error) return res.status(404).json({ error: 'Property not found' })
  return res.json(data)
}

export const getNeighborhoodProfiles = async (req: Request, res: Response) => {
  const { state, city, search, limit = 100 } = req.query
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500)

  let query = req.supabase!
    .from('leila_neighborhood_profiles')
    .select('*')
    .order('property_count', { ascending: false })
    .limit(safeLimit)

  query = query.eq('state', 'SP').eq('city', 'São Paulo')

  if (state) query = query.eq('state', String(state).trim().toUpperCase())
  if (city) query = query.eq('city', String(city).trim())
  if (search && String(search).trim()) {
    query = query.ilike('neighborhood', `%${String(search).trim()}%`)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data ?? [])
}

export const compareProperties = async (req: Request, res: Response) => {
  const propertyIds: string[] = Array.isArray(req.body?.property_ids)
    ? [...new Set<string>((req.body.property_ids as unknown[]).map(value => String(value)))]
    : []
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  if (propertyIds.length < 2 || propertyIds.length > 4 || propertyIds.some(id => !uuidPattern.test(id))) {
    return res.status(400).json({ error: 'Envie de 2 a 4 IDs de imóveis válidos' })
  }

  const { data, error } = await req.supabase!
    .from('leila_properties')
    .select('*, leila_sources:leila_sources!leila_properties_source_id_fkey(name, icon_url, url), leila_evaluations(*), leila_document_analyses(status, tags, analysis, analyzed_at), leila_discarded_properties(id)')
    .in('id', propertyIds)
    .eq('in_scope', true)

  if (error) return res.status(500).json({ error: error.message })
  const byId = new Map((data ?? []).map(property => [property.id, property]))
  return res.json(propertyIds.map(id => byId.get(id)).filter(Boolean))
}

export const getOpportunityPresets = (_req: Request, res: Response) => res.json([
  { id: 'best_opportunities', label: 'Melhores oportunidades', sort_by: 'opportunity_score', sort_order: 'desc' },
  { id: 'lowest_price_m2', label: 'Menor preço por m²', sort_by: 'price_per_m2', sort_order: 'asc' },
  { id: 'largest_area', label: 'Maior área', sort_by: 'filter_area_m2', sort_order: 'desc' },
  { id: 'largest_discount', label: 'Maior desconto', sort_by: 'discount_pct', sort_order: 'desc' },
  { id: 'best_neighborhood_signal', label: 'Melhor sinal do bairro', sort_by: 'neighborhood_score', sort_order: 'desc' },
])
