import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, ExternalLink, MapPin, Home, TrendingDown, Sparkles, CheckCircle, AlertTriangle, Calendar } from 'lucide-react'
import { useProperty, useFavorites, useToggleFavorite, useRequestEvaluation } from '../hooks/useProperties'

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const RECOMMENDATION_MAP = {
  strong_buy: { label: 'Ótimo negócio', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  consider: { label: 'Considerar', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  risky: { label: 'Arriscado', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
  avoid: { label: 'Evitar', color: 'bg-red-50 text-red-700 border border-red-200' },
}

const SCORE_COLORS = (score: number) => {
  if (score >= 7.5) return 'text-emerald-600'
  if (score >= 5) return 'text-amber-600'
  return 'text-red-500'
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: property, isLoading } = useProperty(id!)
  const { data: favorites } = useFavorites()
  const toggleFav = useToggleFavorite()
  const requestEval = useRequestEvaluation()

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50">
        <div className="bg-white border-b border-slate-100 px-6 py-4">
          <div className="h-5 w-24 bg-slate-100 rounded-full animate-pulse" />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
          <div className="h-8 bg-slate-100 rounded-xl animate-pulse w-3/4" />
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Home size={28} className="text-red-400" strokeWidth={1.5} />
          </div>
          <p className="text-base font-semibold text-slate-700">Imóvel não encontrado</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const isFav = favorites?.some(f => f.property_id === property.id) ?? false
  const evaluation = property.leila_evaluations ?? undefined
  const recInfo = evaluation?.recommendation ? RECOMMENDATION_MAP[evaluation.recommendation] : null

  return (
    <div className="min-h-full bg-slate-50">
      {/* Top nav bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <div className="flex items-center gap-2">
            {property.leila_sources && (
              <span className="text-xs font-medium px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg">
                {property.leila_sources.name}
              </span>
            )}
            <button
              onClick={() => toggleFav.mutate({ property_id: property.id, isFav })}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                isFav
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Heart size={15} className={isFav ? 'fill-red-500 text-red-500' : ''} />
              {isFav ? 'Salvo' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-snug mb-4">
          {property.title}
        </h1>

        {/* Photo */}
        {property.photos?.[0] && (
          <div className="rounded-2xl overflow-hidden mb-6 shadow-sm">
            <img
              src={property.photos[0]}
              alt={property.title}
              className="w-full h-72 object-cover"
            />
          </div>
        )}

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Preço de Lance</p>
            <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatBRL(property.auction_price)}</p>
          </div>

          {property.appraised_value && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Valor de Avaliação</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{formatBRL(property.appraised_value)}</p>
            </div>
          )}

          {property.discount_pct != null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-2">Desconto</p>
              <div className="flex items-center gap-2">
                <TrendingDown className="text-emerald-500" size={22} />
                <p className="text-2xl font-bold text-emerald-700 tracking-tight">{property.discount_pct.toFixed(1)}%</p>
              </div>
            </div>
          )}

          {property.area_m2 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Área</p>
              <div className="flex items-center gap-2">
                <Home className="text-slate-400" size={20} />
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{property.area_m2} <span className="text-base font-normal text-slate-500">m²</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Address + auction date */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-sm space-y-3">
          {(property.address || property.city) && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin size={13} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 mb-0.5">Localização</p>
                <p className="text-sm text-slate-700">{[property.address, property.city, property.state].filter(Boolean).join(', ')}</p>
              </div>
            </div>
          )}
          {property.auction_date && (
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar size={13} className="text-slate-500" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 mb-0.5">Data do Leilão</p>
                <p className="text-sm text-slate-700">
                  {new Date(property.auction_date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {property.description && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Descrição</h3>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{property.description}</p>
          </div>
        )}

        {/* Edital */}
        {property.edital_url && (
          <a
            href={property.edital_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all mb-6 shadow-sm"
          >
            <ExternalLink size={15} className="text-slate-400" />
            Ver edital completo
          </a>
        )}

        {/* AI Evaluation */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Avaliação IA</h3>
                <p className="text-xs text-slate-400">Análise por Claude</p>
              </div>
            </div>
            {(!evaluation || evaluation.status === 'error') && (
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={() => requestEval.mutate(property.id)}
                  disabled={requestEval.isPending}
                  className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm shadow-slate-900/20"
                >
                  <Sparkles size={13} />
                  {requestEval.isPending ? 'Solicitando...' : 'Avaliar com IA'}
                </button>
                {requestEval.isError && (
                  <p className="text-xs text-red-500">{(requestEval.error as Error)?.message ?? 'Erro ao solicitar'}</p>
                )}
              </div>
            )}
          </div>

          <div className="p-5">
            {!evaluation && (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">Clique em <strong className="text-slate-700">Avaliar com IA</strong> para gerar uma análise completa deste imóvel.</p>
              </div>
            )}

            {evaluation?.status === 'processing' && (
              <div className="flex flex-col items-center justify-center gap-3 py-8">
                <span className="w-5 h-5 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Analisando imóvel com IA... (~40 segundos)</p>
                <p className="text-xs text-slate-400">A página atualiza automaticamente</p>
              </div>
            )}

            {evaluation?.status === 'error' && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">Erro ao gerar a avaliação. Tente novamente.</p>
              </div>
            )}

            {evaluation?.status === 'done' && (
              <div className="space-y-5">
                {/* Score + recommendation */}
                <div className="flex items-center gap-4 pb-5 border-b border-slate-100">
                  {evaluation.score != null && (
                    <div className="text-center">
                      <span className={`text-4xl font-bold tracking-tight ${SCORE_COLORS(evaluation.score)}`}>
                        {evaluation.score.toFixed(1)}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">/10</p>
                    </div>
                  )}
                  {recInfo && (
                    <span className={`text-sm font-semibold px-3 py-1.5 rounded-full ${recInfo.color}`}>
                      {recInfo.label}
                    </span>
                  )}
                </div>

                {evaluation.summary && (
                  <p className="text-sm text-slate-700 leading-relaxed">{evaluation.summary}</p>
                )}

                {/* Notes */}
                {[
                  { label: 'Localização', value: evaluation.location_notes },
                  { label: 'Condições', value: evaluation.condition_notes },
                  { label: 'Documentação', value: evaluation.documents_notes },
                ].filter(n => n.value).map(note => (
                  <div key={note.label} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{note.label}</p>
                    <p className="text-sm text-slate-700">{note.value}</p>
                  </div>
                ))}

                {/* Highlights */}
                {evaluation.highlights?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Pontos Positivos</p>
                    <ul className="space-y-2">
                      {evaluation.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                          <div className="w-5 h-5 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <CheckCircle size={11} className="text-emerald-600" />
                          </div>
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Risks */}
                {evaluation.risks?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Riscos</p>
                    <ul className="space-y-2">
                      {evaluation.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                          <div className="w-5 h-5 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <AlertTriangle size={11} className="text-amber-600" />
                          </div>
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
      </div>
    </div>
  )
}
