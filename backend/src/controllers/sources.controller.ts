import { Request, Response } from 'express'

// Fontes aparecem no catálogo para deixar o roadmap transparente, mas só
// podem ser ativadas quando existe um adapter executável no scraper.
const IMPLEMENTED_SOURCES = new Set(['caixa'])

export const getSources = async (req: Request, res: Response) => {
  const { data, error } = await req.supabase!
    .from('leila_sources')
    .select('*')
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  return res.json((data ?? []).map(source => ({
    ...source,
    implemented: IMPLEMENTED_SOURCES.has(source.id),
  })))
}

export const updateSource = async (req: Request, res: Response) => {
  const { id } = req.params
  const { active } = req.body

  if (active === true && !IMPLEMENTED_SOURCES.has(id)) {
    return res.status(409).json({ error: 'Esta fonte ainda não possui um coletor validado.' })
  }

  const { data, error } = await req.supabase!
    .from('leila_sources')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}
