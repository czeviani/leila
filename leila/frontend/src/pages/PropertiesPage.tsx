import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search } from 'lucide-react'
import { useProperties, useFavorites, useToggleFavorite, useRunScraper } from '../hooks/useProperties'
import PropertyCard from '../components/properties/PropertyCard'
import FilterPanel from '../components/filters/FilterPanel'

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [filterParams, setFilterParams] = useState<Record<string, string | number | undefined>>({})
  const [page, setPage] = useState(1)

  const { data, isLoading, isError } = useProperties({ ...filterParams, page, limit: 48 })
  const { data: favorites } = useFavorites()
  const toggleFav = useToggleFavorite()
  const runScraper = useRunScraper()

  const favoriteIds = new Set(favorites?.map(f => f.property_id) ?? [])

  const filteredProperties = data?.data.filter(p =>
    !searchText ||
    p.title.toLowerCase().includes(searchText.toLowerCase()) ||
    p.city?.toLowerCase().includes(searchText.toLowerCase()) ||
    p.address?.toLowerCase().includes(searchText.toLowerCase())
  ) ?? []

  const handleScrape = () => {
    runScraper.mutate(undefined)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Imóveis</h2>
          {data && (
            <p className="text-sm text-muted-foreground">{data.total} imóveis encontrados</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleScrape}
            disabled={runScraper.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={16} className={runScraper.isPending ? 'animate-spin' : ''} />
            {runScraper.isPending ? 'Buscando...' : 'Atualizar dados'}
          </button>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por título, cidade, endereço..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <FilterPanel onFilterChange={(params) => { setFilterParams(params); setPage(1) }} />
      </div>

      {/* Grid */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Carregando imóveis...
        </div>
      )}
      {isError && (
        <div className="text-center py-20 text-destructive">Erro ao carregar imóveis.</div>
      )}
      {!isLoading && filteredProperties.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          Nenhum imóvel encontrado. Use "Atualizar dados" para buscar novos imóveis.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProperties.map(property => (
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

      {/* Pagination */}
      {data && data.total > data.limit && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {Math.ceil(data.total / data.limit)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / data.limit)}
            className="px-4 py-2 text-sm border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
