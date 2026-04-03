import { Heart, ExternalLink, MapPin, TrendingDown, Home } from 'lucide-react'
import { Property } from '../../lib/api'

interface Props {
  property: Property
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
}

const TYPE_LABELS: Record<string, string> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  terreno: 'Terreno',
  loja: 'Loja',
  prédio: 'Prédio',
  galpão: 'Galpão',
  sala: 'Sala',
  sobrado: 'Sobrado',
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  strong_buy: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  consider: 'bg-blue-50 text-blue-700 border border-blue-200',
  risky: 'bg-amber-50 text-amber-700 border border-amber-200',
  avoid: 'bg-red-50 text-red-700 border border-red-200',
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  strong_buy: 'Ótimo negócio',
  consider: 'Considerar',
  risky: 'Arriscado',
  avoid: 'Evitar',
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default function PropertyCard({ property, isFavorite, onToggleFavorite, onClick }: Props) {
  const evaluation = property.leila_evaluations?.[0]
  const source = property.leila_sources

  return (
    <div className="group bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col">
      {/* Photo */}
      <div className="relative h-44 bg-slate-100 overflow-hidden flex-shrink-0" onClick={onClick}>
        {property.photos?.[0] ? (
          <img
            src={property.photos[0]}
            alt={property.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400">
            <Home size={28} strokeWidth={1.5} />
            <span className="text-xs font-medium">Sem foto</span>
          </div>
        )}

        {/* Discount badge over photo */}
        {property.discount_pct != null && property.discount_pct > 0 && (
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-sm">
            <TrendingDown size={11} />
            -{property.discount_pct.toFixed(0)}%
          </div>
        )}

        {/* Favorite button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center hover:bg-white transition-colors"
        >
          <Heart
            size={15}
            className={isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-400'}
          />
        </button>
      </div>

      <div className="p-4 flex flex-col flex-1" onClick={onClick}>
        {/* Badges row */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {source && (
            <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">
              {source.name}
            </span>
          )}
          {property.property_type && (
            <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-900 text-white rounded-md">
              {TYPE_LABELS[property.property_type] ?? property.property_type}
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-slate-800 line-clamp-2 leading-snug mb-2">
          {property.title}
        </p>

        {/* Location */}
        {(property.city || property.state) && (
          <div className="flex items-center gap-1 text-xs text-slate-400 mb-3">
            <MapPin size={11} />
            <span className="truncate">{[property.city, property.state].filter(Boolean).join(' — ')}</span>
          </div>
        )}

        {/* Price block */}
        <div className="mt-auto">
          <p className="text-xl font-bold text-slate-900 tracking-tight">
            {formatBRL(property.auction_price)}
          </p>
          {property.appraised_value && (
            <p className="text-xs text-slate-400 line-through mt-0.5">
              {formatBRL(property.appraised_value)}
            </p>
          )}
        </div>

        {/* AI evaluation badge */}
        {evaluation?.recommendation && (
          <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-100">
            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${RECOMMENDATION_COLORS[evaluation.recommendation]}`}>
              {RECOMMENDATION_LABELS[evaluation.recommendation]}
            </span>
            {evaluation.score != null && (
              <span className="text-sm font-bold text-slate-700">
                {evaluation.score.toFixed(1)}<span className="text-slate-400 font-normal text-xs">/10</span>
              </span>
            )}
          </div>
        )}

        {/* Edital link */}
        {property.edital_url && (
          <a
            href={property.edital_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors mt-2.5"
          >
            <ExternalLink size={11} />
            Ver edital
          </a>
        )}
      </div>
    </div>
  )
}
