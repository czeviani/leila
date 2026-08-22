import { Request, Response } from 'express'

interface UsageEventRow {
  cost_usd: number | string
  cost_brl: number | string
  input_tokens: number
  output_tokens: number
}

interface UsageTotals {
  cost_usd: number
  cost_brl: number
  input_tokens: number
  output_tokens: number
  calls: number
}

function sumEvents(rows: UsageEventRow[]): UsageTotals {
  const totals: UsageTotals = { cost_usd: 0, cost_brl: 0, input_tokens: 0, output_tokens: 0, calls: 0 }
  for (const row of rows) {
    totals.cost_usd += Number(row.cost_usd)
    totals.cost_brl += Number(row.cost_brl)
    totals.input_tokens += row.input_tokens
    totals.output_tokens += row.output_tokens
    totals.calls += 1
  }
  return totals
}

// Custo de IA de um imóvel específico — alimenta o rodapé de custo do painel
// de análise documental. Uma rodada inteira (extrator × N documentos + jurista
// + consolidador) tem o mesmo run_id, então o front pode agrupar por rodada.
export const getPropertyAiUsage = async (req: Request, res: Response) => {
  const { data, error } = await req.supabase!
    .from('leila_ai_usage_events')
    .select('*')
    .eq('property_id', req.params.id)
    .order('occurred_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ events: data ?? [], total: sumEvents(data ?? []) })
}

// Acumulado geral, para a pergunta "quanto a Leila já gastou em IA".
export const getAiUsageSummary = async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data, error } = await req.supabase!
    .from('leila_ai_usage_events')
    .select('feature, model, cost_usd, cost_brl, input_tokens, output_tokens')
    .gte('occurred_at', since)

  if (error) return res.status(500).json({ error: error.message })

  const rows = data ?? []
  const byFeature: Record<string, UsageEventRow[]> = {}
  const byModel: Record<string, UsageEventRow[]> = {}
  for (const row of rows) {
    ;(byFeature[row.feature] ??= []).push(row)
    ;(byModel[row.model] ??= []).push(row)
  }

  return res.json({
    period_days: days,
    total: sumEvents(rows),
    by_feature: Object.fromEntries(Object.entries(byFeature).map(([k, v]) => [k, sumEvents(v)])),
    by_model: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, sumEvents(v)])),
  })
}
