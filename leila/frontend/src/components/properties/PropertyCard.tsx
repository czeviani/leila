import { ExternalLink, MapPin, TrendingDown, Ruler, Calendar, Sparkles, Check, ShoppingCart, Gavel, Users, Mail } from 'lucide-react'
import { Property } from '../../lib/api'

interface Props {
  property: Property
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
}

// ── Type color system ──────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  apartamento: { label: 'Apto',     bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200'    },
  casa:        { label: 'Casa',     bg: 'bg-emerald-100', text: 'text-emerald-700',border: 'border-emerald-200' },
  terreno:     { label: 'Terreno',  bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200'  },
  loja:        { label: 'Loja',     bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
  galpão:      { label: 'Galpão',  bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  sala:        { label: 'Sala',     bg: 'bg-teal-100',   text: 'text-teal-700',   border: 'border-teal-200'   },
  sobrado:     { label: 'Sobrado',  bg: 'bg-rose-100',   text: 'text-rose-700',   border: 'border-rose-200'   },
  prédio:      { label: 'Prédio',   bg: 'bg-indigo-100', text: 'text-indigo-700', border: 'border-indigo-200' },
}

// ── Modality config ────────────────────────────────────────────────────────
const MODALITY_BADGE: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  compra_direta:    { label: 'Compra Direta',    icon: ShoppingCart, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  leilao_online:    { label: 'Leilão Online',    icon: Gavel,        color: 'text-blue-700',    bg: 'bg-blue-50'    },
  leilao:           { label: 'Leilão',           icon: Users,        color: 'text-amber-700',   bg: 'bg-amber-50'   },
  proposta_fechada: { label: 'Proposta',         icon: Mail,         color: 'text-violet-700',  bg: 'bg-violet-50'  },
}

// ── Area classification config ─────────────────────────────────────────────
const AREA_BADGE: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  nobre:        { label: 'Nobre',        color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500' },
  intermediário: { label: 'Intermediária', color: 'text-blue-600',   bg: 'bg-blue-50',   dot: 'bg-blue-500'   },
  popular:      { label: 'Popular',      color: 'text-amber-700',  bg: 'bg-amber-50',  dot: 'bg-amber-500'  },
  comunidade:   { label: 'Comunidade',   color: 'text-red-600',    bg: 'bg-red-50',    dot: 'bg-red-500'    },
}

// ── Source color system ────────────────────────────────────────────────────
function getSourceConfig(name: string): { bg: string; text: string; border: string } {
  const n = name.toLowerCase()
  if (n.includes('caixa'))     return { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200'   }
  if (n.includes('brasil'))    return { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' }
  if (n.includes('santander')) return { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200'    }
  if (n.includes('itaú') || n.includes('itau')) return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' }
  if (n.includes('bradesco'))  return { bg: 'bg-rose-100',   text: 'text-rose-700',   border: 'border-rose-200'   }
  return { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' }
}

// ── Discount badge color ───────────────────────────────────────────────────
function discountColor(pct: number) {
  if (pct >= 40) return 'bg-emerald-500 text-white'
  if (pct >= 25) return 'bg-emerald-400 text-white'
  if (pct >= 10) return 'bg-sky-500 text-white'
  return 'bg-slate-500 text-white'
}

// ── Recommendation colors ──────────────────────────────────────────────────
const REC_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  strong_buy: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  consider:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  risky:      { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  avoid:      { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
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
  const typeConf = property.property_type ? (TYPE_CONFIG[property.property_type] ?? { label: property.property_type, bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' }) : null
  const srcConf = source ? getSourceConfig(source.name) : null
  const rec = evaluation?.recommendation ? REC_CONFIG[evaluation.recommendation] : null
  const pricePerM2 = property.area_m2 && property.area_m2 > 0 ? property.auction_price / property.area_m2 : null
  const modalityConf = property.auction_modality ? MODALITY_BADGE[property.auction_modality] : null
  const areaConf = evaluation?.area_classification && evaluation.area_classification !== 'indefinido'
    ? AREA_BADGE[evaluation.area_classification] : null

  const auctionDate = property.auction_date
    ? new Date(property.auction_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null

  return (
    <div
      className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col"
      onClick={onClick}
    >
      {/* Top row: discount + tags */}
      <div className="flex items-center gap-1.5 px-3.5 pt-3.5 flex-wrap">
        {property.discount_pct != null && property.discount_pct > 0 ? (
          <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${discountColor(property.discount_pct)}`}>
            <TrendingDown size={10} />
            -{property.discount_pct.toFixed(0)}%
          </span>
        ) : (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-lg bg-slate-100 text-slate-400 border border-slate-200 flex-shrink-0">
            S/desc.
          </span>
        )}
        {typeConf && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border flex-shrink-0 ${typeConf.bg} ${typeConf.text} ${typeConf.border}`}>
            {typeConf.label}
          </span>
        )}
        {srcConf && source && (
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-lg border truncate max-w-[80px] ${srcConf.bg} ${srcConf.text} ${srcConf.border}`}>
            {source.name}
          </span>
        )}
        {modalityConf && (() => {
          const Icon = modalityConf.icon
          return (
            <span className={`flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-lg border border-transparent ${modalityConf.bg} ${modalityConf.color}`}>
              <Icon size={9} />
              {modalityConf.label}
            </span>
          )
        })()}
      </div>

      {/* Body */}
      <div className="px-3.5 pt-2.5 pb-3 flex flex-col flex-1">
        {/* Title */}
        <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug mb-1.5">
          {property.title}
        </p>

        {/* Location */}
        {(property.city || property.state) && (
          <div className="flex items-center gap-1 text-xs text-slate-400 mb-3">
            <MapPin size={10} className="flex-shrink-0" />
            <span className="truncate">{[property.city, property.state].filter(Boolean).join(' — ')}</span>
          </div>
        )}

        {/* Price + metrics */}
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2 mb-1.5">
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                {fmtBRL(property.auction_price)}
              </p>
              {property.appraised_value && (
                <p className="text-[11px] text-slate-400 line-through mt-0.5">
                  {fmtCompact(property.appraised_value)}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              {property.area_m2 && (
                <div className="flex items-center gap-0.5 text-xs text-slate-500 justify-end">
                  <Ruler size={10} />
                  <span className="font-medium">{property.area_m2} m²</span>
                </div>
              )}
              {pricePerM2 && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  R$ {Math.round(pricePerM2).toLocaleString('pt-BR')}/m²
                </p>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center justify-between">
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

        {/* AI evaluation badge */}
        {evaluation?.status === 'done' && rec && (
          <div className={`mt-2.5 pt-2 border-t border-slate-100 -mx-3.5 px-3.5 pb-0 ${rec.bg}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rec.dot}`} />
                <span className={`text-[11px] font-semibold ${rec.text}`}>
                  {evaluation.recommendation ? REC_LABELS[evaluation.recommendation] : ''}
                </span>
              </div>
              {evaluation.score != null && (
                <span className={`text-sm font-bold ${SCORE_COLOR(evaluation.score)}`}>
                  {evaluation.score.toFixed(1)}<span className="text-slate-400 font-normal text-[10px]">/10</span>
                </span>
              )}
            </div>
            {areaConf && (
              <div className="flex items-center gap-1 mt-1 pb-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${areaConf.dot}`} />
                <span className={`text-[10px] font-medium ${areaConf.color}`}>{areaConf.label}</span>
              </div>
            )}
          </div>
        )}

        {evaluation?.status === 'processing' && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 -mx-3.5 px-3.5 pb-0 bg-slate-50">
            <span className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin flex-shrink-0" />
            <span className="text-[11px] text-slate-400">Avaliando...</span>
          </div>
        )}
      </div>

      {/* ── Select for evaluation button ── touch-friendly, full width ────── */}
      <button
        onClick={e => { e.stopPropagation(); onToggleFavorite() }}
        className={`flex items-center justify-center gap-2 w-full py-3 text-sm font-semibold transition-all duration-150 border-t ${
          isFavorite
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100'
            : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100 hover:text-slate-800'
        }`}
      >
        {isFavorite ? (
          <>
            <Check size={14} />
            Selecionado para Avaliação
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Selecionar para Avaliação
          </>
        )}
      </button>
    </div>
  )
}
