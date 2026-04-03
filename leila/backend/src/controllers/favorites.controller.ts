import { Request, Response } from 'express'

export const getFavorites = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const { data, error } = await req.supabase!
    .from('leila_favorites')
    .select('*, leila_properties(*, leila_sources(name, icon_url), leila_evaluations(*))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}

export const addFavorite = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { property_id } = req.body

  const { data, error } = await req.supabase!
    .from('leila_favorites')
    .insert({ user_id: userId, property_id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export const removeFavorite = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { property_id } = req.params

  const { error } = await req.supabase!
    .from('leila_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('property_id', property_id)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
}
