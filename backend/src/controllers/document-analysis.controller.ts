import { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { analyzeOfficialDocumentV2, PROMPT_VERSION } from '../services/document-analysis.service'

export const getDocumentAnalysis = async (req: Request, res: Response) => {
  const { data, error } = await req.supabase!
    .from('leila_document_analyses')
    .select('*')
    .eq('property_id', req.params.id)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data ?? { property_id: req.params.id, status: 'not_started' })
}

export const requestDocumentAnalysis = async (req: Request, res: Response) => {
  const propertyId = req.params.id
  const force = req.body?.force === true
  const { data: property, error: propertyError } = await req.supabase!
    .from('leila_properties')
    .select('id, external_id, address, city, state, source_id, edital_url, availability_status, auction_modality, raw_data, leila_sources:leila_sources!leila_properties_source_id_fkey(name)')
    .eq('id', propertyId)
    .single()

  if (propertyError || !property) return res.status(404).json({ error: 'Imóvel não encontrado' })
  if (!property.edital_url) return res.status(422).json({ error: 'Este imóvel não possui uma página oficial para análise' })

  const { data: existing } = await req.supabase!
    .from('leila_document_analyses')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()

  // O pipeline v2 lê múltiplos documentos com 3 agentes em sequência — leva
  // minutos, não segundos. 5 min (limite anterior) travava rodadas legítimas
  // em "processing" e bloqueava qualquer nova tentativa.
  const processingStartedAt = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0
  const processingIsFresh = existing?.status === 'processing'
    && Number.isFinite(processingStartedAt)
    && Date.now() - processingStartedAt < 15 * 60 * 1000

  if (existing && !force && (processingIsFresh || existing.status === 'done')) {
    return res.json(existing)
  }

  const { data: started, error: startError } = await supabaseAdmin
    .from('leila_document_analyses')
    .upsert({
      property_id: propertyId,
      requested_by: req.user!.id,
      status: 'processing',
      source_url: property.edital_url,
      error_message: null,
      stage: 'discovering',
      stage_detail: 'Iniciando leitura…',
      prompt_version: PROMPT_VERSION,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'property_id' })
    .select()
    .single()

  if (startError) return res.status(500).json({ error: `Não foi possível iniciar a leitura: ${startError.message}` })

  const sourceName = (property as any).leila_sources?.name ?? property.source_id ?? 'Desconhecida'

  analyzeOfficialDocumentV2(property.edital_url, {
    propertyId,
    externalId: property.external_id,
    address: property.address,
    city: property.city,
    state: property.state,
    sourceId: property.source_id,
    sourceName,
    auctionModality: property.auction_modality ?? null,
    userId: req.user!.id,
    eventUrl: (property.raw_data as Record<string, unknown> | null)?.event_url as string | undefined ?? null,
  }, async (stage, detail) => {
    const { error } = await supabaseAdmin
      .from('leila_document_analyses')
      .update({ stage, stage_detail: detail, updated_at: new Date().toISOString() })
      .eq('property_id', propertyId)
    if (error) console.error('[document-analysis] falha ao atualizar estágio:', error.message)
  }).then(async result => {
    const { data: usageRows } = await supabaseAdmin
      .from('leila_ai_usage_events')
      .select('input_tokens, output_tokens')
      .eq('run_id', result.runId)
    const inputTokens = (usageRows ?? []).reduce((sum, r) => sum + r.input_tokens, 0)
    const outputTokens = (usageRows ?? []).reduce((sum, r) => sum + r.output_tokens, 0)

    const { error } = await supabaseAdmin
      .from('leila_document_analyses')
      .update({
        status: result.status,
        document_hash: result.documentHash,
        provider: 'anthropic',
        model: 'document-agents-v2',
        prompt_version: result.promptVersion,
        tags: result.tags,
        analysis: { summary: result.summary, risks: result.risks },
        evidence: result.evidence,
        source_snapshot: result.sourceSnapshot,
        source_kind: 'multi_document',
        identity_match: result.identityMatch,
        identity_evidence: [],
        completeness_score: result.completenessScore,
        blocking_issues: result.blockingIssues,
        decision_status: result.decisionStatus,
        liabilities: result.liabilities,
        payment_rules: result.paymentRules,
        conflicts: result.conflicts,
        documents_read: result.documentsRead,
        total_arrematante_brl: result.totalArrematanteBrl,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        stage: 'done',
        stage_detail: null,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('property_id', propertyId)
    if (error) console.error('[document-analysis] update failed:', error.message)
  }).catch(async error => {
    const message = error instanceof Error ? error.message : 'Falha desconhecida'
    console.error('[document-analysis] failed:', message)
    await supabaseAdmin
      .from('leila_document_analyses')
      .update({
        status: 'error', decision_status: 'blocked', blocking_issues: [message.slice(0, 1000)],
        error_message: message.slice(0, 1000), stage: null, stage_detail: null,
        updated_at: new Date().toISOString(),
      })
      .eq('property_id', propertyId)
  })

  return res.status(202).json(started)
}
