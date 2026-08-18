import { Request, Response } from 'express'

export const getDiscardedProperties = async (req: Request, res: Response) => {
  const { data, error } = await req.supabase!
    .from('leila_discarded_properties')
    .select('*, leila_properties(*, leila_sources:leila_sources!leila_properties_source_id_fkey(name, icon_url))')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data ?? [])
}

export const discardProperty = async (req: Request, res: Response) => {
  const { id: propertyId } = req.params
  const { data, error } = await req.supabase!
    .from('leila_discarded_properties')
    .upsert({
      user_id: req.user!.id,
      property_id: propertyId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) || null : null,
    }, { onConflict: 'user_id,property_id' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json(data)
}

export const restoreDiscardedProperty = async (req: Request, res: Response) => {
  const { error } = await req.supabase!
    .from('leila_discarded_properties')
    .delete()
    .eq('user_id', req.user!.id)
    .eq('property_id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  return res.status(204).send()
}
