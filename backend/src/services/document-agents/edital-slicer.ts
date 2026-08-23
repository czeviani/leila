// Recorta o edital da Caixa para as cláusulas gerais + a linha do lote deste
// imóvel. Um único edital cobre centenas de lotes (ex.: 535 num caso real
// medido) — mandar o texto inteiro custa ~5x mais tokens e arrisca o extrator
// citar cláusula ou valor de OUTRO imóvel do mesmo edital.
//
// Medido em edital real (SP-10306957, 130 páginas, 299 KB): as cláusulas
// gerais terminam antes da tabela de lotes, que começa no cabeçalho "Valor de
// Venda 1º Leilão"; a partir daí os lotes são texto corrido, um atrás do
// outro, cada um contendo o número do imóvel (hdnimovel da Caixa) sem
// zeros à esquerda.
//
// Só recorta quando a âncora (external_id) é encontrada — texto inteiro é
// sempre mais seguro que um recorte errado.
const LOT_TABLE_MARKER = /Valor de Venda 1º Leil[ãa]o/i
const LOT_WINDOW_CHARS_BEFORE = 1200
const LOT_WINDOW_CHARS_AFTER_FALLBACK = 250
const LOT_WINDOW_SEARCH_AHEAD = 600
const MIN_CHARS_TO_SLICE = 40_000
const MIN_ANCHOR_LENGTH = 5

// Cada lote termina em 1-3 valores em R$ ("488.000,00 698.421,33 488.000,00")
// seguidos do número + nome em maiúsculas do PRÓXIMO lote (" 530 VIVA LIMÃO").
// Preços não batem nesse padrão (vírgula decimal logo após os dígitos), então
// é uma fronteira confiável para não vazar o lote vizinho pra dentro da janela.
const NEXT_LOT_BOUNDARY = /\s\d{1,4}\s+[A-ZÀ-ÚÇ]{3,}/

function bareCaixaId(externalId: string): string {
  const dashIndex = externalId.indexOf('-')
  return dashIndex === -1 ? externalId : externalId.slice(dashIndex + 1)
}

export function sliceEditalForProperty(text: string, externalId: string | null | undefined): string {
  if (text.length < MIN_CHARS_TO_SLICE) return text

  const marker = text.match(LOT_TABLE_MARKER)
  const tableStart = marker?.index ?? null
  const generalClauses = tableStart != null ? text.slice(0, tableStart) : text

  if (!externalId) return text

  const anchor = bareCaixaId(externalId)
  if (anchor.length < MIN_ANCHOR_LENGTH) return text

  const searchFrom = tableStart ?? 0
  const anchorIndex = text.indexOf(anchor, searchFrom)
  if (anchorIndex === -1) return text

  const windowStart = Math.max(searchFrom, anchorIndex - LOT_WINDOW_CHARS_BEFORE)
  const afterAnchor = anchorIndex + anchor.length
  const lookahead = text.slice(afterAnchor, Math.min(text.length, afterAnchor + LOT_WINDOW_SEARCH_AHEAD))
  const boundary = lookahead.match(NEXT_LOT_BOUNDARY)
  const windowEnd = boundary?.index != null
    ? afterAnchor + boundary.index
    : Math.min(text.length, afterAnchor + LOT_WINDOW_CHARS_AFTER_FALLBACK)
  const lotWindow = text.slice(windowStart, windowEnd).trim()

  return [
    generalClauses.trim(),
    `--- TRECHO DA TABELA DE LOTES REFERENTE A ESTE IMÓVEL (número ${anchor}) ---`,
    lotWindow,
  ].join('\n\n')
}
