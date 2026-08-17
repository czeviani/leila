import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownUp, DatabaseZap, Grid2X2, List, RefreshCw, Search,
  ShieldCheck, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { useDiscardProperty, useFavorites, useProperties, useRestoreDiscardedProperty, useRunScraper, useSources, useToggleFavorite } from '../hooks/useProperties'
import FilterPanel from '../components/filters/FilterPanel'
import PropertyCard from '../components/properties/PropertyCard'
import OpportunityTable from '../components/properties/OpportunityTable'
import TablePreferencesMenu from '../components/properties/TablePreferencesMenu'
import ComparisonTray from '../components/properties/ComparisonTray'
import { Property } from '../lib/api'
import {
  OpportunityTablePreferences, readTablePreferences, writeTablePreferences,
} from '../lib/opportunityTable'

type ViewMode = 'grid' | 'list'

const PAGE_SIZE = 50

const SORT_OPTIONS = [
  { label: 'Melhor oportunidade', value: 'opportunity_score:desc' },
  { label: 'Menor preço por m²', value: 'price_per_m2:asc' },
  { label: 'Maior desconto', value: 'discount_pct:desc' },
  { label: 'Menor lance', value: 'auction_price:asc' },
  { label: 'Maior área', value: 'filter_area_m2:desc' },
  { label: 'Melhor sinal do bairro', value: 'neighborhood_score:desc' },
  { label: 'Mais recentes', value: 'last_seen_at:desc' },
  { label: 'Dados mais completos', value: 'data_quality_score:desc' },
]

const DISCOVERY_PRESETS = [
  { key: 'opportunity', label: 'Melhores oportunidades', sort: 'opportunity_score:desc', params: {} },
  { key: 'sqm', label: 'Menor R$/m²', sort: 'price_per_m2:asc', params: {} },
  { key: 'area', label: 'Maior área', sort: 'filter_area_m2:desc', params: {} },
  { key: 'discount', label: 'Maior desconto', sort: 'discount_pct:desc', params: { discount_min: 20 } },
  { key: 'neighborhood', label: 'Melhor sinal do bairro', sort: 'neighborhood_score:desc', params: {} },
  { key: 'trusted', label: 'Dados mais confiáveis', sort: 'data_quality_score:desc', params: { availability: 'available', quality_min: 80 } },
  { key: 'discarded', label: 'Descartados', sort: 'last_seen_at:desc', params: { discarded: 'true' } },
] as const

const FILTER_LABELS: Record<string, string> = {
  state: 'Estado', city: 'Cidade', type: 'Tipo', source: 'Fonte', price_min: 'Preço mín.',
  price_max: 'Preço máx.', discount_min: 'Desconto', modality: 'Modalidade',
  area_min: 'Área mín.', area_max: 'Área máx.', area_classification: 'Classificação',
  days_until_auction_max: 'Prazo', has_evaluation: 'Com avaliação', availability: 'Disponibilidade',
  verified_within_hours: 'Verificação', quality_min: 'Qualidade', occupied: 'Ocupação',
  neighborhood: 'Bairro', price_per_m2_min: 'R$/m² mín.', price_per_m2_max: 'R$/m² máx.',
  opportunity_score_min: 'Oportunidade mín.', neighborhood_score_min: 'Sinal do bairro mín.',
  discarded: 'Descartados',
}

function relativeTime(date: string | null | undefined) {
  if (!date) return 'sem coleta confirmada'
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000))
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  return `há ${Math.floor(hours / 24)}d`
}

function filterValue(key: string, value: string | number) {
  if (key === 'occupied') return value === 'false' ? 'desocupado' : value === 'true' ? 'ocupado' : 'não informado'
  if (key === 'availability') return value === 'available' ? 'disponível' : String(value)
  if (key === 'has_evaluation') return 'sim'
  if (key === 'price_per_m2_min' || key === 'price_per_m2_max') return `R$ ${Number(value).toLocaleString('pt-BR')}/m²`
  if (key === 'price_min' || key === 'price_max') return `R$ ${Number(value).toLocaleString('pt-BR')}`
  if (key === 'area_min' || key === 'area_max') return `${value} m²`
  if (key === 'discount_min') return `${value}%+`
  return String(value).replace(/,/g, ', ')
}

export default function PropertiesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string | number | undefined>>({})
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return (localStorage.getItem('leila_desktop_view_v2') as ViewMode) || 'list' } catch { return 'list' }
  })
  const [sort, setSort] = useState('opportunity_score:desc')
  const [tablePreferences, setTablePreferences] = useState<OpportunityTablePreferences>(readTablePreferences)
  const [selected, setSelected] = useState<Property[]>([])
  const [optimisticallyDismissed, setOptimisticallyDismissed] = useState<string[]>([])
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
    page, limit: PAGE_SIZE, sort_by: sortBy, sort_order: sortOrder,
  }
  const { data, isLoading, isError, refetch } = useProperties(params)
  const { data: favorites } = useFavorites()
  const { data: sources } = useSources()
  const toggleFavorite = useToggleFavorite()
  const discardProperty = useDiscardProperty()
  const restoreDiscardedProperty = useRestoreDiscardedProperty()
  const runScraper = useRunScraper()

  const favoriteIds = useMemo(() => new Set(favorites?.map(favorite => favorite.property_id) ?? []), [favorites])
  const dismissedIds = useMemo(() => new Set(optimisticallyDismissed), [optimisticallyDismissed])
  const selectedIds = useMemo(() => new Set(selected.map(property => property.id)), [selected])
  const isDiscardedView = filters.discarded === 'true'
  const properties = (data?.data ?? []).filter(property => isDiscardedView || !dismissedIds.has(property.id))
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const activeSources = sources?.filter(source => source.active && source.implemented !== false) ?? []
  const coverageTimestamp = activeSources.map(source => source.last_scraped_at).filter(Boolean).sort().at(0)
  const availableOnPage = properties.filter(property => (property.availability_status ?? 'available') === 'available').length
  const activeFilterEntries = Object.entries(filters).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '')
  const scrapeFeedback = runScraper.isError
    ? 'Não foi possível solicitar a coleta. Tente novamente.'
    : runScraper.isSuccess
      ? ((runScraper.data as { queued?: boolean } | undefined)?.queued ? 'Coleta agendada. Os dados serão atualizados em alguns minutos.' : 'Coleta concluída e resultados atualizados.')
      : null

  const setMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem('leila_desktop_view_v2', mode) } catch {}
  }

  const changePreferences = (preferences: OpportunityTablePreferences) => {
    setTablePreferences(preferences)
    writeTablePreferences(preferences)
  }

  const applyPreset = (preset: typeof DISCOVERY_PRESETS[number]) => {
    setActivePreset(preset.key)
    setFilters(current => {
      if (preset.key === 'discarded') return { discarded: 'true' }
      const next: Record<string, string | number | undefined> = { ...current, ...preset.params }
      delete next.discarded
      return next
    })
    setSort(preset.sort)
    setPage(1)
  }

  const dismiss = (property: Property) => {
    setOptimisticallyDismissed(current => [...new Set([...current, property.id])])
    setSelected(current => current.filter(item => item.id !== property.id))
    const isDiscarded = Boolean(property.leila_discarded_properties?.length)
    const clearOptimistic = () => setOptimisticallyDismissed(current => current.filter(id => id !== property.id))
    const settle = async () => { await refetch(); clearOptimistic() }
    if (isDiscarded) restoreDiscardedProperty.mutate(property.id, { onError: clearOptimistic, onSuccess: settle })
    else discardProperty.mutate({ propertyId: property.id }, { onError: clearOptimistic, onSuccess: settle })
  }

  const toggleSelection = (property: Property) => {
    setSelected(current => current.some(item => item.id === property.id)
      ? current.filter(item => item.id !== property.id)
      : current.length < 4 ? [...current, property] : current)
  }

  const toggleFavoriteFor = (property: Property) => toggleFavorite.mutate({
    property_id: property.id,
    isFav: favoriteIds.has(property.id),
  })

  const updateSort = (next: string) => { setSort(next); setActivePreset(null); setPage(1) }

  return (
    <div className="min-h-full bg-[#f3f7f7] text-[#163447]">
      <header className="border-b border-[#dce7e7] bg-white">
        <div className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[#176B87]"><ShieldCheck size={15} /> Mesa de oportunidades</div>
              <h1 className="font-display text-3xl font-extrabold tracking-[-.035em] text-[#163447] sm:text-4xl">Compare antes de abrir.</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">Bairro, preço por metro quadrado, desconto e risco organizados para formar uma shortlist com evidência.</p>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#dce7e7] bg-[#dce7e7] sm:grid-cols-3">
              <div className="bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Fontes ativas</p><p className="num mt-1 text-lg font-semibold">{activeSources.length}</p></div>
              <div className="bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Última cobertura</p><p className="num mt-1 text-lg font-semibold">{relativeTime(coverageTimestamp)}</p></div>
              <div className="col-span-2 bg-white px-4 py-3 sm:col-span-1"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Nesta página</p><p className="num mt-1 text-lg font-semibold text-[#167261]">{availableOnPage} disponíveis</p></div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1"><span className="sr-only">Buscar imóveis</span><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Título, bairro, cidade ou endereço" className="h-12 w-full rounded-xl border border-[#cddcdd] bg-[#f8fbfb] pl-11 pr-11 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#176B87] focus:bg-white focus:ring-4 focus:ring-[#176B87]/10" />{search && <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-3 top-1/2 min-h-9 min-w-9 -translate-y-1/2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={16} className="mx-auto" /></button>}</label>
            <FilterPanel onFilterChange={next => { setFilters(next); setActivePreset(null); setPage(1) }} />
            <button type="button" onClick={() => runScraper.mutate(undefined)} disabled={runScraper.isPending} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#163447] px-5 text-sm font-bold text-white transition hover:bg-[#0f293a] disabled:opacity-60"><RefreshCw size={16} className={runScraper.isPending ? 'animate-spin' : ''} />{runScraper.isPending ? 'Solicitando coleta' : 'Atualizar fontes'}</button>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Atalhos de descoberta">
            {DISCOVERY_PRESETS.map(preset => <button type="button" key={preset.key} onClick={() => applyPreset(preset)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition ${activePreset === preset.key ? 'border-[#176B87] bg-[#176B87] text-white' : 'border-[#cad9da] bg-white text-slate-600 hover:border-[#176B87] hover:text-[#176B87]'}`}><Sparkles size={11} className="mr-1 inline" />{preset.label}</button>)}
          </div>

          {(debouncedSearch || activeFilterEntries.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Em uso</span>
              {debouncedSearch && <button type="button" onClick={() => setSearch('')} className="inline-flex items-center gap-1 rounded-full bg-[#e7f1f2] px-2.5 py-1 text-[11px] font-semibold text-[#176B87]">Busca: {debouncedSearch}<X size={10} /></button>}
              {activeFilterEntries.map(([key, value]) => <button type="button" key={key} onClick={() => { setFilters(current => { const next = { ...current }; delete next[key]; return next }); setActivePreset(null); setPage(1) }} className="inline-flex items-center gap-1 rounded-full border border-[#c8dada] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{FILTER_LABELS[key] ?? key}: {filterValue(key, value)}<X size={10} /></button>)}
              <button type="button" onClick={() => { setFilters({}); setSearch(''); setActivePreset(null); setPage(1) }} className="px-2 py-1 text-[11px] font-bold text-[#B33A48]">Limpar todos</button>
            </div>
          )}
          {scrapeFeedback && <p role="status" aria-live="polite" className={`mt-3 text-xs font-semibold ${runScraper.isError ? 'text-[#B33A48]' : 'text-[#167261]'}`}>{scrapeFeedback}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-lg font-bold">{isLoading ? 'Consultando a base…' : `${(data?.total ?? 0).toLocaleString('pt-BR')} imóveis encontrados`}</p><p className="text-xs text-slate-500">Clique no cabeçalho da tabela para reordenar. Selecione de 2 a 4 imóveis para comparar.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative flex items-center"><ArrowDownUp size={14} className="pointer-events-none absolute left-3 text-slate-400" /><span className="sr-only">Ordenar por</span><select value={sort} onChange={event => updateSort(event.target.value)} className="h-10 appearance-none rounded-lg border border-[#cddcdd] bg-white pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#176B87]">{SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <TablePreferencesMenu preferences={tablePreferences} onChange={changePreferences} />
            <div className="hidden rounded-lg border border-[#cddcdd] bg-white p-1 xl:flex" aria-label="Modo de visualização"><button type="button" onClick={() => setMode('list')} aria-label="Ver mesa" title="Mesa" className={`rounded-md p-2 ${viewMode === 'list' ? 'bg-[#eaf2f3] text-[#176B87]' : 'text-slate-400'}`}><List size={15} /></button><button type="button" onClick={() => setMode('grid')} aria-label="Ver cartões" title="Cartões" className={`rounded-md p-2 ${viewMode === 'grid' ? 'bg-[#eaf2f3] text-[#176B87]' : 'text-slate-400'}`}><Grid2X2 size={15} /></button></div>
          </div>
        </div>

        {isLoading && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando imóveis">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-64 animate-pulse rounded-2xl border border-[#dce7e7] bg-white" />)}</div>}
        {isError && <div className="rounded-2xl border border-red-200 bg-white p-10 text-center"><DatabaseZap size={28} className="mx-auto mb-3 text-[#B33A48]" /><h2 className="font-bold">Não foi possível consultar a base.</h2><p className="mt-1 text-sm text-slate-500">A busca não alterou seus filtros.</p><button type="button" onClick={() => refetch()} className="mt-4 rounded-lg bg-[#163447] px-4 py-2 text-sm font-semibold text-white">Tentar novamente</button></div>}
        {!isLoading && !isError && properties.length === 0 && <div className="rounded-2xl border border-dashed border-[#b9cbcd] bg-white px-6 py-16 text-center"><SlidersHorizontal size={28} className="mx-auto mb-3 text-[#176B87]" /><h2 className="font-bold">Nenhum imóvel atende a esta combinação.</h2><p className="mt-1 text-sm text-slate-500">Remova um filtro ou amplie a região pesquisada.</p><button type="button" onClick={() => { setFilters({}); setActivePreset(null); setSearch('') }} className="mt-4 text-sm font-bold text-[#176B87]">Limpar busca</button></div>}

        {!isLoading && properties.length > 0 && (
          <>
            <div className={`${viewMode === 'grid' ? 'xl:grid' : 'xl:hidden'} grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4`}>
              {properties.map(property => <PropertyCard key={property.id} property={property} isFavorite={favoriteIds.has(property.id)} onToggleFavorite={() => toggleFavoriteFor(property)} onClick={() => navigate(`/properties/${property.id}`)} />)}
            </div>
            {viewMode === 'list' && <OpportunityTable properties={properties} columns={tablePreferences.columns} density={tablePreferences.density} sort={sort} selectedIds={selectedIds} favoriteIds={favoriteIds} onSort={updateSort} onToggleSelection={toggleSelection} onToggleFavorite={toggleFavoriteFor} onDismiss={dismiss} onOpen={property => navigate(`/properties/${property.id}`)} />}
          </>
        )}

        {data && data.total > PAGE_SIZE && <nav className="mt-7 flex items-center justify-center gap-3" aria-label="Paginação"><button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="min-h-11 rounded-xl border border-[#cad9da] bg-white px-4 text-sm font-semibold disabled:opacity-40">Anterior</button><span className="num text-sm text-slate-600">{page} / {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="min-h-11 rounded-xl border border-[#cad9da] bg-white px-4 text-sm font-semibold disabled:opacity-40">Próxima</button></nav>}
      </main>

      <ComparisonTray properties={selected} favoriteIds={favoriteIds} onRemove={id => setSelected(current => current.filter(property => property.id !== id))} onClear={() => setSelected([])} onOpenProperty={id => navigate(`/properties/${id}`)} onToggleFavorite={toggleFavoriteFor} />
    </div>
  )
}
