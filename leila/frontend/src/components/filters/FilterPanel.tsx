import { useState, useEffect, useRef } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import { PropertyFilters } from '../../lib/api'
import { useFilters, useSaveFilters } from '../../hooks/useProperties'

const PROPERTY_TYPES = ['apartamento', 'casa', 'terreno', 'loja', 'galpão', 'sala', 'sobrado']
const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']

interface Props {
  onFilterChange: (params: Record<string, string | number | undefined>) => void
}

export default function FilterPanel({ onFilterChange }: Props) {
  const { data: savedFilters } = useFilters()
  const saveFilters = useSaveFilters()
  const panelRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [discountMin, setDiscountMin] = useState('')

  useEffect(() => {
    if (savedFilters) {
      if (savedFilters.price_min) setPriceMin(String(savedFilters.price_min))
      if (savedFilters.price_max) setPriceMax(String(savedFilters.price_max))
      if (savedFilters.states?.length) setSelectedStates(savedFilters.states)
      if (savedFilters.property_types?.length) setSelectedTypes(savedFilters.property_types)
      if (savedFilters.discount_min) setDiscountMin(String(savedFilters.discount_min))
    }
  }, [savedFilters])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggleState = (uf: string) =>
    setSelectedStates(prev => prev.includes(uf) ? prev.filter(s => s !== uf) : [...prev, uf])

  const toggleType = (t: string) =>
    setSelectedTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const apply = () => {
    const filters: PropertyFilters = {
      price_min: priceMin ? Number(priceMin) : null,
      price_max: priceMax ? Number(priceMax) : null,
      states: selectedStates,
      cities: [],
      property_types: selectedTypes,
      discount_min: discountMin ? Number(discountMin) : null,
    }

    saveFilters.mutate(filters)

    const params: Record<string, string | number | undefined> = {}
    if (filters.price_min) params.price_min = filters.price_min
    if (filters.price_max) params.price_max = filters.price_max
    if (filters.states.length) params.state = filters.states[0] // API single-state for now
    if (filters.property_types.length) params.type = filters.property_types[0]
    if (filters.discount_min) params.discount_min = filters.discount_min

    onFilterChange(params)
    setOpen(false)
  }

  const reset = () => {
    setPriceMin(''); setPriceMax(''); setSelectedStates([])
    setSelectedTypes([]); setDiscountMin('')
    onFilterChange({})
    setOpen(false)
  }

  const activeCount = selectedStates.length + selectedTypes.length +
    (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (discountMin ? 1 : 0)

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
        <div className="absolute right-0 top-12 z-50 w-84 bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-5" style={{ width: '340px' }}>
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
