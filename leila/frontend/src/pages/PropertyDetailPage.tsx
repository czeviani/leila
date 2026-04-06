import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, ExternalLink, MapPin, Home, TrendingDown, Sparkles, AlertTriangle, Calendar } from 'lucide-react'
import { useProperty, useFavorites, useToggleFavorite, useRequestEvaluation } from '../hooks/useProperties'
import InvestmentDashboard from '../components/evaluator/InvestmentDashboard'

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
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
        <div className="rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-1 py-3">
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

          {!evaluation && (
            <div className="text-center py-8 bg-white border border-slate-200 rounded-2xl">
              <p className="text-sm text-slate-500">Clique em <strong className="text-slate-700">Avaliar com IA</strong> para gerar uma análise completa deste imóvel.</p>
            </div>
          )}

          {evaluation?.status === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 bg-[#0d1117] rounded-2xl">
              {/* Skeleton shimmer */}
              <div className="w-full px-5 space-y-3 animate-pulse">
                <div className="h-24 bg-gray-800 rounded-xl" />
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-800 rounded-xl" />)}
                </div>
                <div className="h-20 bg-gray-800 rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-800 rounded-xl" />)}
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Analisando com IA... (~40 segundos)</p>
              <p className="text-xs text-gray-600">A página atualiza automaticamente</p>
            </div>
          )}

          {evaluation?.status === 'error' && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">Erro ao gerar a avaliação. Tente novamente.</p>
            </div>
          )}

          {evaluation?.status === 'done' && evaluation.financial_data && (
            <InvestmentDashboard analysis={evaluation.financial_data} />
          )}

          {evaluation?.status === 'done' && !evaluation.financial_data && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700">Análise indisponível — tente reavaliar o imóvel.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
