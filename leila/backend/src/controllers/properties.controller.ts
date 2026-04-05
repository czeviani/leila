import { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'

const SORT_FIELDS: Record<string, string> = {
  discount_pct: 'discount_pct',
  auction_price: 'auction_price',
  area_m2: 'area_m2',
  scraped_at: 'scraped_at',
}

export const getProperties = async (req: Request, res: Response) => {
  const {
    state, city, type, price_min, price_max, discount_min,
    page = 1, limit = 50,
    sort_by = 'discount_pct', sort_order = 'desc',
  } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  const sortField = SORT_FIELDS[String(sort_by)] ?? 'discount_pct'
  const ascending = String(sort_order) === 'asc'

  let query = req.supabase!
    .from('leila_properties')
    .select('*, leila_sources(name, icon_url)', { count: 'exact' })
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
