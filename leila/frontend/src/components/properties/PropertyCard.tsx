import { ExternalLink, MapPin, TrendingDown, Ruler, Calendar, Sparkles, Check, ShoppingCart, Gavel, Users, Mail, Tag, Bed, Bath, Car, AlertTriangle } from 'lucide-react'
import { Property } from '../../lib/api'

interface Props {
  property: Property
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
}

// ── Type color system ──────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  apartamento: { label: 'Apto',    bg: 'bg-sky-100',     text: 'text-sky-700'    },
  casa:        { label: 'Casa',    bg: 'bg-emerald-100', text: 'text-emerald-700'},
  terreno:     { label: 'Terreno', bg: 'bg-amber-100',   text: 'text-amber-700'  },
  loja:        { label: 'Loja',    bg: 'bg-violet-100',  text: 'text-violet-700' },
  galpão:      { label: 'Galpão', bg: 'bg-orange-100',  text: 'text-orange-700' },
  sala:        { label: 'Sala',    bg: 'bg-teal-100',    text: 'text-teal-700'   },
  sobrado:     { label: 'Sobrado', bg: 'bg-rose-100',    text: 'text-rose-700'   },
  prédio:      { label: 'Prédio',  bg: 'bg-indigo-100',  text: 'text-indigo-700' },
}

// ── Modality config ────────────────────────────────────────────────────────
const MODALITY_BADGE: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  compra_direta:    { label: 'Compra Direta', icon: ShoppingCart, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  segunda_praca:    { label: '2ª Praça',       icon: Tag,          color: 'text-sky-700',     bg: 'bg-sky-50'     },
  leilao_online:    { label: 'Leilão Online',  icon: Gavel,        color: 'text-blue-700',    bg: 'bg-blue-50'    },
  primeira_praca:   { label: '1ª Praça',       icon: Users,        color: 'text-amber-700',   bg: 'bg-amber-50'   },
  proposta_fechada: { label: 'Proposta',       icon: Mail,         color: 'text-violet-700',  bg: 'bg-violet-50'  },
}

// ── Area classification config ─────────────────────────────────────────────
const AREA_BADGE: Record<string, { label: string; color: string; dot: string }> = {
  nobre:        { label: 'Nobre',        color: 'text-violet-600', dot: 'bg-violet-500' },
  intermediário: { label: 'Intermediária', color: 'text-blue-600',   dot: 'bg-blue-500'   },
  popular:      { label: 'Popular',      color: 'text-amber-600',  dot: 'bg-amber-500'  },
  comunidade:   { label: 'Comunidade',   color: 'text-red-500',    dot: 'bg-red-500'    },
}

// ── Source color system ────────────────────────────────────────────────────
function getSourceConfig(name: string): { text: string; bg: string } {
  const n = name.toLowerCase()
  if (n.includes('caixa'))     return { text: 'text-blue-700',   bg: 'bg-blue-50'   }
  if (n.includes('brasil'))    return { text: 'text-yellow-700', bg: 'bg-yellow-50' }
  if (n.includes('santander')) return { text: 'text-red-700',    bg: 'bg-red-50'    }
  if (n.includes('itaú') || n.includes('itau')) return { text: 'text-orange-700', bg: 'bg-orange-50' }
  if (n.includes('bradesco'))  return { text: 'text-rose-700',   bg: 'bg-rose-50'   }
  return { text: 'text-slate-600', bg: 'bg-slate-50' }
}

// ── Discount accent bar color ──────────────────────────────────────────────
function discountBarColor(pct: number | null): string {
  if (!pct || pct <= 0) return 'bg-slate-200'
  if (pct >= 40) return 'bg-emerald-500'
  if (pct >= 25) return 'bg-sky-400'
  if (pct >= 10) return 'bg-amber-400'
  return 'bg-slate-300'
}

function discountTextColor(pct: number): string {
  if (pct >= 40) return 'text-emerald-700'
  if (pct >= 25) return 'text-sky-700'
  if (pct >= 10) return 'text-amber-700'
  return 'text-slate-500'
}

// ── Recommendation colors ──────────────────────────────────────────────────
const REC_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string }> = {
  strong_buy: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-100' },
  consider:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500',    border: 'border-blue-100'    },
  risky:      { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500',   border: 'border-amber-100'   },
  avoid:      { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500',     border: 'border-red-100'     },
}
const REC_LABELS: Record<string, string> = {
  strong_buy: 'Ótimo negócio',
  consider:   'Considerar',
  risky:      'Arriscado',
  avoid:      'Evitar',
}
const SCORE_COLOR = (s: number) => s >= 7.5 ? 'text-emerald-600' : s >= 5 ? 'text-amber-600' : 'text-red-500'

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}k`
  return fmtBRL(v)
}

export default function PropertyCard({ property, isFavorite, onToggleFavorite, onClick }: Props) {
  const evaluation = property.leila_evaluations ?? undefined
  const source = property.leila_sources
  const typeConf = property.property_type
    ? (TYPE_CONFIG[property.property_type] ?? { label: property.property_type, bg: 'bg-slate-100', text: 'text-slate-600' })
    : null
  const srcConf = source ? getSourceConfig(source.name) : null
  const rec = evaluation?.recommendation ? REC_CONFIG[evaluation.recommendation] : null
  const modalityConf = property.auction_modality ? MODALITY_BADGE[property.auction_modality] : null

  // Área efetiva: useful_area_m2 → area_m2
  const displayArea = property.useful_area_m2 ?? property.area_m2
  const pricePerM2 = displayArea && displayArea > 0 ? property.auction_price / displayArea : null

  // Classificação de área: IA sobrescreve heurística
  const effectiveArea = evaluation?.area_classification ?? property.area_classification
  const areaConf = effectiveArea && effectiveArea !== 'indefinido' ? AREA_BADGE[effectiveArea] : null

  const auctionDate = property.auction_date
    ? new Date(property.auction_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null

  const hasMetrics = property.bedrooms || property.bathrooms || property.parking_spots || displayArea

  return (
    <div
      className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col"
      onClick={onClick}
    >
      {/* ── Accent bar (discount tier) ──────────────────────────────────── */}
      <div className={`h-1 w-full flex-shrink-0 ${discountBarColor(property.discount_pct)}`} />

      {/* ── Top row: discount + tags ──────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 px-3.5 pt-2.5 flex-wrap">
        {/* Discount badge */}
        {property.discount_pct != null && property.discount_pct > 0 ? (
          <span className={`flex items-center gap-0.5 text-[11px] font-bold flex-shrink-0 ${discountTextColor(property.discount_pct)}`}>
            <TrendingDown size={11} />
            -{property.discount_pct.toFixed(0)}%
          </span>
        ) : (
          <span className="text-[10px] font-medium text-slate-400 flex-shrink-0">S/desc.</span>
        )}

        {/* Separator + type */}
        {typeConf && (
          <>
            <span className="text-slate-300 text-[10px]">·</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${typeConf.bg} ${typeConf.text}`}>
              {typeConf.label}
            </span>
          </>
        )}

        {/* Modality */}
        {modalityConf && (() => {
          const Icon = modalityConf.icon
          return (
            <>
              <span className="text-slate-300 text-[10px]">·</span>
              <span className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md ${modalityConf.bg} ${modalityConf.color}`}>
                <Icon size={9} />
                {modalityConf.label}
              </span>
            </>
          )
        })()}

        {/* Source */}
        {srcConf && source && (
          <>
            <span className="text-slate-300 text-[10px]">·</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate max-w-[70px] ${srcConf.bg} ${srcConf.text}`}>
              {source.name}
            </span>
          </>
        )}

        {/* Area classification — pushed right */}
        {areaConf && (
          <span className={`flex items-center gap-1 ml-auto text-[10px] font-semibold ${areaConf.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${areaConf.dot}`} />
            {areaConf.label}
          </span>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="px-3.5 pt-2 pb-3 flex flex-col flex-1">

        {/* Location */}
        {(property.city || property.state) && (
          <div className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-0.5">
            <MapPin size={10} className="text-slate-400 flex-shrink-0" />
            <span className="truncate">{[property.city, property.state].filter(Boolean).join(' — ')}</span>
          </div>
        )}

        {/* Title */}
        <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug mb-2">
          {property.title}
        </p>

        {/* Metrics strip */}
        {hasMetrics && (
          <div className="flex items-center gap-3 mb-2.5 py-2 px-2.5 bg-slate-50 rounded-lg">
            {property.bedrooms != null && (
              <div className="flex items-center gap-1 text-slate-600">
                <Bed size={12} className="text-slate-400" />
                <span className="text-xs font-semibold">{property.bedrooms}</span>
              </div>
            )}
            {property.bathrooms != null && (
              <div className="flex items-center gap-1 text-slate-600">
                <Bath size={12} className="text-slate-400" />
                <span className="text-xs font-semibold">{property.bathrooms}</span>
              </div>
            )}
            {property.parking_spots != null && property.parking_spots > 0 && (
              <div className="flex items-center gap-1 text-slate-600">
                <Car size={12} className="text-slate-400" />
                <span className="text-xs font-semibold">{property.parking_spots}</span>
              </div>
            )}
            {displayArea != null && displayArea > 0 && (
              <div className="flex items-center gap-1 text-slate-600 ml-auto">
                <Ruler size={11} className="text-slate-400" />
                <span className="text-xs font-semibold">{Math.round(displayArea)} m²</span>
              </div>
            )}
            {property.is_occupied && (
              <div className="flex items-center gap-1 text-red-600 ml-auto">
                <AlertTriangle size={11} />
                <span className="text-[10px] font-semibold">Ocupado</span>
              </div>
            )}
          </div>
        )}

        {/* Price + price/m² */}
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2 mb-1">
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                {fmtBRL(property.auction_price)}
              </p>
              {property.appraised_value && (
                <p className="text-[10px] text-slate-400 line-through mt-0.5">
                  avaliado {fmtCompact(property.appraised_value)}
                </p>
              )}
            </div>
            {pricePerM2 && (
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-slate-500">
                  {fmtCompact(pricePerM2)}<span className="text-[10px] font-normal">/m²</span>
                </p>
              </div>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between mt-1">
            {auctionDate && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Calendar size={9} />
                {auctionDate}
              </div>
            )}
            {property.edital_url && (
              <a
                href={property.edital_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-slate-700 transition-colors ml-auto"
              >
                <ExternalLink size={9} />
                Edital
              </a>
            )}
          </div>
        </div>

        {/* ── AI evaluation band ─────────────────────────────────────────── */}
        {evaluation?.status === 'done' && rec && (
          <div className={`mt-2.5 -mx-3.5 px-3.5 py-2 border-t ${rec.border} ${rec.bg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rec.dot}`} />
                <span className={`text-[11px] font-bold ${rec.text}`}>
                  {REC_LABELS[evaluation.recommendation!]}
                </span>
              </div>
              {evaluation.score != null && (
                <span className={`text-sm font-bold tabular-nums ${SCORE_COLOR(evaluation.score)}`}>
                  {evaluation.score.toFixed(1)}<span className="text-slate-400 font-normal text-[10px]">/10</span>
                </span>
              )}
            </div>
          </div>
        )}

        {evaluation?.status === 'processing' && (
          <div className="mt-2.5 -mx-3.5 px-3.5 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-1.5">
            <span className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin flex-shrink-0" />
            <span className="text-[11px] text-slate-400">Avaliando com IA...</span>
          </div>
        )}
      </div>

      {/* ── Select for evaluation button ───────────────────────────────────── */}
      <button
        onClick={e => { e.stopPropagation(); onToggleFavorite() }}
        className={`flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold transition-all duration-150 border-t ${
          isFavorite
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
            : 'bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
        }`}
      >
        {isFavorite ? (
          <>
            <Check size={12} />
            Selecionado para Avaliação
          </>
        ) : (
          <>
            <Sparkles size={12} />
            Selecionar para Avaliação
          </>
        )}
      </button>
    </div>
  )
}
