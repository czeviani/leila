// Registro de custo de IA. Existe porque, antes disto, input_tokens/output_tokens
// eram gravados em leila_document_analyses mas nunca chegavam à tela — e a
// avaliação de investimento (o fluxo mais caro do projeto) nem gravava tokens,
// porque callLlm() devolvia só a string de texto e descartava `usage`.
//
// leila_document_analyses e leila_evaluations são UNIQUE(property_id): toda
// re-análise sobrescreve os tokens da rodada anterior. leila_ai_usage_events é
// append-only — cada chamada de IA vira uma linha permanente, agrupável por
// run_id (uma rodada = várias chamadas, uma por agente/estágio).
import { supabaseAdmin } from '../config/supabase'

export type AiFeature = 'document_analysis' | 'evaluation' | 'scraper_enrichment'

interface ModelPrice {
  inputPerM: number
  outputPerM: number
  /** Preço promocional vigente até promoUntil (inclusive), formato YYYY-MM-DD. */
  promoInputPerM?: number
  promoOutputPerM?: number
  promoUntil?: string
}

// USD por milhão de tokens. Atualizar quando a Anthropic mudar a tabela —
// ver skill claude-api para os valores correntes.
const PRICES: Record<string, ModelPrice> = {
  'claude-opus-5': { inputPerM: 5, outputPerM: 25 },
  'claude-sonnet-5': { inputPerM: 3, outputPerM: 15, promoInputPerM: 2, promoOutputPerM: 10, promoUntil: '2026-08-31' },
  'claude-sonnet-4-6': { inputPerM: 3, outputPerM: 15 },
  'claude-opus-4-6': { inputPerM: 5, outputPerM: 25 },
  'claude-haiku-4-5': { inputPerM: 1, outputPerM: 5 },
  'claude-haiku-4-5-20251001': { inputPerM: 1, outputPerM: 5 },
}

const USD_BRL_RATE = Number(process.env.USD_BRL_RATE) || 5.40

function priceFor(model: string): { inputPerM: number; outputPerM: number } | null {
  const price = PRICES[model]
  if (!price) return null
  const promoActive = Boolean(
    price.promoUntil && price.promoInputPerM != null && price.promoOutputPerM != null &&
    new Date() <= new Date(`${price.promoUntil}T23:59:59-03:00`),
  )
  return promoActive
    ? { inputPerM: price.promoInputPerM!, outputPerM: price.promoOutputPerM! }
    : { inputPerM: price.inputPerM, outputPerM: price.outputPerM }
}

/** Custo determinístico a partir de tokens brutos. Modelo desconhecido → 0 (nunca lança). */
export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model)
  if (!price) {
    console.warn(`[ai-usage] modelo sem preço cadastrado: ${model} — custo registrado como 0`)
    return 0
  }
  return (inputTokens / 1_000_000) * price.inputPerM + (outputTokens / 1_000_000) * price.outputPerM
}

export interface UsageInput {
  runId: string
  feature: AiFeature
  stage?: string | null
  propertyId?: string | null
  userId?: string | null
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** Quando o provider já devolve custo pronto (ex.: OpenRouter usage.cost em USD), use em vez de computeCostUsd. */
  costUsdOverride?: number
  success?: boolean
  errorMessage?: string
}

/**
 * Grava uma chamada de IA já ocorrida. Nunca lança — uma falha em registrar
 * custo não pode derrubar o pipeline que já gastou o dinheiro.
 */
export async function recordUsage(input: UsageInput): Promise<{ costUsd: number; costBrl: number }> {
  const costUsd = input.costUsdOverride ?? computeCostUsd(input.model, input.inputTokens, input.outputTokens)
  const costBrl = costUsd * USD_BRL_RATE

  const { error } = await supabaseAdmin.from('leila_ai_usage_events').insert({
    run_id: input.runId,
    feature: input.feature,
    stage: input.stage ?? null,
    property_id: input.propertyId ?? null,
    user_id: input.userId ?? null,
    provider: input.provider,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cache_read_tokens: input.cacheReadTokens ?? 0,
    cache_write_tokens: input.cacheWriteTokens ?? 0,
    cost_usd: costUsd,
    cost_brl: costBrl,
    success: input.success ?? true,
    error_message: input.errorMessage?.slice(0, 1000) ?? null,
  })

  if (error) console.error('[ai-usage] falha ao gravar evento de custo:', error.message)
  return { costUsd, costBrl }
}
