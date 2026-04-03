import { Heart, ExternalLink, MapPin, TrendingDown } from 'lucide-react'
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
  strong_buy: 'bg-green-100 text-green-800',
  consider: 'bg-blue-100 text-blue-800',
  risky: 'bg-yellow-100 text-yellow-800',
  avoid: 'bg-red-100 text-red-800',
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
    <div className="border border-border rounded-lg bg-card hover:shadow-md transition-shadow cursor-pointer">
      {/* Photo */}
      <div className="h-40 bg-muted rounded-t-lg overflow-hidden" onClick={onClick}>
        {property.photos?.[0] ? (
          <img src={property.photos[0]} alt={property.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
            Sem foto
          </div>
        )}
      </div>

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0" onClick={onClick}>
            <div className="flex items-center gap-1.5 mb-1">
              {source && (
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                  {source.name}
                </span>
              )}
              {property.property_type && (
                <span className="text-xs px-1.5 py-0.5 bg-accent rounded text-accent-foreground">
                  {TYPE_LABELS[property.property_type] ?? property.property_type}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground line-clamp-2">{property.title}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
            className="p-1.5 rounded-md hover:bg-muted flex-shrink-0"
          >
            <Heart
              size={16}
              className={isFavorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}
            />
          </button>
        </div>

        {/* Location */}
        {(property.city || property.state) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3" onClick={onClick}>
            <MapPin size={12} />
            {[property.city, property.state].filter(Boolean).join(' — ')}
          </div>
        )}

        {/* Price */}
        <div className="flex items-center justify-between" onClick={onClick}>
          <div>
            <p className="text-lg font-bold text-foreground">{formatBRL(property.auction_price)}</p>
            {property.appraised_value && (
              <p className="text-xs text-muted-foreground line-through">
                {formatBRL(property.appraised_value)}
              </p>
            )}
          </div>
          {property.discount_pct != null && property.discount_pct > 0 && (
            <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded">
              <TrendingDown size={14} />
              <span className="text-sm font-semibold">{property.discount_pct.toFixed(0)}%</span>
            </div>
          )}
        </div>

        {/* AI evaluation badge */}
        {evaluation?.recommendation && (
          <div className="mt-3 flex items-center justify-between">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RECOMMENDATION_COLORS[evaluation.recommendation]}`}>
              {RECOMMENDATION_LABELS[evaluation.recommendation]}
            </span>
            {evaluation.score != null && (
              <span className="text-sm font-bold text-foreground">
                {evaluation.score.toFixed(1)}/10
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
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
          >
            <ExternalLink size={12} />
            Ver edital
          </a>
        )}
      </div>
    </div>
  )
}
