import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, ExternalLink, MapPin, Home, TrendingDown, Sparkles, CheckCircle, AlertTriangle } from 'lucide-react'
import { useProperty, useFavorites, useToggleFavorite, useRequestEvaluation } from '../hooks/useProperties'

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const RECOMMENDATION_MAP = {
  strong_buy: { label: 'Ótimo negócio', color: 'text-green-600 bg-green-50' },
  consider: { label: 'Considerar', color: 'text-blue-600 bg-blue-50' },
  risky: { label: 'Arriscado', color: 'text-yellow-600 bg-yellow-50' },
  avoid: { label: 'Evitar', color: 'text-red-600 bg-red-50' },
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: property, isLoading } = useProperty(id!)
  const { data: favorites } = useFavorites()
  const toggleFav = useToggleFavorite()
  const requestEval = useRequestEvaluation()

  if (isLoading) return <div className="p-6 text-muted-foreground">Carregando...</div>
  if (!property) return <div className="p-6 text-destructive">Imóvel não encontrado.</div>

  const isFav = favorites?.some(f => f.property_id === property.id) ?? false
  const evaluation = property.leila_evaluations?.[0]
  const recInfo = evaluation?.recommendation ? RECOMMENDATION_MAP[evaluation.recommendation] : null

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Title row */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-2xl font-bold">{property.title}</h2>
        <button
          onClick={() => toggleFav.mutate({ property_id: property.id, isFav })}
          className="p-2 border border-border rounded-md hover:bg-muted"
        >
          <Heart size={18} className={isFav ? 'fill-red-500 text-red-500' : 'text-muted-foreground'} />
        </button>
      </div>

      {/* Source badge */}
      {property.leila_sources && (
        <span className="text-xs px-2 py-0.5 bg-muted rounded text-muted-foreground">
          {property.leila_sources.name}
        </span>
      )}

      {/* Photo */}
      {property.photos?.[0] && (
        <img
          src={property.photos[0]}
          alt={property.title}
          className="w-full h-64 object-cover rounded-lg mt-4 mb-6"
        />
      )}

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Preço de Lance</p>
          <p className="text-xl font-bold">{formatBRL(property.auction_price)}</p>
        </div>
        {property.appraised_value && (
          <div className="border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">Valor de Avaliação</p>
            <p className="text-xl font-bold">{formatBRL(property.appraised_value)}</p>
          </div>
        )}
        {property.discount_pct != null && (
          <div className="border border-border rounded-lg p-4 flex items-center gap-2">
            <TrendingDown className="text-green-500" size={20} />
            <div>
              <p className="text-xs text-muted-foreground">Desconto</p>
              <p className="text-xl font-bold text-green-600">{property.discount_pct.toFixed(1)}%</p>
            </div>
          </div>
        )}
        {property.area_m2 && (
          <div className="border border-border rounded-lg p-4 flex items-center gap-2">
            <Home className="text-muted-foreground" size={20} />
            <div>
              <p className="text-xs text-muted-foreground">Área</p>
              <p className="text-xl font-bold">{property.area_m2} m²</p>
            </div>
          </div>
        )}
      </div>

      {/* Address */}
      {(property.address || property.city) && (
        <div className="flex items-start gap-2 text-sm text-muted-foreground mb-4">
          <MapPin size={14} className="mt-0.5 flex-shrink-0" />
          <span>{[property.address, property.city, property.state].filter(Boolean).join(', ')}</span>
        </div>
      )}

      {/* Description */}
      {property.description && (
        <div className="mb-6">
          <h3 className="font-semibold mb-2">Descrição</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.description}</p>
        </div>
      )}

      {/* Edital */}
      {property.edital_url && (
        <a
          href={property.edital_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline mb-6"
        >
          <ExternalLink size={14} />
          Ver edital completo
        </a>
      )}

      {/* AI Evaluation */}
      <div className="border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles size={16} />
            Avaliação IA
          </h3>
          {(!evaluation || evaluation.status === 'error') && (
            <button
              onClick={() => requestEval.mutate(property.id)}
              disabled={requestEval.isPending}
              className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {requestEval.isPending ? 'Solicitando...' : 'Avaliar com IA'}
            </button>
          )}
        </div>

        {!evaluation && (
          <p className="text-sm text-muted-foreground">Clique em "Avaliar com IA" para gerar uma análise deste imóvel.</p>
        )}

        {evaluation?.status === 'processing' && (
          <p className="text-sm text-muted-foreground">Análise em andamento... atualize a página em instantes.</p>
        )}

        {evaluation?.status === 'done' && (
          <div className="space-y-4">
            {/* Score + recommendation */}
            <div className="flex items-center gap-3">
              {evaluation.score != null && (
                <span className="text-3xl font-bold">{evaluation.score.toFixed(1)}</span>
              )}
              {recInfo && (
                <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${recInfo.color}`}>
                  {recInfo.label}
                </span>
              )}
            </div>

            {evaluation.summary && (
              <p className="text-sm text-foreground">{evaluation.summary}</p>
            )}

            {/* Notes */}
            {[
              { label: 'Localização', value: evaluation.location_notes },
              { label: 'Condições', value: evaluation.condition_notes },
              { label: 'Documentação', value: evaluation.documents_notes },
            ].filter(n => n.value).map(note => (
              <div key={note.label}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{note.label}</p>
                <p className="text-sm">{note.value}</p>
              </div>
            ))}

            {/* Highlights */}
            {evaluation.highlights?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Pontos Positivos</p>
                <ul className="space-y-1">
                  {evaluation.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Risks */}
            {evaluation.risks?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Riscos</p>
                <ul className="space-y-1">
                  {evaluation.risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle size={14} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
