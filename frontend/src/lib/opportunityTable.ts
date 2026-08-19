import { Property } from './api'

export type OpportunityColumn =
  | 'opportunity'
  | 'location'
  | 'property'
  | 'area'
  | 'price'
  | 'pricePerM2'
  | 'discount'
  | 'neighborhood'
  | 'status'
  | 'deadline'

export type TableDensity = 'compact' | 'comfortable'

export interface OpportunityTablePreferences {
  version: 3
  columns: OpportunityColumn[]
  density: TableDensity
}

export const COLUMN_LABELS: Record<OpportunityColumn, string> = {
  opportunity: 'Oportunidade',
  location: 'Localização',
  property: 'Imóvel',
  area: 'Área',
  price: 'Lance',
  pricePerM2: 'R$/m²',
  discount: 'Desconto',
  neighborhood: 'Sinal do bairro',
  status: 'Situação',
  deadline: 'Prazo',
}

export const DEFAULT_COLUMNS: OpportunityColumn[] = [
  'opportunity', 'location', 'property', 'area', 'price', 'pricePerM2',
  'discount', 'neighborhood',
]

export const TABLE_PREFERENCES_KEY = 'leila_opportunity_table_v3'

export function readTablePreferences(): OpportunityTablePreferences {
  const fallback: OpportunityTablePreferences = { version: 3, columns: DEFAULT_COLUMNS, density: 'compact' }
  try {
    const parsed = JSON.parse(localStorage.getItem(TABLE_PREFERENCES_KEY) || 'null') as Partial<OpportunityTablePreferences> | null
    if (!parsed || parsed.version !== 3 || !Array.isArray(parsed.columns)) return fallback
    const validColumns = parsed.columns.filter((column): column is OpportunityColumn => column in COLUMN_LABELS)
    return {
      version: 3,
      columns: validColumns.length ? validColumns : DEFAULT_COLUMNS,
      density: parsed.density === 'comfortable' ? 'comfortable' : 'compact',
    }
  } catch {
    return fallback
  }
}

export function writeTablePreferences(preferences: OpportunityTablePreferences) {
  try { localStorage.setItem(TABLE_PREFERENCES_KEY, JSON.stringify(preferences)) } catch {}
}

export function effectiveArea(property: Property) {
  const candidates = [property.filter_area_m2, property.useful_area_m2, property.area_m2]
  return candidates.find(area => area != null && area >= 5) ?? null
}

export function effectivePricePerM2(property: Property) {
  const informed = property.price_per_m2 ?? property.effective_price_per_m2
  if (informed != null) return informed >= 100 && informed <= 100_000 ? informed : null
  const area = effectiveArea(property)
  const calculated = area ? property.auction_price / area : null
  return calculated != null && calculated >= 100 && calculated <= 100_000 ? calculated : null
}

export function opportunityScore(property: Property) {
  if (property.opportunity_score != null) return Math.round(property.opportunity_score)

  // Fallback transitório sem bônus geográfico ou de urgência: ambos eram
  // atalhos enganosos para qualidade do negócio no score legado.
  const discount = Math.min(Math.max(property.discount_pct ?? 0, 0) / 50, 1) * 50
  const quality = Math.min(Math.max(property.data_quality_score ?? 0, 0), 100) * 0.25
  const availability = property.availability_status === 'available' ? 25 : property.availability_status === 'suspect' ? 8 : 0
  return Math.round(discount + quality + availability)
}

export function opportunityFactors(property: Property): string[] {
  if (property.opportunity_factors?.length) {
    return property.opportunity_factors.map(factor => typeof factor === 'string'
      ? factor
      : factor.label ?? factor.name ?? String(factor.value ?? '')
    ).filter(Boolean).slice(0, 3)
  }

  if (property.opportunity_components) {
    const componentLabels: Record<string, string> = {
      discount: 'desconto', price_per_m2: 'preço por m²', data_quality: 'qualidade dos dados',
      relative_value: 'valor relativo', availability_trust: 'fonte verificada',
      availability: 'disponibilidade', occupancy: 'ocupação', deadline: 'prazo', neighborhood: 'bairro',
    }
    const components = Object.entries(property.opportunity_components)
      .filter(([, value]) => typeof value === 'object' && value != null && !Array.isArray(value) && Number((value as { points?: number }).points) > 0)
      .sort(([, a], [, b]) => Number((b as { points?: number }).points) - Number((a as { points?: number }).points))
      .slice(0, 3)
      .map(([key]) => componentLabels[key] ?? key.replace(/_/g, ' '))
    if (components.length) return components
  }

  const factors: string[] = []
  if ((property.discount_pct ?? 0) >= 30) factors.push('desconto relevante')
  if ((property.data_quality_score ?? 0) >= 75) factors.push('dados completos')
  if (property.is_occupied === false) factors.push('desocupado')
  if (!factors.length) factors.push('evidência parcial')
  return factors
}

export function neighborhoodName(property: Property) {
  if (property.neighborhood?.trim()) return property.neighborhood.trim()
  const address = property.address?.trim()
  if (!address) return null

  // Fontes de leilão frequentemente entregam "logradouro, bairro, cidade - UF".
  const parts = address.split(',').map(part => part.trim()).filter(Boolean)
  if (parts.length >= 3) {
    const possible = parts.at(-2)?.replace(/\s+-\s+[A-Z]{2}$/i, '').trim()
    if (possible && !/\d/.test(possible) && possible.toLocaleLowerCase('pt-BR') !== property.city?.toLocaleLowerCase('pt-BR')) return possible
  }
  return null
}

export function googleAddressSearchUrl(property: Property) {
  const query = [property.address || property.title, property.city, property.state]
    .filter(Boolean)
    .join(', ')
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export function neighborhoodInsight(property: Property) {
  const score = property.neighborhood_profile?.score ?? property.neighborhood_score
  const confidence = property.neighborhood_profile?.confidence ?? property.neighborhood_confidence
  const label = property.neighborhood_profile?.label
  return { score: score == null ? null : Number(score), confidence: confidence ?? null, label: label ?? null }
}

export function confidenceLabel(confidence: string | null) {
  if (!confidence) return 'sem confiança'
  const normalized = confidence.toLocaleLowerCase('pt-BR')
  if (normalized === 'high' || normalized === 'alta') return 'conf. alta'
  if (normalized === 'medium' || normalized === 'média' || normalized === 'media') return 'conf. média'
  return 'conf. baixa'
}
