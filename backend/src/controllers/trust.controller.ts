import { Request, Response } from 'express'

const RUN_STATUSES = new Set(['running', 'success', 'partial', 'failed', 'stale', 'cancelled', 'skipped'])

const countProperties = async (req: Request, configure: (query: any) => any) => {
  const base = req.supabase!.from('leila_properties').select('id', { count: 'exact', head: true }).eq('in_scope', true)
  const { count, error } = await configure(base)
  if (error) throw error
  return count ?? 0
}

export const getIngestionRuns = async (req: Request, res: Response) => {
  const sourceId = req.query.source_id ? String(req.query.source_id).trim() : null
  const status = req.query.status ? String(req.query.status).trim() : null
  const requestedLimit = Number(req.query.limit ?? 20)

  if (status && !RUN_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status inválido' })
  }
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return res.status(400).json({ error: 'limit deve ser um inteiro entre 1 e 100' })
  }

  let query = req.supabase!
    .from('leila_ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(requestedLimit)

  if (sourceId) query = query.eq('source_id', sourceId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ data: data ?? [], limit: requestedLimit })
}

export const getDataHealth = async (req: Request, res: Response) => {
  try {
    const freshCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [live, available, suspect, fresh, qualityGood, recentRunsResult] = await Promise.all([
      countProperties(req, query => query.eq('is_active', true).neq('availability_status', 'unavailable')),
      countProperties(req, query => query.eq('is_active', true).eq('availability_status', 'available')),
      countProperties(req, query => query.eq('is_active', true).eq('availability_status', 'suspect')),
      countProperties(req, query => query.eq('is_active', true).neq('availability_status', 'unavailable').gte('last_verified_at', freshCutoff)),
      countProperties(req, query => query.eq('is_active', true).neq('availability_status', 'unavailable').gte('data_quality_score', 70)),
      req.supabase!
        .from('leila_ingestion_runs')
        .select('id,source_id,status,trigger_type,collector_version,started_at,finished_at,heartbeat_at,found_count,written_count,unchanged_count,rejected_count,error_count,duration_ms,verified_regions,failed_regions')
        .order('started_at', { ascending: false })
        .limit(25),
    ])

    if (recentRunsResult.error) throw recentRunsResult.error

    const recentRuns = recentRunsResult.data ?? []
    const latestBySource = Object.values(recentRuns.reduce<Record<string, (typeof recentRuns)[number]>>((latest, run) => {
      if (!latest[run.source_id]) latest[run.source_id] = run
      return latest
    }, {}))

    const ratio = (value: number) => live > 0 ? Math.round((value / live) * 1000) / 10 : 0
    const freshnessPct = ratio(fresh)
    const availabilityPct = ratio(available)
    const qualityPct = ratio(qualityGood)
    const now = Date.now()
    const latestRunUnhealthy = latestBySource.some(run =>
      run.status === 'failed'
      || run.status === 'partial'
      || run.status === 'stale'
      || (run.status === 'running' && now - new Date(run.heartbeat_at ?? run.started_at).getTime() > 60 * 60 * 1000)
      || now - new Date(run.started_at).getTime() > 30 * 60 * 60 * 1000
    )
    const healthStatus = live === 0 || freshnessPct < 50 || latestBySource.length === 0 || latestRunUnhealthy
      ? 'degraded'
      : 'healthy'

    return res.json({
      status: healthStatus,
      generated_at: new Date().toISOString(),
      thresholds: { freshness_hours: 24, quality_good_min: 70 },
      listings: {
        live,
        available,
        suspect,
        verified_within_24h: fresh,
        quality_at_least_70: qualityGood,
        availability_pct: availabilityPct,
        freshness_pct: freshnessPct,
        quality_pct: qualityPct,
        confidence_score: Math.round((availabilityPct * 0.4 + freshnessPct * 0.4 + qualityPct * 0.2) * 10) / 10,
      },
      latest_runs_by_source: latestBySource,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return res.status(500).json({ status: 'error', error: message })
  }
}
