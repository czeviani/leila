import { Request, Response } from 'express'

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
  })
}

export const upsertFilters = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const body = req.body

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
