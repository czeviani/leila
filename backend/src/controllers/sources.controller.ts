import { Request, Response } from 'express'

export const getSources = async (req: Request, res: Response) => {
  const [sourcesResult, coverageResult] = await Promise.all([
    req.supabase!.from('leila_sources').select('*').order('name'),
    req.supabase!.from('leila_source_coverages').select('*').eq('active', true),
  ])

  if (sourcesResult.error) return res.status(500).json({ error: sourcesResult.error.message })
  if (coverageResult.error) return res.status(500).json({ error: coverageResult.error.message })

  const sources = sourcesResult.data ?? []
  const counts = await Promise.all(sources.map(async source => {
    let query = req.supabase!
      .from('leila_properties')
      .select('id', { count: 'exact', head: true })
      .eq('in_scope', true)
      .eq('is_active', true)
      .neq('availability_status', 'unavailable')
    query = source.coverage_mode === 'indirect'
      ? query.eq('seller_id', source.id)
      : query.eq('source_id', source.id)
    const result = await query
    return [source.id, result.count ?? 0] as const
  }))
  const countsBySource = Object.fromEntries(counts)

  return res.json(sources.map(source => {
    const coverages = (coverageResult.data ?? []).filter(item => item.covered_source_id === source.id)
    const directReady = source.implementation_status === 'ready' && source.coverage_mode === 'direct'
    const indirectReady = source.implementation_status === 'ready' && source.coverage_mode === 'indirect' && coverages.length > 0
    return {
      ...source,
      implemented: directReady || indirectReady,
      can_activate: directReady,
      property_count: countsBySource[source.id] ?? 0,
      coverages,
      operational_status: directReady
        ? (source.active ? 'collecting' : 'paused')
        : indirectReady ? 'covered_indirectly' : source.implementation_status,
    }
  }))
}

export const updateSource = async (req: Request, res: Response) => {
  const { id } = req.params
  const { active } = req.body

  const { data: source, error: sourceError } = await req.supabase!
    .from('leila_sources')
    .select('id,implementation_status,coverage_mode')
    .eq('id', id)
    .single()

  if (sourceError || !source) return res.status(404).json({ error: 'Fonte não encontrada.' })
  if (active === true && (source.implementation_status !== 'ready' || source.coverage_mode !== 'direct')) {
    return res.status(409).json({ error: 'Esta fonte ainda não possui um coletor direto validado.' })
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
