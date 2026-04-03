import { useNavigate } from 'react-router-dom'
import { Sparkles, Heart } from 'lucide-react'
import { useFavorites, useToggleFavorite, useRequestEvaluation } from '../hooks/useProperties'
import PropertyCard from '../components/properties/PropertyCard'

export default function FavoritesPage() {
  const navigate = useNavigate()
  const { data: favorites, isLoading } = useFavorites()
  const toggleFav = useToggleFavorite()
  const requestEval = useRequestEvaluation()

  const properties = favorites?.map(f => f.leila_properties).filter(Boolean) ?? []
  const favoriteIds = new Set(favorites?.map(f => f.property_id) ?? [])

  const handleEvaluateAll = () => {
    favorites?.forEach(f => {
      const eval_ = f.leila_properties?.leila_evaluations?.[0]
      if (!eval_ || eval_.status === 'error') {
        requestEval.mutate(f.property_id)
      }
    })
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Favoritos</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {isLoading
                ? 'Carregando...'
                : `${properties.length} imóvel${properties.length !== 1 ? 'is' : ''} salvo${properties.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {properties.length > 0 && (
            <button
              onClick={handleEvaluateAll}
              disabled={requestEval.isPending}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-slate-900/20"
            >
              <Sparkles size={15} />
              {requestEval.isPending ? 'Avaliando...' : 'Avaliar todos com IA'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="h-44 bg-slate-100" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-slate-100 rounded-full w-1/3" />
                  <div className="h-4 bg-slate-100 rounded-full w-4/5" />
                  <div className="h-3 bg-slate-100 rounded-full w-1/2" />
                  <div className="h-6 bg-slate-100 rounded-full w-2/3 mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && properties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
                <Heart size={32} className="text-slate-300" strokeWidth={1.5} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-100 border-2 border-white flex items-center justify-center">
                <span className="text-xs text-red-400 font-bold">0</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-700">Nenhum favorito ainda</p>
              <p className="text-sm text-slate-400 mt-1.5 max-w-xs leading-relaxed">
                Adicione imóveis aos favoritos clicando no corao na listagem. Favoritos podem ser avaliados pela IA.
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-sm shadow-slate-900/20"
            >
              Ver imóveis disponíveis
            </button>
          </div>
        )}

        {/* Grid */}
        {!isLoading && properties.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {properties.map(property => property && (
              <PropertyCard
                key={property.id}
                property={property}
                isFavorite={favoriteIds.has(property.id)}
                onToggleFavorite={() => toggleFav.mutate({
                  property_id: property.id,
                  isFav: favoriteIds.has(property.id),
                })}
                onClick={() => navigate(`/properties/${property.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
