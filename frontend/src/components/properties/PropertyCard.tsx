import {
  AlertTriangle, ArrowUpRight, Bath, Bed, CalendarDays, Car,
  CircleDot, MapPinned, MapPin, Ruler, ThumbsDown, ThumbsUp, TrendingDown,
} from 'lucide-react'
import { Property } from '../../lib/api'
import { daysUntilAuction } from '../../lib/heatScore'
import { googleAddressSearchUrl, neighborhoodName } from '../../lib/opportunityTable'
import SourceBadge from './SourceBadge'
import AuctionJourney from './AuctionJourney'

interface Props {
  property: Property
  isFavorite: boolean
  isRejected: boolean
  onApprove: () => void
  onReject: () => void
  onClick: () => void
}

const TYPE_LABELS: Record<string, string> = {
  apartamento: 'Apartamento', casa: 'Casa', terreno: 'Terreno', loja: 'Loja',
  galpão: 'Galpão', sala: 'Sala comercial', sobrado: 'Sobrado', prédio: 'Prédio',
}

const MODALITY_LABELS: Record<string, string> = {
  compra_direta: 'Compra direta', segunda_praca: '2ª praça', leilao_online: 'Leilão online',
  primeira_praca: '1ª praça', proposta_fechada: 'Proposta fechada',
}

const AREA_LABELS: Record<string, string> = {
  nobre: 'Região nobre',
  'intermediário': 'Região intermediária',
  popular: 'Região popular',
  comunidade: 'Comunidade',
}

function money(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(value)
}

function relativeDate(date?: string | null) {
  if (!date) return 'sem registro de verificação'
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000))
  if (hours < 1) return 'há menos de 1h'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

function TrustStatus({ property }: { property: Property }) {
  const status = property.availability_status ?? (property.is_active === false ? 'unavailable' : 'available')
  const config = status === 'available'
    ? { label: 'Observado na fonte', dot: 'bg-[#167261]', text: 'text-[#167261]' }
    : status === 'suspect'
      ? { label: 'Disponibilidade incerta', dot: 'bg-[#B56716]', text: 'text-[#99540e]' }
      : { label: 'Não está mais na fonte', dot: 'bg-[#B33A48]', text: 'text-[#B33A48]' }

  return (
    <div className="provenance-line" aria-label={`${config.label}, ${relativeDate(property.last_verified_at ?? property.last_seen_at ?? property.scraped_at)}`}>
      <span className={`h-2.5 w-2.5 rounded-full ring-4 ring-white ${config.dot}`} />
      <span className={`font-semibold ${config.text}`}>{config.label}</span>
      <SourceBadge sourceId={property.source_id} sourceName={property.leila_sources?.name} compact icon className="hidden sm:inline-flex" />
      <span className="h-px flex-1 bg-slate-200" />
      <span className="font-mono text-slate-500">{relativeDate(property.last_verified_at ?? property.last_seen_at ?? property.scraped_at)}</span>
    </div>
  )
}

export default function PropertyCard({ property, isFavorite, isRejected, onApprove, onReject, onClick }: Props) {
  const area = property.useful_area_m2 ?? property.area_m2
  const days = daysUntilAuction(property.auction_date)
  const type = property.property_type ? (TYPE_LABELS[property.property_type] ?? property.property_type) : 'Imóvel'
  const modality = property.auction_modality ? MODALITY_LABELS[property.auction_modality] : null
  const documentTags = property.leila_document_analyses?.status === 'done'
    ? property.leila_document_analyses.tags?.slice(0, 2) ?? []
    : []
  const evaluatedArea = property.leila_evaluations?.area_classification
  const areaClassification = evaluatedArea && evaluatedArea !== 'indefinido'
    ? evaluatedArea
    : property.area_classification

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[#dbe5e5] bg-white shadow-[0_1px_0_rgba(22,52,71,.05)] transition hover:-translate-y-0.5 hover:border-[#9eb8bd] hover:shadow-[0_14px_40px_rgba(22,52,71,.09)] focus-within:ring-2 focus-within:ring-[#176B87]"
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 flex-col text-left focus:outline-none"
        aria-label={`Abrir ${property.title}`}
      >
        <div className="border-b border-[#e5eded] bg-[#f8fbfb] px-4 py-3">
          <TrustStatus property={property} />
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#176B87]">
                <span>{type}</span>
                {modality && <><span className="text-slate-300">/</span><span>{modality}</span></>}
                <SourceBadge sourceId={property.source_id} sourceName={property.leila_sources?.name} compact />
                {areaClassification && areaClassification !== 'indefinido' && (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">{AREA_LABELS[areaClassification] ?? areaClassification}</span>
                )}
              </div>
              <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#163447]">{property.title}</h2>
            </div>
            <ArrowUpRight className="mt-0.5 shrink-0 text-slate-300 transition group-hover:text-[#176B87]" size={18} />
          </div>

          <p className="mb-4 flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            <span className="truncate"><strong className="text-[#163447]">{neighborhoodName(property) ?? 'Bairro não informado'}</strong> · {[property.city, property.state].filter(Boolean).join(' · ') || 'localização pendente'}</span>
          </p>

          {(property.estimated_road_distance_km ?? property.work_distance_km) != null && (
            <p className="-mt-2 mb-4 flex items-center gap-1.5 text-xs font-semibold text-[#176B87]" title="Estimativa matemática de percurso urbano; não usa trânsito ao vivo">
              <MapPinned size={13} />≈ {Number(property.estimated_road_distance_km ?? property.work_distance_km).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km do trabalho
              {property.estimated_commute_minutes != null && <span className="font-normal text-slate-400">· ~{property.estimated_commute_minutes} min</span>}
            </p>
          )}

          <div className="mb-4 flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2 border-y border-[#e8eeee] py-2.5 text-xs text-slate-600">
            {area ? <span className="flex items-center gap-1"><Ruler size={13} />{Math.round(area)} m²</span> : null}
            {property.bedrooms != null ? <span className="flex items-center gap-1"><Bed size={13} />{property.bedrooms}</span> : null}
            {property.bathrooms != null ? <span className="flex items-center gap-1"><Bath size={13} />{property.bathrooms}</span> : null}
            {property.parking_spots ? <span className="flex items-center gap-1"><Car size={13} />{property.parking_spots}</span> : null}
            {!area && property.bedrooms == null && property.bathrooms == null && (
              <span className="text-slate-400">Características ainda não estruturadas</span>
            )}
          </div>

          <div className="mt-auto flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xl font-semibold tracking-tight text-[#163447]">{money(property.auction_price)}</p>
              <AuctionJourney property={property} className="mt-2" />
            </div>
            {property.discount_pct != null && property.discount_pct > 0 && (
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 font-mono text-sm font-semibold text-[#176B87]"><TrendingDown size={14} />{property.discount_pct.toFixed(0)}%</p>
                <p className="text-[11px] text-slate-500">vs. avaliação</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {property.is_occupied && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800"><AlertTriangle size={12} />Ocupado</span>
            )}
            {days != null && days >= 0 && (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600"><CalendarDays size={12} />{days === 0 ? 'Prazo hoje' : `${days} dias`}</span>
            )}
            {documentTags.map(tag => (
              <span key={tag} className="rounded-full bg-[#edf8f5] px-2.5 py-1 font-semibold text-[#126252]">{tag}</span>
            ))}
            <span className="ml-auto flex items-center gap-1 text-slate-500" title="Completude dos dados recebidos">
              <CircleDot size={12} />{property.data_quality_score ?? '—'}% dos dados
            </span>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-3 border-t border-[#e4ecec] bg-white p-1.5">
        <a href={googleAddressSearchUrl(property)} target="_blank" rel="noopener noreferrer" className="flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-[#176B87] transition hover:bg-[#eef6f6]" aria-label="Pesquisar endereço no Google"><MapPinned size={15} />Google</a>
        <button type="button" onClick={onApprove} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${isFavorite ? 'bg-[#e4f4ef] text-[#126252]' : 'text-slate-500 hover:bg-[#edf8f5] hover:text-[#126252]'}`}><ThumbsUp size={15} fill={isFavorite ? 'currentColor' : 'none'} />{isFavorite ? 'Aprovado' : 'Aprovar'}</button>
        <button type="button" onClick={onReject} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition ${isRejected ? 'bg-[#fff0f1] text-[#B33A48]' : 'text-slate-500 hover:bg-[#fff0f1] hover:text-[#B33A48]'}`}><ThumbsDown size={15} fill={isRejected ? 'currentColor' : 'none'} />{isRejected ? 'Reprovado' : 'Reprovar'}</button>
      </div>
    </article>
  )
}
