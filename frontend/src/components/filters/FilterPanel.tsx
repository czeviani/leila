import { useState, useEffect, useRef } from 'react'
import { SlidersHorizontal, X, Search, MapPin, ShoppingCart, Gavel, Users, Mail, Tag, Sparkles, Clock, ShieldCheck, CircleDot } from 'lucide-react'
import { PropertyFilters } from '../../lib/api'
import { useSaveFilters, useCities, useNeighborhoods, useSources } from '../../hooks/useProperties'

const PROPERTY_TYPES = ['apartamento', 'casa', 'terreno', 'loja', 'galpão', 'sala', 'sobrado']
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

// Regiões como atalhos
const REGIONS: Record<string, { label: string; states: string[] }> = {
  sudeste:      { label: 'Sudeste',      states: ['SP', 'RJ', 'MG', 'ES'] },
  sul:          { label: 'Sul',          states: ['PR', 'SC', 'RS'] },
  centroOeste:  { label: 'Centro-Oeste', states: ['GO', 'MT', 'MS', 'DF'] },
  nordeste:     { label: 'Nordeste',     states: ['BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE', 'AL'] },
  norte:        { label: 'Norte',        states: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'] },
}

export const MODALITY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  compra_direta:    { label: 'Compra Direta',  icon: ShoppingCart, color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  segunda_praca:    { label: '2ª Praça',        icon: Tag,          color: 'text-sky-700',     bg: 'bg-sky-50',     border: 'border-sky-200'     },
  leilao_online:    { label: 'Leilão Online',   icon: Gavel,        color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  primeira_praca:   { label: '1ª Praça',        icon: Users,        color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  proposta_fechada: { label: 'Proposta',        icon: Mail,         color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200'  },
}

const URGENCY_OPTIONS = [
  { label: '7 dias',  value: 7  },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
]

const AREA_CLASSIFICATIONS = [
  { value: 'nobre', label: 'Nobre' },
  { value: 'intermediário', label: 'Intermediária' },
  { value: 'popular', label: 'Popular' },
  { value: 'comunidade', label: 'Comunidade' },
  { value: 'indefinido', label: 'Não classificada' },
]

interface Props {
  activeParams: Record<string, string | number | undefined>
  onFilterChange: (params: Record<string, string | number | undefined>) => void
}

function filtersToParams(filters: PropertyFilters): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {}
  if (filters.price_min != null) params.price_min = filters.price_min
  if (filters.price_max != null) params.price_max = filters.price_max
  if (filters.states?.length) params.state = filters.states.join(',')
  if (filters.cities?.length) params.city = filters.cities.join(',')
  if (filters.property_types?.length) params.type = filters.property_types.join(',')
  if (filters.discount_min != null) params.discount_min = filters.discount_min
  if (filters.modality_categories?.length) params.modality = filters.modality_categories.join(',')
  if (filters.area_classifications?.length) params.area_classification = filters.area_classifications.join(',')
  if (filters.days_until_auction_max) params.days_until_auction_max = filters.days_until_auction_max
  if (filters.has_evaluation) params.has_evaluation = 'true'
  if (filters.area_min != null) params.area_min = filters.area_min
  if (filters.area_max != null) params.area_max = filters.area_max
  if (filters.source_ids?.length) params.source = filters.source_ids.join(',')
  if (filters.neighborhoods?.length) params.neighborhood = filters.neighborhoods.join(',')
  if (filters.price_per_m2_min != null) params.price_per_m2_min = filters.price_per_m2_min
  if (filters.price_per_m2_max != null) params.price_per_m2_max = filters.price_per_m2_max
  if (filters.opportunity_score_min != null) params.opportunity_score_min = filters.opportunity_score_min
  if (filters.neighborhood_score_min != null) params.neighborhood_score_min = filters.neighborhood_score_min
  return params
}

const splitParam = (value: string | number | undefined) => value == null || value === ''
  ? []
  : String(value).split(',').map(item => item.trim()).filter(Boolean)

export default function FilterPanel({ activeParams, onFilterChange }: Props) {
  const saveFilters = useSaveFilters()
  const panelRef = useRef<HTMLDivElement>(null)
  const cityInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const [open, setOpen] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [discountMin, setDiscountMin] = useState('')
  const [selectedModalities, setSelectedModalities] = useState<string[]>([])
  const [selectedAreaClassifications, setSelectedAreaClassifications] = useState<string[]>([])
  const [areaMin, setAreaMin] = useState('')
  const [areaMax, setAreaMax] = useState('')
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<string[]>([])
  const [pricePerM2Min, setPricePerM2Min] = useState('')
  const [pricePerM2Max, setPricePerM2Max] = useState('')
  const [opportunityScoreMin, setOpportunityScoreMin] = useState('')
  const [neighborhoodScoreMin, setNeighborhoodScoreMin] = useState('')
  const [daysUntilAuction, setDaysUntilAuction] = useState<number | null>(null)
  const [hasEvaluation, setHasEvaluation] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [qualityOnly, setQualityOnly] = useState(false)
  const [occupancy, setOccupancy] = useState<'' | 'true' | 'false' | 'unknown'>('')

  const [citySearch, setCitySearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('')
  const [showNeighborhoodSuggestions, setShowNeighborhoodSuggestions] = useState(false)
  const { data: citySuggestions = [], isFetching: citiesLoading } = useCities(citySearch, selectedStates)
  const { data: neighborhoodSuggestions = [], isFetching: neighborhoodsLoading } = useNeighborhoods(
    neighborhoodSearch,
    selectedStates.length === 1 ? selectedStates[0] : undefined,
    selectedCities.length === 1 ? selectedCities[0] : undefined,
  )
  const { data: sources = [] } = useSources()

  useEffect(() => {
    setPriceMin(activeParams.price_min == null ? '' : String(activeParams.price_min))
    setPriceMax(activeParams.price_max == null ? '' : String(activeParams.price_max))
    setSelectedStates(splitParam(activeParams.state))
    setSelectedCities(splitParam(activeParams.city))
    setSelectedTypes(splitParam(activeParams.type))
    setDiscountMin(activeParams.discount_min == null ? '' : String(activeParams.discount_min))
    setSelectedModalities(splitParam(activeParams.modality))
    setSelectedAreaClassifications(splitParam(activeParams.area_classification))
    setDaysUntilAuction(activeParams.days_until_auction_max == null ? null : Number(activeParams.days_until_auction_max))
    setHasEvaluation(activeParams.has_evaluation === 'true')
    setAreaMin(activeParams.area_min == null ? '' : String(activeParams.area_min))
    setAreaMax(activeParams.area_max == null ? '' : String(activeParams.area_max))
    setSelectedSources(splitParam(activeParams.source))
    setSelectedNeighborhoods(splitParam(activeParams.neighborhood))
    setPricePerM2Min(activeParams.price_per_m2_min == null ? '' : String(activeParams.price_per_m2_min))
    setPricePerM2Max(activeParams.price_per_m2_max == null ? '' : String(activeParams.price_per_m2_max))
    setOpportunityScoreMin(activeParams.opportunity_score_min == null ? '' : String(activeParams.opportunity_score_min))
    setNeighborhoodScoreMin(activeParams.neighborhood_score_min == null ? '' : String(activeParams.neighborhood_score_min))
    setVerifiedOnly(activeParams.verified_within_hours != null)
    setQualityOnly(Number(activeParams.quality_min ?? 0) >= 70)
    setOccupancy(activeParams.occupied === 'true' || activeParams.occupied === 'false' || activeParams.occupied === 'unknown' ? activeParams.occupied : '')
  }, [activeParams])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0)
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [open])

  const addCity = (city: string) => {
    if (!selectedCities.includes(city)) setSelectedCities(prev => [...prev, city])
    setCitySearch('')
    setShowSuggestions(false)
    setSelectedNeighborhoods([])
    setNeighborhoodSearch('')
    cityInputRef.current?.focus()
  }
  const removeCity = (city: string) => {
    setSelectedCities(prev => prev.filter(c => c !== city))
    setSelectedNeighborhoods([])
    setNeighborhoodSearch('')
  }
  const toggleState = (uf: string) => {
    setSelectedStates(prev => prev.includes(uf) ? prev.filter(s => s !== uf) : [...prev, uf])
    setSelectedCities([])
    setCitySearch('')
    setSelectedNeighborhoods([])
    setNeighborhoodSearch('')
  }
  const toggleType = (t: string) => setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleModality = (m: string) => setSelectedModalities(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])
  const toggleAreaClassification = (value: string) => setSelectedAreaClassifications(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value])
  const toggleSource = (value: string) => setSelectedSources(prev => prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value])
  const addNeighborhood = (value: string) => {
    if (!selectedNeighborhoods.includes(value)) setSelectedNeighborhoods(prev => [...prev, value])
    setNeighborhoodSearch('')
    setShowNeighborhoodSuggestions(false)
  }
  const removeNeighborhood = (value: string) => setSelectedNeighborhoods(prev => prev.filter(item => item !== value))

  const applyRegion = (regionKey: string) => {
    const region = REGIONS[regionKey]
    if (!region) return
    const allSelected = region.states.every(s => selectedStates.includes(s))
    if (allSelected) {
      setSelectedStates(prev => prev.filter(s => !region.states.includes(s)))
    } else {
      setSelectedStates(prev => [...new Set([...prev, ...region.states])])
    }
    setSelectedCities([])
    setCitySearch('')
    setSelectedNeighborhoods([])
    setNeighborhoodSearch('')
  }

  const isRegionActive = (regionKey: string) => {
    const region = REGIONS[regionKey]
    return region.states.every(s => selectedStates.includes(s))
  }

  const apply = () => {
    const filters: PropertyFilters = {
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      states: selectedStates,
      cities: selectedCities,
      property_types: selectedTypes,
      discount_min: discountMin ? Number(discountMin) : null,
      modality_categories: selectedModalities,
      area_classifications: selectedAreaClassifications,
      days_until_auction_max: daysUntilAuction,
      has_evaluation: hasEvaluation,
      area_min: areaMin ? Number(areaMin) : null,
      area_max: areaMax ? Number(areaMax) : null,
      source_ids: selectedSources,
      neighborhoods: selectedNeighborhoods,
      price_per_m2_min: pricePerM2Min ? Number(pricePerM2Min) : null,
      price_per_m2_max: pricePerM2Max ? Number(pricePerM2Max) : null,
      opportunity_score_min: opportunityScoreMin ? Number(opportunityScoreMin) : null,
      neighborhood_score_min: neighborhoodScoreMin ? Number(neighborhoodScoreMin) : null,
    }
    saveFilters.mutate(filters)
    onFilterChange({
      ...filtersToParams(filters),
      ...(verifiedOnly ? { availability: 'available', verified_within_hours: 168 } : {}),
      ...(qualityOnly ? { quality_min: 70 } : {}),
      ...(occupancy ? { occupied: occupancy } : {}),
    })
    setOpen(false)
  }

  const reset = () => {
    setPriceMin(''); setPriceMax(''); setSelectedStates([])
    setSelectedCities([]); setSelectedTypes([]); setDiscountMin('')
    setCitySearch(''); setSelectedModalities([])
    setSelectedAreaClassifications([]); setDaysUntilAuction(null); setHasEvaluation(false)
    setAreaMin(''); setAreaMax(''); setSelectedSources([])
    setSelectedNeighborhoods([]); setNeighborhoodSearch('')
    setPricePerM2Min(''); setPricePerM2Max('')
    setOpportunityScoreMin(''); setNeighborhoodScoreMin('')
    setVerifiedOnly(false); setQualityOnly(false); setOccupancy('')
    const empty: PropertyFilters = {
      price_min: null, price_max: null, states: [], cities: [], property_types: [],
      discount_min: null, modality_categories: [], area_classifications: [],
      days_until_auction_max: null, has_evaluation: false,
      area_min: null, area_max: null, source_ids: [],
      neighborhoods: [], price_per_m2_min: null, price_per_m2_max: null,
      opportunity_score_min: null, neighborhood_score_min: null,
    }
    saveFilters.mutate(empty)
    onFilterChange({})
    setOpen(false)
  }

  const activeCount =
    selectedStates.length + selectedCities.length + selectedTypes.length +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (discountMin ? 1 : 0) +
    selectedModalities.length +
    selectedAreaClassifications.length + selectedSources.length +
    selectedNeighborhoods.length +
    (areaMin ? 1 : 0) + (areaMax ? 1 : 0) +
    (pricePerM2Min ? 1 : 0) + (pricePerM2Max ? 1 : 0) +
    (opportunityScoreMin ? 1 : 0) + (neighborhoodScoreMin ? 1 : 0) +
    (daysUntilAuction ? 1 : 0) + (hasEvaluation ? 1 : 0) +
    (verifiedOnly ? 1 : 0) + (qualityOnly ? 1 : 0) + (occupancy ? 1 : 0)

  const filteredSuggestions = citySuggestions.filter(city => !selectedCities.includes(city.name))

  return (
    <div className="relative" ref={panelRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="property-filter-panel"
        className={`flex h-12 items-center justify-center gap-2 px-4 border rounded-xl text-sm font-bold transition-all duration-150 ${
          activeCount > 0
            ? 'border-[#176B87] bg-[#176B87] text-white'
            : 'border-[#cddcdd] bg-white text-[#163447] hover:border-[#176B87]'
        }`}
      >
        <SlidersHorizontal size={15} />
        Filtros
        {activeCount > 0 && (
          <span className="bg-white text-[#176B87] text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="property-filter-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros de imóveis"
          className="fixed inset-3 z-50 space-y-5 overflow-y-auto rounded-2xl border border-[#cddcdd] bg-white p-5 shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-14 sm:max-h-[calc(100vh-110px)] sm:w-[390px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-[#163447]">Refinar oportunidades</p>
              <p className="text-xs text-slate-500">Comece pela confiabilidade, depois pelo retorno.</p>
            </div>
            <button ref={closeRef} aria-label="Fechar filtros" onClick={() => { setOpen(false); triggerRef.current?.focus() }} className="min-h-11 min-w-11 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <X size={15} />
            </button>
          </div>

          <section className="rounded-xl border border-[#cfe0e1] bg-[#f3f8f8] p-3.5">
            <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#176B87]"><ShieldCheck size={14} />Confiabilidade</p>
            <div className="space-y-2">
              <button type="button" onClick={() => setVerifiedOnly(!verifiedOnly)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm font-semibold transition ${verifiedOnly ? 'border-[#167261] bg-white text-[#126252]' : 'border-transparent text-slate-600 hover:bg-white'}`}>
                <CircleDot size={14} /> Observado na fonte nos últimos 7 dias
              </button>
              <button type="button" onClick={() => setQualityOnly(!qualityOnly)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm font-semibold transition ${qualityOnly ? 'border-[#176B87] bg-white text-[#176B87]' : 'border-transparent text-slate-600 hover:bg-white'}`}>
                <CircleDot size={14} /> Cadastro com pelo menos 70% dos dados
              </button>
            </div>
          </section>

          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Fonte do imóvel</p>
            <div className="flex flex-wrap gap-1.5">
              {sources.filter(source => source.active).map(source => (
                <button
                  type="button"
                  key={source.id}
                  onClick={() => toggleSource(source.id)}
                  className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition ${selectedSources.includes(source.id) ? 'border-[#176B87] bg-[#176B87] text-white' : 'border-slate-200 text-slate-600 hover:border-[#176B87]'}`}
                >
                  {source.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Ocupação</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([['false', 'Desocupado'], ['true', 'Ocupado'], ['unknown', 'Não informado']] as const).map(([value, label]) => (
                <button type="button" key={value} onClick={() => setOccupancy(occupancy === value ? '' : value)} className={`min-h-10 rounded-lg border px-2 text-xs font-semibold ${occupancy === value ? 'border-[#176B87] bg-[#176B87] text-white' : 'border-slate-200 text-slate-600'}`}>{label}</button>
              ))}
            </div>
          </div>

          {/* ── Apenas com IA ─────────────────────────────── */}
          <button
            onClick={() => setHasEvaluation(!hasEvaluation)}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-sm font-medium transition-all ${
              hasEvaluation
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <Sparkles size={14} className={hasEvaluation ? 'text-white' : 'text-slate-400'} />
            <div className="text-left">
              <p className="font-semibold">Apenas com Avaliação IA</p>
              <p className={`text-[11px] ${hasEvaluation ? 'text-slate-300' : 'text-slate-400'}`}>
                Mostra só imóveis já analisados
              </p>
            </div>
          </button>

          {/* ── Regiões ────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Região</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(REGIONS).map(([key, region]) => (
                <button
                  key={key}
                  onClick={() => applyRegion(key)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all duration-100 ${
                    isRegionActive(key)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {region.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Modalidade ─────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Tipo de Negociação</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(MODALITY_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon
                const active = selectedModalities.includes(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleModality(key)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-medium transition-all ${
                      active ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={12} className="flex-shrink-0" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Urgência ───────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
              <span className="flex items-center gap-1.5"><Clock size={11} />Leilão nos próximos</span>
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {URGENCY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDaysUntilAuction(daysUntilAuction === opt.value ? null : opt.value)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all ${
                    daysUntilAuction === opt.value
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Classificação regional</p>
            <div className="grid grid-cols-2 gap-1.5">
              {AREA_CLASSIFICATIONS.map(option => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => toggleAreaClassification(option.value)}
                  className={`min-h-10 rounded-lg border px-3 text-left text-xs font-semibold transition ${selectedAreaClassifications.includes(option.value) ? 'border-[#176B87] bg-[#eaf4f5] text-[#176B87]' : 'border-slate-200 text-slate-600 hover:border-[#176B87]'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Estimativa por localização e valor de avaliação por m².</p>
          </div>

          {/* ── Faixa de Preço ─────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Faixa de Preço</p>
            <div className="flex gap-2">
              <input
                placeholder="Mín R$"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
              />
              <input
                placeholder="Máx R$"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* ── Desconto mínimo ────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Desconto mínimo</p>
            <div className="relative">
              <input
                placeholder="Ex: 30"
                value={discountMin}
                onChange={e => setDiscountMin(e.target.value)}
                className="w-full px-3 py-2 pr-8 border border-slate-200 rounded-xl text-sm bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">%</span>
            </div>
          </div>

          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Metragem</p>
            <div className="flex gap-2">
              <label className="flex-1">
                <span className="sr-only">Área mínima</span>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="Mín. m²"
                  value={areaMin}
                  onChange={event => setAreaMin(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#176B87] focus:bg-white"
                />
              </label>
              <label className="flex-1">
                <span className="sr-only">Área máxima</span>
                <input
                  type="number"
                  min="0"
                  inputMode="decimal"
                  placeholder="Máx. m²"
                  value={areaMax}
                  onChange={event => setAreaMax(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#176B87] focus:bg-white"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                ['Até 50 m²', '', '50'],
                ['50–100 m²', '50', '100'],
                ['100–200 m²', '100', '200'],
                ['200+ m²', '200', ''],
              ].map(([label, min, max]) => (
                <button type="button" key={label} onClick={() => { setAreaMin(min); setAreaMax(max) }} className="rounded-full border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-[#176B87] hover:text-[#176B87]">{label}</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Usa área útil quando disponível; caso contrário, a área total.</p>
          </div>

          <div className="rounded-xl border border-[#cfe0e1] bg-[#f6faf9] p-3.5">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#176B87]">Indicadores de decisão</p>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="mb-1 block text-[10px] font-semibold text-slate-500">R$/m² mínimo</span><input type="number" min="0" value={pricePerM2Min} onChange={event => setPricePerM2Min(event.target.value)} placeholder="Ex.: 1500" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#176B87]" /></label>
              <label><span className="mb-1 block text-[10px] font-semibold text-slate-500">R$/m² máximo</span><input type="number" min="0" value={pricePerM2Max} onChange={event => setPricePerM2Max(event.target.value)} placeholder="Ex.: 5000" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#176B87]" /></label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label><span className="mb-1 block text-[10px] font-semibold text-slate-500">Oportunidade mínima</span><select value={opportunityScoreMin} onChange={event => setOpportunityScoreMin(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#176B87]"><option value="">Qualquer nota</option><option value="50">50+</option><option value="65">65+</option><option value="80">80+</option></select></label>
              <label><span className="mb-1 block text-[10px] font-semibold text-slate-500">Sinal do bairro</span><select value={neighborhoodScoreMin} onChange={event => setNeighborhoodScoreMin(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#176B87]"><option value="">Qualquer sinal</option><option value="50">50+</option><option value="65">65+</option><option value="80">80+</option></select></label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">Scores baseados nos anúncios ativos da Leila; não substituem pesquisa de mercado.</p>
          </div>

          {/* ── Estados ────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Estados</p>
            <div className="flex flex-wrap gap-1.5">
              {UFS.map(uf => (
                <button
                  key={uf}
                  onClick={() => toggleState(uf)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-all duration-100 ${
                    selectedStates.includes(uf)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {uf}
                </button>
              ))}
            </div>
          </div>

          {/* ── Cidades (autocomplete) ─────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Cidades</p>
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {selectedCities.map(city => (
                  <span key={city} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 bg-slate-900 text-white rounded-lg">
                    <MapPin size={10} />
                    {city}
                    <button onClick={() => removeCity(city)} className="ml-0.5 hover:text-slate-300 transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={cityInputRef}
                placeholder={selectedStates.length ? 'Buscar nas cidades disponíveis...' : 'Selecione um estado ou digite a cidade...'}
                value={citySearch}
                onChange={e => { setCitySearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50/50 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-40 overflow-y-auto">
                  {filteredSuggestions.map(city => (
                    <button
                      key={city.name}
                      onMouseDown={() => addCity(city.name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{city.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">{city.count.toLocaleString('pt-BR')}</span>
                    </button>
                  ))}
                </div>
              )}
              {showSuggestions && (selectedStates.length > 0 || citySearch.trim().length >= 2) && filteredSuggestions.length === 0 && !citiesLoading && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 px-3 py-2.5">
                  <p className="text-xs text-slate-400">Nenhuma cidade encontrada.</p>
                </div>
              )}
              {showSuggestions && citiesLoading && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
                  <p className="text-xs text-slate-400">Carregando cidades disponíveis…</p>
                </div>
              )}
            </div>
            {selectedStates.length > 0 && <p className="mt-2 text-[11px] text-slate-400">A lista considera somente imóveis ativos nos estados selecionados.</p>}
          </div>

          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Bairros</p>
            {selectedNeighborhoods.length > 0 && <div className="mb-2.5 flex flex-wrap gap-1.5">{selectedNeighborhoods.map(value => <span key={value} className="flex items-center gap-1 rounded-lg bg-[#176B87] px-2.5 py-1 text-xs font-semibold text-white">{value}<button type="button" onClick={() => removeNeighborhood(value)} aria-label={`Remover ${value}`}><X size={10} /></button></span>)}</div>}
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={neighborhoodSearch}
                disabled={selectedStates.length !== 1 || selectedCities.length !== 1}
                onChange={event => { setNeighborhoodSearch(event.target.value); setShowNeighborhoodSuggestions(true) }}
                onFocus={() => setShowNeighborhoodSuggestions(true)}
                onBlur={() => setTimeout(() => setShowNeighborhoodSuggestions(false), 150)}
                placeholder={selectedStates.length === 1 && selectedCities.length === 1 ? 'Buscar bairros disponíveis...' : 'Selecione um estado e uma cidade'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-[#176B87] focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              />
              {showNeighborhoodSuggestions && neighborhoodSuggestions.filter(item => !selectedNeighborhoods.includes(item.neighborhood)).length > 0 && <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">{neighborhoodSuggestions.filter(item => !selectedNeighborhoods.includes(item.neighborhood)).map(item => <button type="button" key={item.id} onMouseDown={() => addNeighborhood(item.neighborhood)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"><MapPin size={11} className="text-slate-400" /><span className="min-w-0 flex-1 truncate">{item.neighborhood}</span><span className="num text-[10px] text-slate-400">{item.property_count}</span></button>)}</div>}
              {showNeighborhoodSuggestions && neighborhoodsLoading && <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">Carregando bairros…</div>}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Bairros homônimos permanecem vinculados à cidade selecionada.</p>
          </div>

          {/* ── Tipo de Imóvel ─────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Tipo de Imóvel</p>
            <div className="flex flex-wrap gap-1.5">
              {PROPERTY_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border capitalize transition-all duration-100 ${
                    selectedTypes.includes(t)
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1 border-t border-slate-100">
            <button onClick={reset} className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
              Limpar filtros
            </button>
            <button onClick={apply} className="flex-1 py-2.5 text-sm font-semibold bg-[#163447] text-white rounded-xl hover:bg-[#0f293a] transition-all">
              Ver resultados
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
