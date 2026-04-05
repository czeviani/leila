import { Request, Response } from 'express'
import { evaluateProperty } from '../services/evaluator.service'
import { supabaseAdmin } from '../config/supabase'

export const getEvaluation = async (req: Request, res: Response) => {
  const { property_id } = req.params

  const { data, error } = await req.supabase!
    .from('leila_evaluations')
    .select('*')
    .eq('property_id', property_id)
    .single()

  if (error) return res.status(404).json({ error: 'Evaluation not found' })
  return res.json(data)
}

export const requestEvaluation = async (req: Request, res: Response) => {
  const { property_id } = req.body

  // Check if already evaluated (skip only if pending/processing/done — re-run if error)
  const { data: existing } = await req.supabase!
    .from('leila_evaluations')
    .select('id, status')
    .eq('property_id', property_id)
    .single()

  if (existing && existing.status !== 'error') {
    return res.json({ message: 'Already evaluated', id: existing.id })
  }

  // If previous attempt errored, delete it before re-running
  if (existing?.status === 'error') {
    await supabaseAdmin
      .from('leila_evaluations')
      .delete()
      .eq('property_id', property_id)
  }

  // Get property details
  const { data: property, error: propError } = await req.supabase!
    .from('leila_properties')
    .select('*, leila_sources(name)')
    .eq('id', property_id)
    .single()

  if (propError || !property) return res.status(404).json({ error: 'Property not found' })

  // Mark as processing
  const { error: insertError } = await supabaseAdmin
    .from('leila_evaluations')
    .insert({ property_id, status: 'processing' })

  if (insertError) {
    console.error('[evaluation] insert failed:', insertError.message, 'property_id:', property_id)
    return res.status(500).json({ error: 'Failed to start evaluation: ' + insertError.message })
  }

  console.log('[evaluation] started for property', property_id)

  // Run evaluation async (don't await in response)
  evaluateProperty({
    id: property.id,
    title: property.title,
    address: property.address,
    city: property.city,
    state: property.state,
    property_type: property.property_type,
    auction_price: property.auction_price,
    appraised_value: property.appraised_value,
    discount_pct: property.discount_pct,
    area_m2: property.area_m2,
    description: property.description,
    edital_url: property.edital_url,
    source_name: property.leila_sources?.name ?? 'Desconhecida',
  }).then(async (evaluation) => {
    const { error: updateError } = await supabaseAdmin
      .from('leila_evaluations')
      .update({
        status: 'done',
        score: evaluation.score,
        summary: evaluation.summary,
        area_classification: evaluation.area_classification,
        location_notes: evaluation.location_notes,
        condition_notes: evaluation.condition_notes,
        documents_notes: evaluation.documents_notes,
        risks: evaluation.risks,
        highlights: evaluation.highlights,
        recommendation: evaluation.recommendation,
        price_per_m2: evaluation.price_per_m2,
        financial_data: evaluation.financial_data,
        evaluated_at: new Date().toISOString(),
      })
      .eq('property_id', property_id)
    if (updateError) {
      console.error('[evaluation] DB update failed for property', property_id, updateError.message)
    } else {
      console.log('[evaluation] done for property', property_id, '| score:', evaluation.score)
    }
  }).catch(async (err) => {
    console.error('[evaluation] FAILED for property', property_id, err.message)
    const { error: updateError } = await supabaseAdmin
      .from('leila_evaluations')
      .update({ status: 'error', summary: err.message })
      .eq('property_id', property_id)
    if (updateError) {
      console.error('[evaluation] could not set error status for property', property_id, updateError.message)
    }
  })

  return res.status(202).json({ message: 'Evaluation started', property_id })
}
