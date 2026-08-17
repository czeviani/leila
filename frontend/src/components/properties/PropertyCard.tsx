import {
  AlertTriangle, ArrowUpRight, Bath, Bed, CalendarDays, Car, Check,
  CircleDot, MapPin, Ruler, Sparkles, TrendingDown,
} from 'lucide-react'
import { Property } from '../../lib/api'
import { daysUntilAuction } from '../../lib/heatScore'

interface Props {
  property: Property
  isFavorite: boolean
  onToggleFavorite: () => void
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
      <span className="hidden sm:inline text-slate-400">Fonte</span>
      <span className="h-px flex-1 bg-slate-200" />
      <span className="font-mono text-slate-500">{relativeDate(property.last_verified_at ?? property.last_seen_at ?? property.scraped_at)}</span>
    </div>
  )
}

export default function PropertyCard({ property, isFavorite, onToggleFavorite, onClick }: Props) {
  const area = property.useful_area_m2 ?? property.area_m2
  const days = daysUntilAuction(property.auction_date)
  const type = property.property_type ? (TYPE_LABELS[property.property_type] ?? property.property_type) : 'Imóvel'
  const modality = property.auction_modality ? MODALITY_LABELS[property.auction_modality] : null

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
              </div>
              <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#163447]">{property.title}</h2>
            </div>
            <ArrowUpRight className="mt-0.5 shrink-0 text-slate-300 transition group-hover:text-[#176B87]" size={18} />
          </div>

          <p className="mb-4 flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            <span className="truncate">{[property.city, property.state].filter(Boolean).join(' · ') || 'Localização não informada'}</span>
          </p>

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
              <p className="mb-1 text-xs text-slate-500">{property.auction_modality === 'compra_direta' ? 'Preço anunciado' : 'Lance a partir de'}</p>
              <p className="font-mono text-xl font-semibold tracking-tight text-[#163447]">{money(property.auction_price)}</p>
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
            <span className="ml-auto flex items-center gap-1 text-slate-500" title="Completude dos dados recebidos">
              <CircleDot size={12} />{property.data_quality_score ?? '—'}% dos dados
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onToggleFavorite}
        className={`flex min-h-11 items-center justify-center gap-2 border-t px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#176B87] ${
          isFavorite
            ? 'border-[#b9dcd5] bg-[#edf8f5] text-[#126252]'
            : 'border-[#e4ecec] bg-white text-[#176B87] hover:bg-[#f3f8f8]'
        }`}
      >
        {isFavorite ? <Check size={15} /> : <Sparkles size={15} />}
        {isFavorite ? 'Na lista de análise' : 'Adicionar à análise'}
      </button>
    </article>
  )
}
