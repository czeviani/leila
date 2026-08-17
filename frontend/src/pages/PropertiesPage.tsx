import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownUp, DatabaseZap, Grid2X2, List,
  RefreshCw, Search, ShieldCheck, SlidersHorizontal, X,
} from 'lucide-react'
import { useFavorites, useProperties, useRunScraper, useSources, useToggleFavorite } from '../hooks/useProperties'
import FilterPanel from '../components/filters/FilterPanel'
import PropertyCard from '../components/properties/PropertyCard'
import PropertyRow from '../components/properties/PropertyRow'

type ViewMode = 'grid' | 'list'

const SORT_OPTIONS = [
  { label: 'Mais recentes', value: 'last_seen_at:desc' },
  { label: 'Dados mais completos', value: 'data_quality_score:desc' },
  { label: 'Maior desconto', value: 'discount_pct:desc' },
  { label: 'Menor lance', value: 'auction_price:asc' },
]

const QUICK_FILTERS = [
  { key: 'fresh', label: 'Verificados em 48h', params: { availability: 'available', verified_within_hours: 48 } },
  { key: 'complete', label: 'Dados completos', params: { quality_min: 75 } },
  { key: 'direct', label: 'Compra direta', params: { modality: 'compra_direta' } },
  { key: 'vacant', label: 'Desocupados', params: { occupied: 'false' } },
] as const

function relativeTime(date: string | null | undefined) {
  if (!date) return 'sem coleta confirmada'
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000))
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string | number | undefined>>({})
  const [quickFilter, setQuickFilter] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('leila_view_mode') as ViewMode) || 'grid' } catch { return 'grid' }
  })
  const [sort, setSort] = useState('last_seen_at:desc')
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('leila_dismissed') || '[]') } catch { return [] }
  })
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(timer.current)
  }, [search])

  const [sortBy, sortOrder] = sort.split(':')
  const params = {
    ...filters,
    ...(debouncedSearch.length >= 2 ? { search: debouncedSearch } : {}),
    page, limit: 24, sort_by: sortBy, sort_order: sortOrder,
  }
  const { data, isLoading, isError, refetch } = useProperties(params)
  const { data: favorites } = useFavorites()
  const { data: sources } = useSources()
  const toggleFavorite = useToggleFavorite()
  const runScraper = useRunScraper()

  const favoriteIds = useMemo(() => new Set(favorites?.map(f => f.property_id) ?? []), [favorites])
  const dismissedIds = useMemo(() => new Set(dismissed), [dismissed])
  const properties = (data?.data ?? []).filter(property => !dismissedIds.has(property.id))
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 24))
  const activeSources = sources?.filter(source => source.active && source.implemented !== false) ?? []
  const coverageTimestamp = activeSources.map(source => source.last_scraped_at).filter(Boolean).sort().at(0)
  const availableOnPage = properties.filter(p => (p.availability_status ?? 'available') === 'available').length
  const scrapeFeedback = runScraper.isError
    ? 'Não foi possível solicitar a coleta. Tente novamente.'
    : runScraper.isSuccess
      ? ((runScraper.data as { queued?: boolean } | undefined)?.queued ? 'Coleta agendada. Os dados serão atualizados em alguns minutos.' : 'Coleta concluída e resultados atualizados.')
      : null

  const applyQuickFilter = (key: string, next: Record<string, string | number>) => {
    if (quickFilter === key) {
      setFilters({})
      setQuickFilter(null)
    } else {
      setFilters(next)
      setQuickFilter(key)
    }
    setPage(1)
  }

  const setMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem('leila_view_mode', mode) } catch {}
  }

  const dismiss = (id: string) => {
    const next = [...dismissed, id]
    setDismissed(next)
    try { localStorage.setItem('leila_dismissed', JSON.stringify(next)) } catch {}
  }

  return (
    <div className="min-h-full bg-[#f3f7f7] text-[#163447]">
      <header className="border-b border-[#dce7e7] bg-white">
        <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#176B87]">
                <ShieldCheck size={15} /> Radar de oportunidades
              </div>
              <h1 className="font-display text-3xl font-extrabold tracking-[-.035em] text-[#163447] sm:text-4xl">Decida com a origem à vista.</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">Cada imóvel mostra quando foi observado, a qualidade do cadastro e o que ainda precisa ser confirmado.</p>
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#dce7e7] bg-[#dce7e7] sm:grid-cols-3">
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cobertura real</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[#163447]">{activeSources.length} fonte{activeSources.length === 1 ? '' : 's'}</p>
              </div>
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cobertura atualizada</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[#163447]">{relativeTime(coverageTimestamp)}</p>
              </div>
              <div className="col-span-2 bg-white px-4 py-3 sm:col-span-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nesta página</p>
                <p className="mt-1 font-mono text-lg font-semibold text-[#167261]">{availableOnPage} disponíveis</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Buscar imóveis</span>
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Título, cidade ou endereço"
                className="h-12 w-full rounded-xl border border-[#cddcdd] bg-[#f8fbfb] pl-11 pr-11 text-sm text-[#163447] outline-none transition placeholder:text-slate-400 focus:border-[#176B87] focus:bg-white focus:ring-4 focus:ring-[#176B87]/10"
              />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-3 top-1/2 min-h-9 min-w-9 -translate-y-1/2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} className="mx-auto" /></button>}
            </label>
            <FilterPanel onFilterChange={next => { setFilters(next); setQuickFilter(null); setPage(1) }} />
            <button
              type="button"
              onClick={() => runScraper.mutate(undefined)}
              disabled={runScraper.isPending}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#163447] px-5 text-sm font-bold text-white transition hover:bg-[#0f293a] disabled:opacity-60"
            >
              <RefreshCw size={16} className={runScraper.isPending ? 'animate-spin' : ''} />
              {runScraper.isPending ? 'Solicitando coleta' : 'Atualizar fontes'}
            </button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filtros rápidos">
            {QUICK_FILTERS.map(item => (
              <button
                type="button"
                key={item.key}
                onClick={() => applyQuickFilter(item.key, item.params)}
                className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition ${quickFilter === item.key ? 'border-[#176B87] bg-[#176B87] text-white' : 'border-[#cad9da] bg-white text-slate-600 hover:border-[#176B87] hover:text-[#176B87]'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {scrapeFeedback && (
            <p role="status" aria-live="polite" className={`mt-3 text-xs font-semibold ${runScraper.isError ? 'text-red-700' : 'text-[#167261]'}`}>
              {scrapeFeedback}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold text-[#163447]">{isLoading ? 'Consultando a base…' : `${(data?.total ?? 0).toLocaleString('pt-BR')} imóveis encontrados`}</p>
            <p className="text-xs text-slate-500">Anúncios removidos da fonte ficam fora da busca padrão.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative flex items-center">
              <ArrowDownUp size={14} className="pointer-events-none absolute left-3 text-slate-400" />
              <span className="sr-only">Ordenar por</span>
              <select value={sort} onChange={event => { setSort(event.target.value); setPage(1) }} className="h-10 appearance-none rounded-lg border border-[#cddcdd] bg-white pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#176B87]">
                {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="hidden rounded-lg border border-[#cddcdd] bg-white p-1 xl:flex" aria-label="Modo de visualização">
              <button type="button" onClick={() => setMode('grid')} aria-label="Ver cartões" className={`rounded-md p-2 ${viewMode === 'grid' ? 'bg-[#eaf2f3] text-[#176B87]' : 'text-slate-400'}`}><Grid2X2 size={15} /></button>
              <button type="button" onClick={() => setMode('list')} aria-label="Ver lista" className={`rounded-md p-2 ${viewMode === 'list' ? 'bg-[#eaf2f3] text-[#176B87]' : 'text-slate-400'}`}><List size={15} /></button>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Carregando imóveis">
            {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-80 animate-pulse rounded-[18px] border border-[#dce7e7] bg-white" />)}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-200 bg-white p-10 text-center">
            <DatabaseZap size={28} className="mx-auto mb-3 text-[#B33A48]" />
            <h2 className="font-bold">Não foi possível consultar a base.</h2>
            <p className="mt-1 text-sm text-slate-500">A busca não alterou seus filtros.</p>
            <button type="button" onClick={() => refetch()} className="mt-4 rounded-lg bg-[#163447] px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button>
          </div>
        )}

        {!isLoading && !isError && properties.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#b9cbcd] bg-white px-6 py-16 text-center">
            <SlidersHorizontal size={28} className="mx-auto mb-3 text-[#176B87]" />
            <h2 className="font-bold">Nenhum imóvel atende a esta combinação.</h2>
            <p className="mt-1 text-sm text-slate-500">Remova um filtro ou amplie a região pesquisada.</p>
            <button type="button" onClick={() => { setFilters({}); setQuickFilter(null); setSearch('') }} className="mt-4 text-sm font-bold text-[#176B87]">Limpar busca</button>
          </div>
        )}

        {!isLoading && properties.length > 0 && (viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {properties.map(property => <PropertyCard key={property.id} property={property} isFavorite={favoriteIds.has(property.id)} onToggleFavorite={() => toggleFavorite.mutate({ property_id: property.id, isFav: favoriteIds.has(property.id) })} onClick={() => navigate(`/properties/${property.id}`)} />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:hidden">
              {properties.map(property => <PropertyCard key={property.id} property={property} isFavorite={favoriteIds.has(property.id)} onToggleFavorite={() => toggleFavorite.mutate({ property_id: property.id, isFav: favoriteIds.has(property.id) })} onClick={() => navigate(`/properties/${property.id}`)} />)}
            </div>
            <div className="hidden overflow-x-auto rounded-xl border border-[#d5e1e2] bg-white xl:block">
              <div className="min-w-[1050px] divide-y divide-[#e4ecec]">
                {properties.map(property => <PropertyRow key={property.id} property={property} isFavorite={favoriteIds.has(property.id)} onToggleFavorite={() => toggleFavorite.mutate({ property_id: property.id, isFav: favoriteIds.has(property.id) })} onDismiss={() => dismiss(property.id)} onClick={() => navigate(`/properties/${property.id}`)} />)}
              </div>
            </div>
          </>
        ))}

        {data && data.total > 24 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Paginação">
            <button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="min-h-11 rounded-xl border border-[#cad9da] bg-white px-4 text-sm font-semibold disabled:opacity-40">Anterior</button>
            <span className="font-mono text-sm text-slate-600">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-xl border border-[#cad9da] bg-white px-4 text-sm font-semibold disabled:opacity-40">Próxima</button>
          </nav>
        )}
      </main>
    </div>
  )
}
