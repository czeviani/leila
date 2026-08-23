// Agente B — Jurista de ônus e responsabilidades.
//
// É a resposta direta ao pedido do usuário: "dívida e quem é que tem que
// pagar tem que ficar claro". Recebe os fatos já verificados (com citação
// real) do Agente A e julga, para cada ônus encontrado, quem paga —
// arrematante, vendedor, sub-rogado no preço, ou indefinido quando o
// documento não deixa claro. "Indefinido" é um veredicto tão válido quanto
// os outros — o sistema anterior tratava ausência de informação como
// ausência de dívida, o que é o oposto do que protege o usuário.
import { callJsonAgent, recordAgentUsage, recordAgentUsageFailure, AgentUsageContext, ExtractedFact, LlmConfig } from './shared'

const ANTHROPIC_MODEL = process.env.DOCUMENT_LIABILITIES_MODEL || 'claude-opus-5'

export type LiabilityKind =
  | 'condominio' | 'iptu' | 'tributos_municipais' | 'hipoteca' | 'penhora'
  | 'alienacao_fiduciaria' | 'usufruto' | 'acao_judicial' | 'comissao_leiloeiro'
  | 'itbi' | 'registro' | 'desocupacao' | 'outros'

export type Payer = 'arrematante' | 'vendedor' | 'sub_rogado_no_preco' | 'indefinido'

export interface Liability {
  kind: LiabilityKind
  label: string
  amount_brl: number | null
  amount_note: string
  payer: Payer
  payer_confidence: 'high' | 'medium' | 'low'
  basis_quote: string
  source_document_type: string
  source_url: string
}

export type RuleStatus = 'allowed' | 'not_allowed' | 'conditional' | 'not_found'

export interface PaymentRule {
  applicable: boolean
  status: RuleStatus
  note: string
  basis_quote: string | null
}

export interface PaymentRules {
  fgts: PaymentRule
  financiamento: PaymentRule
  consorcio: PaymentRule
}

export interface LiabilitiesResult {
  liabilities: Liability[]
  payment_rules: PaymentRules
  totalArrematanteBrl: number
}

const LIABILITY_KINDS: LiabilityKind[] = [
  'condominio', 'iptu', 'tributos_municipais', 'hipoteca', 'penhora',
  'alienacao_fiduciaria', 'usufruto', 'acao_judicial', 'comissao_leiloeiro',
  'itbi', 'registro', 'desocupacao', 'outros',
]

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['liabilities', 'payment_rules'],
  properties: {
    liabilities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'label', 'amount_brl', 'amount_note', 'payer', 'payer_confidence', 'basis_quote', 'source_document_type', 'source_url'],
        properties: {
          kind: { type: 'string', enum: LIABILITY_KINDS },
          label: { type: 'string' },
          amount_brl: { type: ['number', 'null'] },
          amount_note: { type: 'string' },
          payer: { type: 'string', enum: ['arrematante', 'vendedor', 'sub_rogado_no_preco', 'indefinido'] },
          payer_confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          basis_quote: { type: 'string' },
          source_document_type: { type: 'string' },
          source_url: { type: 'string' },
        },
      },
    },
    payment_rules: {
      type: 'object',
      additionalProperties: false,
      required: ['fgts', 'financiamento', 'consorcio'],
      properties: {
        fgts: paymentRuleSchema(),
        financiamento: paymentRuleSchema(),
        consorcio: paymentRuleSchema(),
      },
    },
  },
} as const

function paymentRuleSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['applicable', 'status', 'note', 'basis_quote'],
    properties: {
      applicable: { type: 'boolean' },
      status: { type: 'string', enum: ['allowed', 'not_allowed', 'conditional', 'not_found'] },
      note: { type: 'string' },
      basis_quote: { type: ['string', 'null'] },
    },
  }
}

const SYSTEM_PROMPT = `Você é um jurista especializado em leilões imobiliários no Brasil. Sua única função é olhar os fatos já extraídos dos documentos oficiais de um imóvel e decidir, para cada ônus (dívida, gravame, custo) encontrado, QUEM PAGA.

Categorias de ônus válidas: condominio, iptu, tributos_municipais, hipoteca, penhora, alienacao_fiduciaria, usufruto, acao_judicial, comissao_leiloeiro, itbi, registro, desocupacao, outros.

Para cada ônus que os fatos mencionarem, decida o pagador:
- "arrematante": o documento diz explicitamente que quem arremata (compra no leilão) paga.
- "vendedor": o documento diz explicitamente que o vendedor/banco/exequente paga ou já quitou.
- "sub_rogado_no_preco": o documento diz que a dívida se sub-roga no valor do lance (comum em leilão judicial por penhora/hipoteca — a dívida "morre" com a venda e não é cobrada à parte de quem arremata).
- "indefinido": os fatos não deixam claro quem paga. Use isto sempre que houver a menor dúvida — NUNCA adivinhe usando praxe de mercado. É preferível marcar "indefinido" com payer_confidence "low" do que arriscar dizer "arrematante" ou "vendedor" sem base explícita no texto.

Regras:
1. "basis_quote" deve ser um trecho literal de um dos fatos fornecidos (verbatimQuote ou statement) — nunca invente uma citação.
2. Regra geral do mercado de leilões brasileiro (você pode aplicar quando os fatos não contradisserem): comissão do leiloeiro, ITBI e registro em cartório são tradicionalmente pagos pelo arrematante — mas SÓ classifique como "arrematante" com payer_confidence "high" se os fatos confirmarem isso explicitamente; se os fatos forem omissos sobre esses três itens específicos, ainda assim classifique como "arrematante"/"medium" citando a prática de mercado na amount_note, e NUNCA como "indefinido" só por omissão nesses três — para os demais ônus (condomínio, IPTU, hipoteca, penhora, ação judicial, etc.) omissão SEMPRE vira "indefinido".
3. "amount_brl" só é preenchido quando um valor em reais aparece explicitamente nos fatos para aquele ônus específico. Nunca estime.
4. Em leilão judicial, hipoteca e penhora anteriores costumam se extinguir com a arrematação (sub-rogação no preço) SE os fatos confirmarem isso — senão marque "indefinido".
5. Para payment_rules (fgts, financiamento, consorcio): "applicable" é false quando o tipo de leilão/venda torna a regra irrelevante (ex.: venda direta ou leilão judicial sem menção a nenhuma forma de pagamento facilitada) — neste caso "status" é "not_found" mas o campo não deve ser exibido como pendência. "applicable" é true sempre que os fatos mencionam o tema, mesmo para dizer que não é aceito.
6. Nunca insira ônus que os fatos não mencionam. Se não há fatos sobre hipoteca, não invente uma entrada de hipoteca.`

export async function judgeLiabilities(
  facts: ExtractedFact[],
  auctionContext: { modality: string | null; sourceName: string },
  config: LlmConfig,
  usageCtx: AgentUsageContext,
): Promise<LiabilitiesResult> {
  const factsForPrompt = facts.map(f => ({
    topic: f.topic,
    statement: f.statement,
    verbatim_quote: f.verbatimQuote,
    document_type: f.sourceDocumentType,
    source_url: f.sourceUrl,
  }))

  const userPrompt = `Modalidade do leilão: ${auctionContext.modality ?? 'não informada'}
Fonte: ${auctionContext.sourceName}

FATOS EXTRAÍDOS DOS DOCUMENTOS (já verificados por citação — confie neles, não questione se são reais):
${JSON.stringify(factsForPrompt, null, 2)}

Classifique cada ônus mencionado nos fatos acima e preencha payment_rules. Retorne apenas o JSON do schema.`

  try {
    const { data, usage } = await callJsonAgent<{ liabilities: Liability[]; payment_rules: PaymentRules }>(config, {
      system: SYSTEM_PROMPT, user: userPrompt, schema: SCHEMA, maxTokens: 6000, anthropicModel: ANTHROPIC_MODEL,
    })

    await recordAgentUsage(usageCtx, usage)

    const totalArrematanteBrl = data.liabilities
      .filter(l => l.payer === 'arrematante' && typeof l.amount_brl === 'number')
      .reduce((sum, l) => sum + (l.amount_brl as number), 0)

    return { liabilities: data.liabilities, payment_rules: data.payment_rules, totalArrematanteBrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida ao classificar ônus'
    console.error('[document-agents:liabilities] falha:', message)
    await recordAgentUsageFailure(usageCtx, config, message)
    throw error
  }
}
