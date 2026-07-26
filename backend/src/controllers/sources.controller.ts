import { Request, Response } from 'express'

export const getSources = async (req: Request, res: Response) => {
  const { data, error } = await req.supabase!
    .from('leila_sources')
    .select('*')
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}

export const updateSource = async (req: Request, res: Response) => {
  const { id } = req.params
  const { active } = req.body

  const { data, error } = await req.supabase!
    .from('leila_sources')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}
