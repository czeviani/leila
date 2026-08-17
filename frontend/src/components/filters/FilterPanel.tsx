import { useState, useEffect, useRef } from 'react'
import { SlidersHorizontal, X, Search, MapPin, ShoppingCart, Gavel, Users, Mail, Tag, Sparkles, Clock, ShieldCheck, CircleDot } from 'lucide-react'
import { PropertyFilters } from '../../lib/api'
import { useFilters, useSaveFilters, useCities } from '../../hooks/useProperties'

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

interface Props {
  onFilterChange: (params: Record<string, string | number | undefined>) => void
}

function filtersToParams(filters: PropertyFilters): Record<string, string | number | undefined> {
  const params: Record<string, string | number | undefined> = {}
  if (filters.price_min) params.price_min = filters.price_min
  if (filters.price_max) params.price_max = filters.price_max
  if (filters.states?.length) params.state = filters.states.join(',')
  if (filters.cities?.length) params.city = filters.cities.join(',')
  if (filters.property_types?.length) params.type = filters.property_types.join(',')
  if (filters.discount_min) params.discount_min = filters.discount_min
  if (filters.modality_categories?.length) params.modality = filters.modality_categories.join(',')
  if (filters.area_classifications?.length) params.area_classification = filters.area_classifications.join(',')
  if (filters.days_until_auction_max) params.days_until_auction_max = filters.days_until_auction_max
  if (filters.has_evaluation) params.has_evaluation = 'true'
  return params
}

export default function FilterPanel({ onFilterChange }: Props) {
  const { data: savedFilters } = useFilters()
  const saveFilters = useSaveFilters()
  const panelRef = useRef<HTMLDivElement>(null)
  const cityInputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const initialApplied = useRef(false)

  const [open, setOpen] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [discountMin, setDiscountMin] = useState('')
  const [selectedModalities, setSelectedModalities] = useState<string[]>([])
  const [selectedAreaClassifications, setSelectedAreaClassifications] = useState<string[]>([])
  const [daysUntilAuction, setDaysUntilAuction] = useState<number | null>(null)
  const [hasEvaluation, setHasEvaluation] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [qualityOnly, setQualityOnly] = useState(false)
  const [occupancy, setOccupancy] = useState<'' | 'true' | 'false' | 'unknown'>('')

  const [citySearch, setCitySearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const { data: citySuggestions = [] } = useCities(citySearch)

  useEffect(() => {
    if (!savedFilters || initialApplied.current) return
    initialApplied.current = true
    if (savedFilters.price_min) setPriceMin(String(savedFilters.price_min))
    if (savedFilters.price_max) setPriceMax(String(savedFilters.price_max))
    if (savedFilters.states?.length) setSelectedStates(savedFilters.states)
    if (savedFilters.cities?.length) setSelectedCities(savedFilters.cities)
    if (savedFilters.property_types?.length) setSelectedTypes(savedFilters.property_types)
    if (savedFilters.discount_min) setDiscountMin(String(savedFilters.discount_min))
    if (savedFilters.modality_categories?.length) setSelectedModalities(savedFilters.modality_categories)
    if (savedFilters.area_classifications?.length) setSelectedAreaClassifications(savedFilters.area_classifications)
    if (savedFilters.days_until_auction_max) setDaysUntilAuction(savedFilters.days_until_auction_max)
    if (savedFilters.has_evaluation) setHasEvaluation(savedFilters.has_evaluation)

    const params = filtersToParams(savedFilters)
    if (Object.keys(params).length > 0) onFilterChange(params)
  }, [savedFilters]) // eslint-disable-line react-hooks/exhaustive-deps

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
    cityInputRef.current?.focus()
  }
  const removeCity = (city: string) => setSelectedCities(prev => prev.filter(c => c !== city))
  const toggleState = (uf: string) => setSelectedStates(prev => prev.includes(uf) ? prev.filter(s => s !== uf) : [...prev, uf])
  const toggleType = (t: string) => setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const toggleModality = (m: string) => setSelectedModalities(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  const applyRegion = (regionKey: string) => {
    const region = REGIONS[regionKey]
    if (!region) return
    const allSelected = region.states.every(s => selectedStates.includes(s))
    if (allSelected) {
      setSelectedStates(prev => prev.filter(s => !region.states.includes(s)))
    } else {
      setSelectedStates(prev => [...new Set([...prev, ...region.states])])
    }
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
    setVerifiedOnly(false); setQualityOnly(false); setOccupancy('')
    const empty: PropertyFilters = {
      price_min: null, price_max: null, states: [], cities: [], property_types: [],
      discount_min: null, modality_categories: [], area_classifications: [],
      days_until_auction_max: null, has_evaluation: false,
    }
    saveFilters.mutate(empty)
    onFilterChange({})
    setOpen(false)
  }

  const activeCount =
    selectedStates.length + selectedCities.length + selectedTypes.length +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (discountMin ? 1 : 0) +
    selectedModalities.length +
    (daysUntilAuction ? 1 : 0) + (hasEvaluation ? 1 : 0) +
    (verifiedOnly ? 1 : 0) + (qualityOnly ? 1 : 0) + (occupancy ? 1 : 0)

  const filteredSuggestions = citySuggestions.filter(c => !selectedCities.includes(c))

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
                placeholder="Digite o nome da cidade..."
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
                      key={city}
                      onMouseDown={() => addCity(city)}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                    >
                      <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                      {city}
                    </button>
                  ))}
                </div>
              )}
              {showSuggestions && citySearch.trim().length >= 2 && filteredSuggestions.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 px-3 py-2.5">
                  <p className="text-xs text-slate-400">Nenhuma cidade encontrada.</p>
                </div>
              )}
            </div>
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
