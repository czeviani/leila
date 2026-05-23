import { Property } from './api'

export type HeatTier = 'hot' | 'warm' | 'cool' | 'cold'

export interface HeatInfo {
  score: number
  tier: HeatTier
  label: string
  shortLabel: string
  bg: string
  text: string
  border: string
  dot: string
}

const TIERS: Record<HeatTier, Omit<HeatInfo, 'score' | 'tier'>> = {
  hot:  { label: 'Quente',    shortLabel: '🔥',  bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  warm: { label: 'Boa oferta', shortLabel: '⚡', bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  cool: { label: 'Regular',   shortLabel: '📋',  bg: 'bg-blue-50',    text: 'text-blue-600',   border: 'border-blue-200',   dot: 'bg-blue-400'   },
  cold: { label: 'Frio',      shortLabel: '—',   bg: 'bg-slate-100',  text: 'text-slate-500',  border: 'border-slate-200',  dot: 'bg-slate-400'  },
}

function tierOf(score: number): HeatTier {
  if (score >= 60) return 'hot'
  if (score >= 40) return 'warm'
  if (score >= 20) return 'cool'
  return 'cold'
}

/**
 * Usa o heat_score do banco quando disponível.
 * Fallback client-side para imóveis sem o campo (dados antigos).
 */
export function getHeatInfo(property: Property): HeatInfo {
  let score = (property as Property & { heat_score?: number }).heat_score ?? clientHeatScore(property)
  score = Math.round(Math.min(score, 100))
  const tier = tierOf(score)
  return { score, tier, ...TIERS[tier] }
}

function clientHeatScore(p: Property): number {
  let s = 0
  const disc = p.discount_pct ?? 0
  s += Math.min(disc / 50, 1) * 35
  if (p.state && ['SP', 'RJ', 'MG', 'ES'].includes(p.state)) s += 20
  const modalityScore: Record<string, number> = {
    segunda_praca: 15, leilao_online: 10, compra_direta: 8, proposta_fechada: 5, primeira_praca: 3,
  }
  s += modalityScore[p.auction_modality ?? ''] ?? 0
  const areaScore: Record<string, number> = {
    nobre: 15, 'intermediário': 10, popular: 5,
  }
  const areaClass = (p.leila_evaluations?.area_classification ?? p.area_classification) ?? ''
  s += areaScore[areaClass] ?? 0
  if (p.auction_date) {
    const days = Math.ceil((new Date(p.auction_date).getTime() - Date.now()) / 86_400_000)
    if (days > 0 && days <= 7)  s += 15
    else if (days <= 30)        s += 8
    else if (days > 30)         s += 3
  }
  return Math.min(s, 100)
}

export function daysUntilAuction(auctionDate: string | null): number | null {
  if (!auctionDate) return null
  return Math.ceil((new Date(auctionDate).getTime() - Date.now()) / 86_400_000)
}
