import { memo, MouseEvent } from 'react'
import {
  AlertTriangle, BedDouble, CalendarClock, Car, Check,
  ExternalLink, Eye, MapPinned, MapPin, Scale, ShieldCheck, ThumbsDown, ThumbsUp,
} from 'lucide-react'
import { Property } from '../../lib/api'
import {
  confidenceLabel, effectiveArea, effectivePricePerM2, neighborhoodInsight,
  googleAddressSearchUrl, neighborhoodName, opportunityFactors, opportunityScore, OpportunityColumn,
  TableDensity,
} from '../../lib/opportunityTable'
import { daysUntilAuction } from '../../lib/heatScore'
import SourceBadge from './SourceBadge'
import AuctionJourney from './AuctionJourney'

const TYPE_LABELS: Record<string, string> = {
  apartamento: 'Apartamento', casa: 'Casa', terreno: 'Terreno', loja: 'Loja',
  galpão: 'Galpão', sala: 'Sala', sobrado: 'Sobrado', prédio: 'Prédio',
}

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

const pricePerM2 = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

function action(event: MouseEvent, callback: () => void) {
  event.stopPropagation()
  callback()
}

interface Props {
  property: Property
  columns: OpportunityColumn[]
  density: TableDensity
  selected: boolean
  selectionDisabled: boolean
  isFavorite: boolean
  onToggleSelection: () => void
  onApprove: () => void
  onReject: () => void
  onClick: () => void
}

export default memo(function PropertyRow({
  property, columns, density, selected, selectionDisabled, isFavorite,
  onToggleSelection, onApprove, onReject, onClick,
}: Props) {
  const score = opportunityScore(property)
  const factors = opportunityFactors(property)
  const area = effectiveArea(property)
  const perM2 = effectivePricePerM2(property)
  const bairro = neighborhoodName(property)
  const neighborhood = neighborhoodInsight(property)
  const days = daysUntilAuction(property.auction_date)
  const source = property.leila_sources?.name ?? property.source_id
  const documentTags = property.leila_document_analyses?.status === 'done'
    ? property.leila_document_analyses.tags?.slice(0, 2) ?? []
    : []
  const isDiscarded = Boolean(property.leila_discarded_properties?.length)
  const yPadding = density === 'compact' ? 'py-2.5' : 'py-4'

  return (
    <tr
      onClick={onClick}
      className={`group cursor-pointer border-b border-[#e2eaea] bg-white transition-colors last:border-b-0 hover:bg-[#f4f9f9] ${selected ? 'bg-[#edf7f6]' : ''}`}
    >
      <td className={`sticky left-0 z-10 w-12 bg-inherit px-3 ${yPadding}`}>
        <button
          type="button"
          disabled={selectionDisabled && !selected}
          onClick={event => action(event, onToggleSelection)}
          aria-label={selected ? `Remover ${property.title} da comparação` : `Comparar ${property.title}`}
          title={selectionDisabled && !selected ? 'Compare no máximo 4 imóveis' : 'Selecionar para comparar'}
          className={`grid h-7 w-7 place-items-center rounded-lg border transition ${selected
            ? 'border-[#176B87] bg-[#176B87] text-white'
            : 'border-[#b9ccce] bg-white text-transparent hover:border-[#176B87] disabled:cursor-not-allowed disabled:opacity-35'}`}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      </td>

      {columns.includes('opportunity') && (
        <td className={`min-w-[140px] px-3 ${yPadding}`} title={`Evidências: ${factors.join(', ')} · ${confidenceLabel(property.opportunity_confidence ?? null)}`}>
          <div className="flex items-center gap-2">
            <strong className="num text-base text-[#163447]">{score}</strong>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#dfeaea]">
              <span
                className={`block h-full rounded-full ${score >= 75 ? 'bg-[#167261]' : score >= 50 ? 'bg-[#176B87]' : score >= 30 ? 'bg-[#C68A2D]' : 'bg-[#B33A48]'}`}
                style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
              />
            </div>
          </div>
          <p className="mt-1 max-w-[130px] truncate text-[10px] text-slate-500">{factors[0]}</p>
        </td>
      )}

      {columns.includes('location') && (
        <td className={`sticky left-12 z-[9] min-w-[190px] bg-inherit px-3 ${yPadding}`}>
          <p className="truncate text-sm font-extrabold text-[#163447]">{bairro ?? 'Bairro não informado'}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
            <MapPin size={11} /> {[property.city, property.state].filter(Boolean).join(' · ') || 'Localização pendente'}
          </p>
        </td>
      )}

      {columns.includes('property') && (
        <td className={`min-w-[230px] max-w-[290px] px-3 ${yPadding}`}>
          <p className="truncate text-sm font-bold text-[#163447]">{TYPE_LABELS[property.property_type ?? ''] ?? property.property_type ?? 'Imóvel'}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500" title={property.title}>{property.title}</p>
          <div className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold text-[#176B87]">
            <SourceBadge sourceId={property.source_id} sourceName={source} compact icon />
            {property.bedrooms != null && <span className="inline-flex items-center gap-0.5 text-slate-500"><BedDouble size={10} />{property.bedrooms}</span>}
            {!!property.parking_spots && <span className="inline-flex items-center gap-0.5 text-slate-500"><Car size={10} />{property.parking_spots}</span>}
          </div>
        </td>
      )}

      {columns.includes('area') && (
        <td className={`whitespace-nowrap px-3 text-right ${yPadding}`}>
          {area ? <span className="num text-sm font-bold text-[#163447]">{Math.round(area)} <small className="font-sans font-semibold text-slate-400">m²</small></span> : <span className="text-slate-300">—</span>}
        </td>
      )}

      {columns.includes('price') && (
        <td className={`min-w-[190px] whitespace-nowrap px-3 text-right ${yPadding}`}>
          <p className="num text-sm font-bold text-[#163447]">{money(property.auction_price)}</p>
          <p className="text-[10px] font-semibold text-[#8a5a12]">melhor mínimo conhecido</p>
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <AuctionJourney property={property} />
            {property.current_stage_price != null && property.current_stage_price !== property.auction_price && (
              <span className="text-[9px] text-slate-400">agora {money(property.current_stage_price)}</span>
            )}
          </div>
        </td>
      )}

      {columns.includes('pricePerM2') && (
        <td className={`whitespace-nowrap px-3 text-right ${yPadding}`}>
          {perM2 ? <span className="num text-xs font-semibold text-[#176B87]">{pricePerM2(perM2)}</span> : <span className="text-slate-300">—</span>}
        </td>
      )}

      {columns.includes('discount') && (
        <td className={`whitespace-nowrap px-3 text-right ${yPadding}`}>
          {property.discount_pct != null && property.discount_pct > 0 ? (
            <><p className="num text-sm font-bold text-[#167261]">−{property.discount_pct.toFixed(0)}%</p><p className="text-[10px] text-slate-400">vs. avaliação</p></>
          ) : <span className="text-slate-300">—</span>}
        </td>
      )}

      {columns.includes('neighborhood') && (
        <td className={`min-w-[145px] px-3 ${yPadding}`}>
          {neighborhood.score != null ? (
            <>
              <div className="flex items-center gap-2"><strong className="num text-sm text-[#163447]">{neighborhood.score.toFixed(1)}</strong><Scale size={12} className="text-[#176B87]" /></div>
              <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{neighborhood.label ?? confidenceLabel(neighborhood.confidence)}</p>
            </>
          ) : (
            <><p className="text-xs font-semibold text-slate-500">Em formação</p><p className="mt-0.5 text-[10px] text-slate-400">dados insuficientes</p></>
          )}
        </td>
      )}

      {columns.includes('status') && (
        <td className={`min-w-[165px] px-3 ${yPadding}`}>
          <div className="flex flex-wrap gap-1">
            {property.is_occupied === true && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3e5] px-2 py-1 text-[10px] font-bold text-[#985a12]"><AlertTriangle size={10} />Ocupado</span>}
            {property.is_occupied === false && <span className="inline-flex items-center gap-1 rounded-full bg-[#e9f6f2] px-2 py-1 text-[10px] font-bold text-[#167261]"><ShieldCheck size={10} />Desocupado</span>}
            {property.is_occupied == null && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Ocupação pendente</span>}
            {documentTags.map(tag => <span key={tag} className="max-w-[145px] truncate rounded-full bg-[#eef5f6] px-2 py-1 text-[10px] font-semibold text-[#176B87]">{tag}</span>)}
          </div>
        </td>
      )}

      {columns.includes('deadline') && (
        <td className={`whitespace-nowrap px-3 ${yPadding}`}>
          {days == null ? <span className="text-xs text-slate-400">Sem prazo</span> : (
            <span className={`inline-flex items-center gap-1 text-xs font-bold ${days <= 7 ? 'text-[#B33A48]' : 'text-slate-600'}`}>
              <CalendarClock size={12} />{days < 0 ? 'Encerrado' : days === 0 ? 'Hoje' : `${days} dias`}
            </span>
          )}
        </td>
      )}

      <td className={`sticky right-0 z-10 whitespace-nowrap bg-inherit px-2 ${yPadding}`}>
        <div className="flex items-center justify-end gap-0.5">
          <button type="button" onClick={event => action(event, onClick)} aria-label="Abrir imóvel" title="Abrir imóvel" className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-[#176B87]"><Eye size={15} /></button>
          <a href={googleAddressSearchUrl(property)} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} aria-label="Pesquisar endereço no Google" title="Pesquisar rua e número no Google" className="inline-block rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-[#176B87]"><MapPinned size={15} /></a>
          {property.edital_url && <a href={property.edital_url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} aria-label="Abrir documento oficial" title="Abrir documento oficial" className="inline-block rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-[#176B87]"><ExternalLink size={15} /></a>}
          <button type="button" onClick={event => action(event, onApprove)} aria-label={isFavorite ? 'Remover aprovação' : 'Aprovar imóvel'} title={isFavorite ? 'Remover aprovação' : 'Aprovar imóvel'} className={`rounded-lg p-2 transition ${isFavorite ? 'bg-[#e4f4ef] text-[#167261]' : 'text-slate-400 hover:bg-[#edf8f5] hover:text-[#167261]'}`}><ThumbsUp size={15} fill={isFavorite ? 'currentColor' : 'none'} /></button>
          <button type="button" onClick={event => action(event, onReject)} aria-label={isDiscarded ? 'Remover reprovação' : 'Reprovar imóvel'} title={isDiscarded ? 'Remover reprovação' : 'Reprovar imóvel'} className={`rounded-lg p-2 transition ${isDiscarded ? 'bg-[#fff0f1] text-[#B33A48]' : 'text-slate-400 hover:bg-[#fff0f1] hover:text-[#B33A48]'}`}><ThumbsDown size={15} fill={isDiscarded ? 'currentColor' : 'none'} /></button>
        </div>
      </td>
    </tr>
  )
})
