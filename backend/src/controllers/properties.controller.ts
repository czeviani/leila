import { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'

const SORT_FIELDS: Record<string, string> = {
  heat_score:   'heat_score',
  discount_pct: 'discount_pct',
  auction_price: 'auction_price',
  area_m2: 'area_m2',
  scraped_at: 'scraped_at',
  auction_date: 'auction_date',
}

export const getProperties = async (req: Request, res: Response) => {
  const {
    state, city, type, price_min, price_max, discount_min, modality,
    search, has_evaluation, area_classification, days_until_auction_max,
    page = 1, limit = 50,
    sort_by = 'heat_score', sort_order = 'desc',
  } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  const sortField = SORT_FIELDS[String(sort_by)] ?? 'heat_score'
  const ascending = String(sort_order) === 'asc'

  let query = req.supabase!
    .from('leila_properties')
    .select('*, leila_sources(name, icon_url), leila_evaluations(*)', { count: 'exact' })
    .eq('is_active', true)
    .order(sortField, { ascending, nullsFirst: false })
    .range(offset, offset + Number(limit) - 1)

  if (state) {
    const states = String(state).split(',').map(s => s.trim()).filter(Boolean)
    query = states.length === 1 ? query.eq('state', states[0]) : query.in('state', states)
  }
  if (city) {
    const cities = String(city).split(',').map(c => c.trim()).filter(Boolean)
    if (cities.length === 1) {
      query = query.ilike('city', `%${cities[0]}%`)
    } else {
      query = query.or(cities.map(c => `city.ilike.%${c}%`).join(','))
    }
  }
  if (type) {
    const types = String(type).split(',').map(t => t.trim()).filter(Boolean)
    query = types.length === 1 ? query.eq('property_type', types[0]) : query.in('property_type', types)
  }
  if (price_min) query = query.gte('auction_price', Number(price_min))
  if (price_max) query = query.lte('auction_price', Number(price_max))
  if (discount_min) query = query.gte('discount_pct', Number(discount_min))
  if (modality) {
    const modalities = String(modality).split(',').map(m => m.trim()).filter(Boolean)
    query = modalities.length === 1 ? query.eq('auction_modality', modalities[0]) : query.in('auction_modality', modalities)
  }

  // Busca textual no servidor (não mais client-side)
  if (search && String(search).trim().length >= 2) {
    const s = String(search).trim()
    query = query.or(`title.ilike.%${s}%,city.ilike.%${s}%,address.ilike.%${s}%`)
  }

  // Apenas imóveis com avaliação IA concluída
  if (has_evaluation === 'true') {
    query = query.not('leila_evaluations', 'is', null)
  }

  // Filtro por classificação de área
  if (area_classification) {
    const areas = String(area_classification).split(',').map(a => a.trim()).filter(Boolean)
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
  return res.json({ data, total: count, page: Number(page), limit: Number(limit) })
}

export const getPropertyCities = async (req: Request, res: Response) => {
  const { search } = req.query
  if (!search || String(search).trim().length < 2) return res.json([])

  const { data, error } = await req.supabase!
    .from('leila_properties')
    .select('city')
    .eq('is_active', true)
    .ilike('city', `%${String(search).trim()}%`)
    .not('city', 'is', null)
    .limit(300)

  if (error) return res.status(500).json({ error: error.message })

  const cities = [...new Set((data ?? []).map((r: { city: string }) => r.city).filter(Boolean))].sort().slice(0, 30)
  return res.json(cities)
}

export const getPropertyById = async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await supabaseAdmin
    .from('leila_properties')
    .select('*, leila_sources(name, icon_url), leila_evaluations(*)')
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: 'Property not found' })
  return res.json(data)
}
