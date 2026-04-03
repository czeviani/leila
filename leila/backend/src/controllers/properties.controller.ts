import { Request, Response } from 'express'

export const getProperties = async (req: Request, res: Response) => {
  const { state, city, type, price_min, price_max, discount_min, page = 1, limit = 50 } = req.query
  const offset = (Number(page) - 1) * Number(limit)

  let query = req.supabase!
    .from('leila_properties')
    .select('*, leila_sources(name, icon_url)', { count: 'exact' })
    .order('scraped_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1)

  if (state) query = query.eq('state', state)
  if (city) query = query.ilike('city', `%${city}%`)
  if (type) query = query.eq('property_type', type)
  if (price_min) query = query.gte('auction_price', Number(price_min))
  if (price_max) query = query.lte('auction_price', Number(price_max))
  if (discount_min) query = query.gte('discount_pct', Number(discount_min))

  const { data, error, count } = await query

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ data, total: count, page: Number(page), limit: Number(limit) })
}

export const getPropertyById = async (req: Request, res: Response) => {
  const { id } = req.params

  const { data, error } = await req.supabase!
    .from('leila_properties')
    .select('*, leila_sources(name, icon_url), leila_evaluations(*)')
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: 'Property not found' })
  return res.json(data)
}
