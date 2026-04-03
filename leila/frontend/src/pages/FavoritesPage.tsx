import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Favoritos</h2>
          <p className="text-sm text-muted-foreground">{properties.length} imóvel(is) salvos</p>
        </div>

        {properties.length > 0 && (
          <button
            onClick={handleEvaluateAll}
            disabled={requestEval.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles size={16} />
            {requestEval.isPending ? 'Avaliando...' : 'Avaliar todos com IA'}
          </button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Carregando favoritos...
        </div>
      )}

      {!isLoading && properties.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          Nenhum favorito ainda. Adicione imóveis clicando no coração na listagem.
        </div>
      )}

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
    </div>
  )
}
