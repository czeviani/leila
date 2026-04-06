import { Request, Response } from 'express'

const VALID_PROVIDERS = ['anthropic', 'openrouter'] as const
type LlmProvider = typeof VALID_PROVIDERS[number]

const DEFAULTS = {
  llm_provider: 'anthropic' as LlmProvider,
  llm_model: 'claude-sonnet-4-6',
}

export const getSettings = async (req: Request, res: Response) => {
  const userId = req.user!.id

  const { data, error } = await req.supabase!
    .from('leila_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message })

  return res.json(data ?? { user_id: userId, ...DEFAULTS })
}

export const upsertSettings = async (req: Request, res: Response) => {
  const userId = req.user!.id
  const { llm_provider, llm_model } = req.body

  if (!VALID_PROVIDERS.includes(llm_provider)) {
    return res.status(400).json({ error: `Provider inválido. Use: ${VALID_PROVIDERS.join(' | ')}` })
  }
  if (!llm_model || typeof llm_model !== 'string') {
    return res.status(400).json({ error: 'Modelo inválido' })
  }

  const { data, error } = await req.supabase!
    .from('leila_settings')
    .upsert(
      { user_id: userId, llm_provider, llm_model, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}
