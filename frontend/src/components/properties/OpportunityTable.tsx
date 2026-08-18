import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Property } from '../../lib/api'
import { COLUMN_LABELS, OpportunityColumn, TableDensity } from '../../lib/opportunityTable'
import PropertyRow from './PropertyRow'

const SORT_FIELDS: Partial<Record<OpportunityColumn, string>> = {
  opportunity: 'opportunity_score',
  location: 'neighborhood',
  property: 'property_type',
  area: 'filter_area_m2',
  price: 'auction_price',
  pricePerM2: 'price_per_m2',
  discount: 'discount_pct',
  neighborhood: 'neighborhood_score',
  deadline: 'auction_date',
}

const WIDTHS: Record<OpportunityColumn, string> = {
  opportunity: 'min-w-[140px]', location: 'min-w-[190px]', property: 'min-w-[230px]',
  area: 'min-w-[90px]', price: 'min-w-[145px]', pricePerM2: 'min-w-[115px]',
  discount: 'min-w-[100px]', neighborhood: 'min-w-[145px]', status: 'min-w-[165px]',
  deadline: 'min-w-[100px]',
}

interface Props {
  properties: Property[]
  columns: OpportunityColumn[]
  density: TableDensity
  sort: string
  selectedIds: Set<string>
  favoriteIds: Set<string>
  onSort: (sort: string) => void
  onToggleSelection: (property: Property) => void
  onApprove: (property: Property) => void
  onReject: (property: Property) => void
  onOpen: (property: Property) => void
}

export default function OpportunityTable({
  properties, columns, density, sort, selectedIds, favoriteIds,
  onSort, onToggleSelection, onApprove, onReject, onOpen,
}: Props) {
  const [activeSort, activeOrder] = sort.split(':')

  const changeSort = (column: OpportunityColumn) => {
    const field = SORT_FIELDS[column]
    if (!field) return
    onSort(`${field}:${activeSort === field && activeOrder === 'desc' ? 'asc' : 'desc'}`)
  }

  return (
    <div className="hidden max-h-[calc(100vh-12rem)] overflow-auto rounded-2xl border border-[#cfdddd] bg-white shadow-[0_8px_30px_rgba(22,52,71,.06)] xl:block">
      <table className="w-full min-w-[1230px] border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-30 bg-[#163447] text-white shadow-[0_2px_0_rgba(22,52,71,.14)]">
          <tr>
            <th scope="col" className="sticky left-0 z-40 w-12 bg-[#163447] px-3 py-3">
              <span className="sr-only">Comparar</span>
            </th>
            {columns.map(column => {
              const field = SORT_FIELDS[column]
              const isActive = field === activeSort
              const Icon = !isActive ? ArrowUpDown : activeOrder === 'asc' ? ArrowUp : ArrowDown
              const numeric = ['area', 'price', 'pricePerM2', 'discount'].includes(column)
              return (
                <th key={column} scope="col" className={`${WIDTHS[column]} ${column === 'location' ? 'sticky left-12 z-40 bg-[#163447]' : ''} px-3 py-3 ${numeric ? 'text-right' : ''}`}>
                  {field ? (
                    <button
                      type="button"
                      onClick={() => changeSort(column)}
                      className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[.13em] transition hover:text-[#8dd5d2] ${numeric ? 'ml-auto' : ''} ${isActive ? 'text-[#8dd5d2]' : 'text-[#dceced]'}`}
                      title={`Ordenar por ${COLUMN_LABELS[column]}`}
                    >
                      {COLUMN_LABELS[column]} <Icon size={12} />
                    </button>
                  ) : (
                    <span className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#dceced]">{COLUMN_LABELS[column]}</span>
                  )}
                </th>
              )
            })}
            <th scope="col" className="sticky right-0 z-40 min-w-[176px] bg-[#163447] px-3 py-3 text-right text-[10px] font-extrabold uppercase tracking-[.13em] text-[#dceced]">Ações rápidas</th>
          </tr>
        </thead>
        <tbody>
          {properties.map(property => (
            <PropertyRow
              key={property.id}
              property={property}
              columns={columns}
              density={density}
              selected={selectedIds.has(property.id)}
              selectionDisabled={selectedIds.size >= 4}
              isFavorite={favoriteIds.has(property.id)}
              onToggleSelection={() => onToggleSelection(property)}
              onApprove={() => onApprove(property)}
              onReject={() => onReject(property)}
              onClick={() => onOpen(property)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
