import { Heart, ExternalLink, MapPin, TrendingDown, Ruler, Calendar } from 'lucide-react'
import { Property } from '../../lib/api'

interface Props {
  property: Property
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
}

const TYPE_LABELS: Record<string, string> = {
  apartamento: 'Apto',
  casa: 'Casa',
  terreno: 'Terreno',
  loja: 'Loja',
  prédio: 'Prédio',
  galpão: 'Galpão',
  sala: 'Sala',
  sobrado: 'Sobrado',
}

const RECOMMENDATION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  strong_buy: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  consider:   { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  risky:      { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  avoid:      { bg: 'bg-red-50',     text: 'text-red-600',     dot: 'bg-red-500'     },
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_buy: 'Ótimo negócio',
  consider:   'Considerar',
  risky:      'Arriscado',
  avoid:      'Evitar',
}

const SCORE_COLOR = (score: number) => {
  if (score >= 7.5) return 'text-emerald-600'
  if (score >= 5)   return 'text-amber-600'
  return 'text-red-500'
}

const DISCOUNT_COLOR = (pct: number) => {
  if (pct >= 40) return 'bg-emerald-500 text-white'
  if (pct >= 25) return 'bg-emerald-400 text-white'
  if (pct >= 10) return 'bg-sky-500 text-white'
  return 'bg-slate-500 text-white'
}

function formatBRL(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `R$ ${(value / 1_000).toFixed(0)}k`
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatBRLFull(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function PropertyCard({ property, isFavorite, onToggleFavorite, onClick }: Props) {
  const evaluation = property.leila_evaluations?.[0]
  const source = property.leila_sources
  const rec = evaluation?.recommendation ? RECOMMENDATION_COLORS[evaluation.recommendation] : null
  const pricePerM2 = property.area_m2 && property.area_m2 > 0
    ? property.auction_price / property.area_m2
    : null

  const auctionDate = property.auction_date
    ? new Date(property.auction_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : null

  return (
    <div
      className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col"
      onClick={onClick}
    >
      {/* Top bar: discount + type + source + select */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-0 gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {property.discount_pct != null && property.discount_pct > 0 ? (
            <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${DISCOUNT_COLOR(property.discount_pct)}`}>
              <TrendingDown size={11} />
              -{property.discount_pct.toFixed(0)}%
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-1 rounded-lg bg-slate-100 text-slate-400 flex-shrink-0">
              S/desconto
            </span>
          )}
          {property.property_type && (
            <span className="text-[10px] font-semibold px-2 py-1 bg-slate-900 text-white rounded-md flex-shrink-0">
              {TYPE_LABELS[property.property_type] ?? property.property_type}
            </span>
          )}
          {source && (
            <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-400 rounded-md truncate">
              {source.name}
            </span>
          )}
        </div>

        {/* Favorite/select button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
            isFavorite
              ? 'bg-red-50 border border-red-200'
              : 'bg-slate-100 hover:bg-red-50 hover:border hover:border-red-100'
          }`}
          title={isFavorite ? 'Remover dos selecionados' : 'Selecionar para avaliação'}
        >
          <Heart
            size={13}
            className={isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-400'}
          />
        </button>
      </div>

      {/* Content */}
      <div className="px-3.5 py-3 flex flex-col flex-1">
        {/* Title */}
        <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug mb-2">
          {property.title}
        </p>

        {/* Location */}
        {(property.city || property.state) && (
          <div className="flex items-center gap-1 text-xs text-slate-400 mb-3">
            <MapPin size={10} className="flex-shrink-0" />
            <span className="truncate">{[property.city, property.state].filter(Boolean).join(' — ')}</span>
          </div>
        )}

        {/* Price + metrics row */}
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-2 mb-1">
            <div>
              <p className="text-lg font-bold text-slate-900 tracking-tight leading-none">
                {formatBRLFull(property.auction_price)}
              </p>
              {property.appraised_value && (
                <p className="text-[11px] text-slate-400 line-through mt-0.5">
                  {formatBRL(property.appraised_value)}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              {property.area_m2 && (
                <div className="flex items-center gap-1 text-xs text-slate-500 justify-end">
                  <Ruler size={10} />
                  <span className="font-medium">{property.area_m2} m²</span>
                </div>
              )}
              {pricePerM2 && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  R$ {pricePerM2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}/m²
                </p>
              )}
            </div>
          </div>

          {/* Auction date + edital */}
          <div className="flex items-center justify-between mt-2">
            {auctionDate && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Calendar size={10} />
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
                <ExternalLink size={10} />
                Edital
              </a>
            )}
          </div>
        </div>

        {/* AI evaluation badge */}
        {evaluation?.status === 'done' && rec && (
          <div className={`mt-2.5 pt-2.5 border-t border-slate-100 flex items-center justify-between ${rec.bg} -mx-3.5 -mb-3 px-3.5 pb-3`}>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${rec.dot}`} />
              <span className={`text-[11px] font-semibold ${rec.text}`}>
                {evaluation.recommendation ? RECOMMENDATION_LABELS[evaluation.recommendation] : ''}
              </span>
            </div>
            {evaluation.score != null && (
              <span className={`text-sm font-bold ${SCORE_COLOR(evaluation.score)}`}>
                {evaluation.score.toFixed(1)}<span className="text-slate-400 font-normal text-[10px]">/10</span>
              </span>
            )}
          </div>
        )}

        {evaluation?.status === 'processing' && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 -mx-3.5 -mb-3 px-3.5 pb-3 bg-slate-50">
            <span className="w-3 h-3 border border-slate-300 border-t-slate-600 rounded-full animate-spin flex-shrink-0" />
            <span className="text-[11px] text-slate-400">Avaliando...</span>
          </div>
        )}
      </div>
    </div>
  )
}
