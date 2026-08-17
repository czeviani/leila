import { Request, Response } from 'express'

const FILTER_FIELDS = [
  'price_min', 'price_max', 'states', 'cities', 'property_types', 'discount_min',
  'modality_categories', 'area_classifications', 'days_until_auction_max',
  'has_evaluation', 'area_min', 'area_max', 'source_ids',
  'neighborhoods', 'price_per_m2_min', 'price_per_m2_max',
  'opportunity_score_min', 'neighborhood_score_min',
] as const

export const getFilters = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const { data, error } = await req.supabase!
    .from('leila_filters')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message })

  // Return defaults if no filter configured yet
  return res.json(data ?? {
    user_id: userId,
    price_min: null,
    price_max: null,
    states: [],
    cities: [],
    property_types: [],
    discount_min: null,
    modality_categories: [],
    area_classifications: [],
    days_until_auction_max: null,
    has_evaluation: false,
    area_min: null,
    area_max: null,
    source_ids: [],
    neighborhoods: [],
    price_per_m2_min: null,
    price_per_m2_max: null,
    opportunity_score_min: null,
    neighborhood_score_min: null,
  })
}

export const upsertFilters = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const body = Object.fromEntries(
    FILTER_FIELDS
      .filter(field => Object.prototype.hasOwnProperty.call(req.body ?? {}, field))
      .map(field => [field, req.body[field]])
  )

  const { data, error } = await req.supabase!
    .from('leila_filters')
    .upsert({ ...body, user_id: userId, updated_at: new Date().toISOString() }, {
      onConflict: 'user_id',
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}
