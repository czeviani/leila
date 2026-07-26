import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Search, Home, TrendingDown, DollarSign, Maximize2,
  Clock, ArrowUpDown, LayoutGrid, List, Flame, X, Eye, Sparkles,
} from 'lucide-react'
import { useProperties, useFavorites, useToggleFavorite, useRunScraper, useSources } from '../hooks/useProperties'
import PropertyCard from '../components/properties/PropertyCard'
import PropertyRow from '../components/properties/PropertyRow'
import FilterPanel from '../components/filters/FilterPanel'

type ViewMode = 'list' | 'grid'

type SortOption = {
  key: string
  label: string
  sort_by: string
  sort_order: 'asc' | 'desc'
  icon: React.ElementType
}

const SORT_OPTIONS: SortOption[] = [
  { key: 'heat_score',    label: 'Mais Quente',  sort_by: 'heat_score',    sort_order: 'desc', icon: Flame       },
  { key: 'discount_desc', label: 'Maior Desconto', sort_by: 'discount_pct', sort_order: 'desc', icon: TrendingDown },
  { key: 'price_asc',     label: 'Menor Preço',   sort_by: 'auction_price', sort_order: 'asc',  icon: DollarSign  },
  { key: 'area_desc',     label: 'Maior Área',    sort_by: 'area_m2',       sort_order: 'desc', icon: Maximize2   },
  { key: 'date_asc',      label: 'Prazo',         sort_by: 'auction_date',  sort_order: 'asc',  icon: Clock       },
]

const PAGE_SIZE_OPTIONS = [
  { label: '50',   value: 50    },
  { label: '100',  value: 100   },
  { label: 'Tudo', value: 99999 },
]

function useLocalStorage<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch { return defaultValue }
  })
  const set = (v: T) => { setValue(v); localStorage.setItem(key, JSON.stringify(v)) }
  return [value, set]
}

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>('leila_view_mode', 'list')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filterParams, setFilterParams] = useState<Record<string, string | number | undefined>>({})
  const [page, setPage] = useState(1)
  const [activeSort, setActiveSort] = useState<SortOption>(SORT_OPTIONS[0])
  const [pageSize, setPageSize] = useState(50)
  const [dismissedIds, setDismissedIds] = useLocalStorage<string[]>('leila_dismissed', [])
  const [showDismissed, setShowDismissed] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTopRef = useRef<HTMLDivElement>(null)

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(searchText)
      setPage(1)
    }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchText])

  // Scroll to top of list when page changes
  useEffect(() => {
    const main = document.querySelector('main')
    if (main && page > 1) main.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])

  const dismissedSet = useMemo(() => new Set(dismissedIds), [dismissedIds])

  const queryParams = {
    ...filterParams,
    page,
    limit: pageSize,
    sort_by: activeSort.sort_by,
    sort_order: activeSort.sort_order,
    ...(debouncedSearch.trim().length >= 2 ? { search: debouncedSearch.trim() } : {}),
  }

  const { data, isLoading, isError } = useProperties(queryParams)
  const { data: favorites } = useFavorites()
  const { data: sources } = useSources()
  const toggleFav = useToggleFavorite()
  const runScraper = useRunScraper()

  const lastScrapedAt = sources?.map(s => s.last_scraped_at).filter(Boolean).sort().at(-1) ?? null

  const lastScrapedLabel = (() => {
    if (!lastScrapedAt) return null
    const diffMs = Date.now() - new Date(lastScrapedAt).getTime()
    const mins = Math.floor(diffMs / 60_000)
    const hours = Math.floor(diffMs / 3_600_000)
    const days = Math.floor(diffMs / 86_400_000)
    if (mins < 2) return 'há poucos minutos'
    if (mins < 60) return `há ${mins} min`
    if (hours < 24) return `há ${hours}h`
    if (days === 1) return 'há 1 dia'
    return `há ${days} dias`
  })()

  const favoriteIds = useMemo(() => new Set(favorites?.map(f => f.property_id) ?? []), [favorites])

  const allProperties = data?.data ?? []
  const visibleProperties = showDismissed
    ? allProperties
    : allProperties.filter(p => !dismissedSet.has(p.id))

  const hiddenCount = allProperties.length - visibleProperties.length

  // Quick stats from current page results
  const hotCount = useMemo(
    () => visibleProperties.filter(p => ((p as any).heat_score ?? 0) >= 60).length,
    [visibleProperties]
  )
  const aiCount = useMemo(
    () => visibleProperties.filter(p => p.leila_evaluations?.status === 'done').length,
    [visibleProperties]
  )

  const handleScrape = () => runScraper.mutate(undefined)
  const handleSort = (option: SortOption) => { setActiveSort(option); setPage(1) }
  const handlePageSize = (size: number) => { setPageSize(size); setPage(1) }
  const totalPages = data && pageSize < 99999 ? Math.ceil(data.total / pageSize) : 1

  const dismiss = (id: string) => setDismissedIds([...dismissedIds, id])
  const clearDismissed = () => setDismissedIds([])

  return (
    <div className="min-h-full bg-slate-50 dark:bg-[#0d0f13]">
      {/* Page header */}
      <div className="bg-white dark:bg-[#15181e] border-b border-slate-100 dark:border-slate-800/80 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Imóveis</h1>
            {/* Stats strip */}
            <div className="flex items-center gap-2.5 mt-1 flex-wrap">
              {data ? (
                <span className="text-sm text-slate-400 dark:text-slate-500 num">
                  {data.total.toLocaleString('pt-BR')} encontrados
                </span>
              ) : (
                <span className="text-sm text-slate-400 dark:text-slate-500">Buscando...</span>
              )}
              {!isLoading && hotCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 px-2 py-0.5 rounded-full">
                  <Flame size={10} /> {hotCount} quentes
                </span>
              )}
              {!isLoading && aiCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> {aiCount} com IA
                </span>
              )}
              {dismissedIds.length > 0 && !showDismissed && (
                <button
                  onClick={() => setShowDismissed(true)}
                  className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2"
                >
                  {dismissedIds.length} descartado{dismissedIds.length !== 1 ? 's' : ''} oculto{dismissedIds.length !== 1 ? 's' : ''}
                </button>
              )}
              {showDismissed && dismissedIds.length > 0 && (
                <button
                  onClick={() => setShowDismissed(false)}
                  className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 underline underline-offset-2"
                >
                  ocultar descartados
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dismissedIds.length > 0 && (
              <button
                onClick={clearDismissed}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                title="Restaurar todos os descartados"
              >
                <Eye size={13} />
                Restaurar {dismissedIds.length}
              </button>
            )}

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <List size={13} /> Lista
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid size={13} /> Grid
              </button>
            </div>

            {/* Scrape button */}
            <div className="flex flex-col items-end">
              <button
                onClick={handleScrape}
                disabled={runScraper.isPending}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 shadow-sm dark:shadow-none"
              >
                <RefreshCw size={15} className={runScraper.isPending ? 'animate-spin' : ''} />
                {runScraper.isPending ? 'Buscando...' : 'Atualizar dados'}
              </button>
              {lastScrapedLabel && !runScraper.isPending && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Atualizado {lastScrapedLabel}</p>
              )}
            </div>
          </div>
        </div>

        {/* Search + Filter bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por título, cidade, endereço..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/60 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 transition-all"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <FilterPanel onFilterChange={(params) => { setFilterParams(params); setPage(1) }} />
        </div>

        {/* Sort + Per-page bar */}
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <ArrowUpDown size={12} />
              <span className="font-medium">Ordenar:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {SORT_OPTIONS.map(option => {
                const Icon = option.icon
                const isActive = activeSort.key === option.key
                return (
                  <button
                    key={option.key}
                    onClick={() => handleSort(option)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-slate-900 dark:bg-slate-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon size={11} />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Por página:</span>
            <div className="flex items-center gap-1">
              {PAGE_SIZE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handlePageSize(opt.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    pageSize === opt.value
                      ? 'bg-slate-900 dark:bg-slate-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dismissed banner */}
        {showDismissed && dismissedIds.length > 0 && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-700 dark:text-amber-400">
            <Eye size={12} />
            <span>Mostrando {dismissedIds.length} imóvel{dismissedIds.length !== 1 ? 'is' : ''} descartado{dismissedIds.length !== 1 ? 's' : ''}</span>
            <button onClick={clearDismissed} className="ml-auto underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300">
              Restaurar todos
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div ref={contentTopRef} className={viewMode === 'list' ? 'px-6 py-4' : 'px-6 py-6'}>

        {/* ── Loading ── */}
        {isLoading && viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-[#15181e] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="p-3.5 space-y-3">
                  <div className="flex gap-2">
                    <div className="h-6 w-14 bg-slate-100 dark:bg-slate-800 rounded-lg" />
                    <div className="h-6 w-12 bg-slate-100 dark:bg-slate-800 rounded-md" />
                  </div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded-full w-4/5" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full w-1/2" />
                  <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-full w-2/3 mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}
        {isLoading && viewMode === 'list' && (
          <div className="space-y-px border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center bg-white dark:bg-[#15181e] h-14 px-4 gap-4 animate-pulse">
                <div className="w-12 h-4 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="w-10 h-5 bg-slate-100 dark:bg-slate-800 rounded-md" />
                <div className="w-20 h-4 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="w-24 h-5 bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Erro ao carregar imóveis</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Verifique a conexão com o servidor e tente novamente.</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!isLoading && !isError && visibleProperties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Home size={28} className="text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhum imóvel encontrado</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
                {searchText || Object.keys(filterParams).length > 0
                  ? 'Tente ajustar os filtros ou a busca.'
                  : 'Clique em "Atualizar dados" para buscar novos imóveis.'}
              </p>
            </div>
            {!searchText && Object.keys(filterParams).length === 0 && (
              <button
                onClick={handleScrape}
                disabled={runScraper.isPending}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 dark:bg-slate-700 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50 transition-all shadow-sm"
              >
                <RefreshCw size={14} className={runScraper.isPending ? 'animate-spin' : ''} />
                {runScraper.isPending ? 'Buscando...' : 'Atualizar dados'}
              </button>
            )}
          </div>
        )}

        {/* ── Grid view ── */}
        {!isLoading && visibleProperties.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleProperties.map(property => (
              <PropertyCard
                key={property.id}
                property={property}
                isFavorite={favoriteIds.has(property.id)}
                onToggleFavorite={() => toggleFav.mutate({ property_id: property.id, isFav: favoriteIds.has(property.id) })}
                onClick={() => navigate(`/properties/${property.id}`)}
              />
            ))}
          </div>
        )}

        {/* ── List view ── */}
        {!isLoading && visibleProperties.length > 0 && viewMode === 'list' && (
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#15181e] shadow-sm dark:shadow-none">
            {/* List header */}
            <div className="flex items-center bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <div className="w-1 self-stretch bg-transparent" />
              <div className="w-14 px-2 py-2.5 text-center">Heat</div>
              <div className="w-16 px-2 py-2.5 text-center border-l border-slate-200 dark:border-slate-700">Desc.</div>
              <div className="w-28 px-2 py-2.5 border-l border-slate-200 dark:border-slate-700">Tipo</div>
              <div className="w-36 px-3 py-2.5 border-l border-slate-200 dark:border-slate-700">Localização</div>
              <div className="flex-1 px-3 py-2.5 border-l border-slate-200 dark:border-slate-700">Imóvel</div>
              <div className="w-32 px-3 py-2.5 border-l border-slate-200 dark:border-slate-700 text-right">Preço</div>
              <div className="w-16 px-2 py-2.5 border-l border-slate-200 dark:border-slate-700 text-center">Prazo</div>
              <div className="w-20 px-2 py-2.5 border-l border-slate-200 dark:border-slate-700 text-center">IA</div>
              <div className="w-24 px-2 py-2.5 border-l border-slate-200 dark:border-slate-700 text-center">Ações</div>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleProperties.map(property => (
                <PropertyRow
                  key={property.id}
                  property={property}
                  isFavorite={favoriteIds.has(property.id)}
                  onToggleFavorite={() => toggleFav.mutate({ property_id: property.id, isFav: favoriteIds.has(property.id) })}
                  onDismiss={() => dismiss(property.id)}
                  onClick={() => navigate(`/properties/${property.id}`)}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                <Eye size={12} />
                {hiddenCount} imóvel{hiddenCount !== 1 ? 'is' : ''} descartado{hiddenCount !== 1 ? 's' : ''} oculto{hiddenCount !== 1 ? 's' : ''} —{' '}
                <button onClick={() => setShowDismissed(true)} className="underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300">mostrar</button>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {data && pageSize < 99999 && data.total > pageSize && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Anterior
            </button>
            <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 num">{page}</span>
              <span className="text-sm text-slate-400 dark:text-slate-500">de</span>
              <span className="text-sm text-slate-500 dark:text-slate-400 num">{totalPages}</span>
            </div>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages}
              className="px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
