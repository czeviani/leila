// Agente C — Consolidador.
//
// Recebe os fatos verificados (Agente A) e o julgamento de ônus (Agente B) e
// monta o veredito final: resumo, riscos ranqueados, tags, conflitos entre
// documentos (algo impossível de detectar quando só um documento era lido) e
// o completeness_score. Substitui qualityFor() em document-analysis.service.ts,
// que pontuava sobre 5 campos fixos e penalizava todo leilão judicial por
// FGTS/financiamento "não localizados" — regras que nem se aplicam a ele.
import { getAnthropicClient, recordAgentUsage, AgentUsageContext, ExtractedFact, DocumentExtraction } from './shared'
import { Liability, PaymentRules } from './liabilities'
import { recordUsage } from '../ai-usage.service'

const MODEL = process.env.DOCUMENT_CONSOLIDATOR_MODEL || 'claude-sonnet-5'

export interface Conflict {
  topic: string
  description: string
  document_a_url: string
  document_b_url: string
}

export interface RankedRisk {
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  source_url: string | null
}

export interface ConsolidationResult {
  summary: string
  risks: RankedRisk[]
  tags: string[]
  conflicts: Conflict[]
  completeness_score: number
  blocking_issues: string[]
  decision_status: 'ready_for_final_review' | 'pending_diligence' | 'blocked'
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'risks', 'tags', 'conflicts'],
  properties: {
    summary: { type: 'string' },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'detail', 'source_url'],
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          source_url: { type: ['string', 'null'] },
        },
      },
    },
    tags: { type: 'array', items: { type: 'string' } },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'description', 'document_a_url', 'document_b_url'],
        properties: {
          topic: { type: 'string' },
          description: { type: 'string' },
          document_a_url: { type: 'string' },
          document_b_url: { type: 'string' },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `Você consolida uma diligência documental de imóvel de leilão brasileiro já feita por outros dois agentes (um extraiu fatos citados literalmente dos documentos, outro classificou os ônus e quem paga cada um).

Sua tarefa:
1. "summary": 2-4 frases, direto ao ponto, com os números e riscos mais importantes para alguém decidir se dá lance. Sempre mencione o valor total que cai para o arrematante quando houver.
2. "risks": ranqueie por severidade (high > medium > low) os riscos reais para o comprador — ocupação, ônus não resolvidos, cláusulas de "ad corpus", multas por desistência, débitos de valor alto, pagador "indefinido" em ônus caro. Não repita como risco algo que já é rotina bem resolvida (ex: comissão do leiloeiro claramente paga pelo arrematante não é risco).
3. "tags": 3-8 tags curtas para exibição em chips na tela (ex.: "FGTS aceito", "Ocupado", "Hipoteca pendente", "Ônus indefinido").
4. "conflicts": quando dois documentos diferentes (URLs diferentes) disserem coisas incompatíveis sobre o mesmo tópico (ex.: um diz desocupado, outro diz ocupado), relate o conflito. Se não houver conflito nenhum, devolva um array vazio — não invente conflito para preencher.
Nunca invente números ou fatos que não estejam nos dados fornecidos.`

function computeCompletenessAndDecision(
  liabilities: Liability[],
  paymentRules: PaymentRules,
  identityMatches: Array<'matched' | 'partial' | 'mismatch' | 'not_checked'>,
  documentsRead: DocumentExtraction[],
): { score: number; blockingIssues: string[]; decisionStatus: 'ready_for_final_review' | 'pending_diligence' | 'blocked' } {
  const blockingIssues: string[] = []

  const anyMismatch = identityMatches.includes('mismatch')
  const anyMatched = identityMatches.includes('matched')
  if (anyMismatch) blockingIssues.push('Um dos documentos lidos não corresponde a este imóvel — identidade não confere')
  else if (!anyMatched) blockingIssues.push('Identidade do imóvel não foi confirmada em nenhum documento lido')

  const failedDocs = documentsRead.filter(d => !d.readOk)
  if (failedDocs.length > 0) blockingIssues.push(`${failedDocs.length} documento(s) não puderam ser lidos`)

  const undefinedHighValueLiabilities = liabilities.filter(l => l.payer === 'indefinido' && (l.amount_brl ?? 0) > 0)
  if (undefinedHighValueLiabilities.length > 0) {
    blockingIssues.push(`${undefinedHighValueLiabilities.length} ônus com valor não têm pagador definido`)
  }

  const applicableRules = Object.values(paymentRules).filter(r => r.applicable)
  const unresolvedApplicableRules = applicableRules.filter(r => r.status === 'not_found')

  // completude: identidade (30) + nenhum documento falhou (20) + ônus com pagador definido (30) + regras aplicáveis resolvidas (20)
  const identityScore = anyMismatch ? 0 : anyMatched ? 30 : 10
  const documentsScore = documentsRead.length === 0 ? 0 : Math.round(20 * ((documentsRead.length - failedDocs.length) / documentsRead.length))
  const liabilityDefinedRatio = liabilities.length === 0 ? 1 : liabilities.filter(l => l.payer !== 'indefinido').length / liabilities.length
  const liabilityScore = Math.round(30 * liabilityDefinedRatio)
  const ruleScore = applicableRules.length === 0 ? 20 : Math.round(20 * ((applicableRules.length - unresolvedApplicableRules.length) / applicableRules.length))
  const score = Math.max(0, Math.min(100, identityScore + documentsScore + liabilityScore + ruleScore))

  const decisionStatus = anyMismatch ? 'blocked' : blockingIssues.length === 0 ? 'ready_for_final_review' : 'pending_diligence'
  return { score, blockingIssues, decisionStatus }
}

export async function consolidate(
  facts: ExtractedFact[],
  liabilitiesResult: { liabilities: Liability[]; payment_rules: PaymentRules },
  documentsRead: DocumentExtraction[],
  usageCtx: AgentUsageContext,
): Promise<ConsolidationResult> {
  const client = getAnthropicClient()

  const userPrompt = `FATOS (todos os documentos):
${JSON.stringify(facts.map(f => ({ topic: f.topic, statement: f.statement, source_url: f.sourceUrl })), null, 2)}

ÔNUS CLASSIFICADOS:
${JSON.stringify(liabilitiesResult.liabilities, null, 2)}

REGRAS DE PAGAMENTO:
${JSON.stringify(liabilitiesResult.payment_rules, null, 2)}

DOCUMENTOS LIDOS:
${JSON.stringify(documentsRead.map(d => ({ url: d.sourceUrl, type: d.documentType, ok: d.readOk, identity_match: d.identityMatch })), null, 2)}

Retorne apenas o JSON do schema.`

  const identityMatches = documentsRead.map(d => d.identityMatch)
  const { score, blockingIssues, decisionStatus } = computeCompletenessAndDecision(
    liabilitiesResult.liabilities, liabilitiesResult.payment_rules, identityMatches, documentsRead,
  )

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    await recordAgentUsage(usageCtx, MODEL, response.usage)

    const block = response.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text') throw new Error('Resposta do consolidador sem texto')
    const parsed = JSON.parse(block.text) as { summary: string; risks: RankedRisk[]; tags: string[]; conflicts: Conflict[] }

    return {
      summary: parsed.summary,
      risks: parsed.risks,
      tags: parsed.tags,
      conflicts: parsed.conflicts,
      completeness_score: score,
      blocking_issues: blockingIssues,
      decision_status: decisionStatus,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida ao consolidar'
    console.error('[document-agents:consolidator] falha:', message)
    await recordUsage({
      runId: usageCtx.runId, feature: 'document_analysis', stage: usageCtx.stage,
      propertyId: usageCtx.propertyId, userId: usageCtx.userId ?? null,
      provider: 'anthropic', model: MODEL, inputTokens: 0, outputTokens: 0,
      success: false, errorMessage: message,
    })
    // Consolidação é a etapa de exibição — mesmo que a IA falhe aqui, o usuário
    // já pagou pelos ônus classificados. Devolve um resumo mínimo em vez de derrubar tudo.
    return {
      summary: 'Não foi possível gerar o resumo consolidado. Os ônus e regras abaixo já foram extraídos e classificados normalmente.',
      risks: [],
      tags: [],
      conflicts: [],
      completeness_score: score,
      blocking_issues: [...blockingIssues, 'Falha ao consolidar o resumo final'],
      decision_status: decisionStatus === 'ready_for_final_review' ? 'pending_diligence' : decisionStatus,
    }
  }
}
