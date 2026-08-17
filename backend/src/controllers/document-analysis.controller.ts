import { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { analyzeOfficialDocument } from '../services/document-analysis.service'

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
    .select('id, edital_url, availability_status')
    .eq('id', propertyId)
    .single()

  if (propertyError || !property) return res.status(404).json({ error: 'Imóvel não encontrado' })
  if (!property.edital_url) return res.status(422).json({ error: 'Este imóvel não possui uma página oficial para análise' })

  const { data: existing } = await req.supabase!
    .from('leila_document_analyses')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()

  const processingStartedAt = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0
  const processingIsFresh = existing?.status === 'processing'
    && Number.isFinite(processingStartedAt)
    && Date.now() - processingStartedAt < 5 * 60 * 1000

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
      updated_at: new Date().toISOString(),
    }, { onConflict: 'property_id' })
    .select()
    .single()

  if (startError) return res.status(500).json({ error: `Não foi possível iniciar a leitura: ${startError.message}` })

  analyzeOfficialDocument(property.edital_url).then(async result => {
    const { error } = await supabaseAdmin
      .from('leila_document_analyses')
      .update({
        status: result.status,
        document_hash: result.documentHash,
        provider: result.provider,
        model: result.model,
        tags: result.tags,
        analysis: result.analysis,
        evidence: result.evidence,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
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
      .update({ status: 'error', error_message: message.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq('property_id', propertyId)
  })

  return res.status(202).json(started)
}
