import { useState, useEffect } from 'react'
import { SlidersHorizontal } from 'lucide-react'
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 border border-border rounded-md text-sm hover:bg-muted"
      >
        <SlidersHorizontal size={16} />
        Filtros
        {(selectedStates.length + selectedTypes.length + (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (discountMin ? 1 : 0)) > 0 && (
          <span className="bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
            {selectedStates.length + selectedTypes.length + (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (discountMin ? 1 : 0)}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-card border border-border rounded-lg shadow-lg p-4 space-y-4">
          {/* Price */}
          <div>
            <p className="text-sm font-medium mb-2">Faixa de Preço</p>
            <div className="flex gap-2">
              <input
                placeholder="Mín R$"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-input rounded text-sm bg-background"
              />
              <input
                placeholder="Máx R$"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                className="flex-1 px-2 py-1.5 border border-input rounded text-sm bg-background"
              />
            </div>
          </div>

          {/* Discount */}
          <div>
            <p className="text-sm font-medium mb-2">Desconto mínimo (%)</p>
            <input
              placeholder="Ex: 30"
              value={discountMin}
              onChange={e => setDiscountMin(e.target.value)}
              className="w-full px-2 py-1.5 border border-input rounded text-sm bg-background"
            />
          </div>

          {/* States */}
          <div>
            <p className="text-sm font-medium mb-2">Estados</p>
            <div className="flex flex-wrap gap-1">
              {UFS.map(uf => (
                <button
                  key={uf}
                  onClick={() => toggleState(uf)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    selectedStates.includes(uf)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {uf}
                </button>
              ))}
            </div>
          </div>

          {/* Types */}
          <div>
            <p className="text-sm font-medium mb-2">Tipo de Imóvel</p>
            <div className="flex flex-wrap gap-1">
              {PROPERTY_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => toggleType(t)}
                  className={`text-xs px-2 py-0.5 rounded border capitalize transition-colors ${
                    selectedTypes.includes(t)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={reset} className="flex-1 py-1.5 text-sm border border-border rounded hover:bg-muted">
              Limpar
            </button>
            <button onClick={apply} className="flex-1 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
