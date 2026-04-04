import { useState, useEffect, useRef } from 'react'
import { SlidersHorizontal, X, Search, MapPin } from 'lucide-react'
import { PropertyFilters } from '../../lib/api'
import { useFilters, useSaveFilters, useCities } from '../../hooks/useProperties'

const PROPERTY_TYPES = ['apartamento', 'casa', 'terreno', 'loja', 'galpão', 'sala', 'sobrado']
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

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
  return params
}

export default function FilterPanel({ onFilterChange }: Props) {
  const { data: savedFilters } = useFilters()
  const saveFilters = useSaveFilters()
  const panelRef = useRef<HTMLDivElement>(null)
  const cityInputRef = useRef<HTMLInputElement>(null)
  const initialApplied = useRef(false)

  const [open, setOpen] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [discountMin, setDiscountMin] = useState('')

  // City autocomplete
  const [citySearch, setCitySearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const { data: citySuggestions = [] } = useCities(citySearch)

  // Load saved filters into local state + auto-apply once
  useEffect(() => {
    if (!savedFilters || initialApplied.current) return
    initialApplied.current = true
    if (savedFilters.price_min) setPriceMin(String(savedFilters.price_min))
    if (savedFilters.price_max) setPriceMax(String(savedFilters.price_max))
    if (savedFilters.states?.length) setSelectedStates(savedFilters.states)
    if (savedFilters.cities?.length) setSelectedCities(savedFilters.cities)
    if (savedFilters.property_types?.length) setSelectedTypes(savedFilters.property_types)
    if (savedFilters.discount_min) setDiscountMin(String(savedFilters.discount_min))

    const params = filtersToParams(savedFilters)
    if (Object.keys(params).length > 0) onFilterChange(params)
  }, [savedFilters]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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

  const apply = () => {
    const filters: PropertyFilters = {
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      states: selectedStates,
      cities: selectedCities,
      property_types: selectedTypes,
      discount_min: discountMin ? Number(discountMin) : null,
    }
    saveFilters.mutate(filters)
    onFilterChange(filtersToParams(filters))
    setOpen(false)
  }

  const reset = () => {
    setPriceMin(''); setPriceMax(''); setSelectedStates([])
    setSelectedCities([]); setSelectedTypes([]); setDiscountMin('')
    setCitySearch('')
    const empty: PropertyFilters = { price_min: null, price_max: null, states: [], cities: [], property_types: [], discount_min: null }
    saveFilters.mutate(empty)
    onFilterChange({})
    setOpen(false)
  }

  const activeCount = selectedStates.length + selectedCities.length + selectedTypes.length +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (discountMin ? 1 : 0)

  const filteredSuggestions = citySuggestions.filter(c => !selectedCities.includes(c))

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3.5 py-2.5 border rounded-xl text-sm font-medium transition-all duration-150 ${
          activeCount > 0
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
        }`}
      >
        <SlidersHorizontal size={15} />
        Filtros
        {activeCount > 0 && (
          <span className="bg-white text-slate-900 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-5" style={{ width: '340px' }}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Filtros</p>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* Price */}
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

          {/* Discount */}
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

          {/* States */}
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

          {/* Cities — autocomplete */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">Cidades</p>

            {/* Selected city chips */}
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {selectedCities.map(city => (
                  <span key={city} className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 bg-slate-900 text-white rounded-lg">
                    <MapPin size={10} />
                    {city}
                    <button
                      onClick={() => removeCity(city)}
                      className="ml-0.5 hover:text-slate-300 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
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

              {/* Suggestions dropdown */}
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

          {/* Types */}
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
            <button
              onClick={reset}
              className="flex-1 py-2.5 text-sm font-medium border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              Limpar filtros
            </button>
            <button
              onClick={apply}
              className="flex-1 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-sm shadow-slate-900/20"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
