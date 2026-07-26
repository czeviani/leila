import { memo } from 'react'
import {
  MapPin, Ruler, TrendingDown, ExternalLink, AlertTriangle,
  Check, Sparkles, ShoppingCart, Gavel, Users, Mail, Tag,
  Bed, Bath, Car, X,
} from 'lucide-react'
import { Property } from '../../lib/api'
import { getHeatInfo, daysUntilAuction } from '../../lib/heatScore'

// ── Configs ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  apartamento: 'Apto', casa: 'Casa', terreno: 'Terreno',
  loja: 'Loja', galpão: 'Galpão', sala: 'Sala',
  sobrado: 'Sobrado', prédio: 'Prédio',
}

const MODALITY_SHORT: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  compra_direta:    { label: 'Direto', icon: ShoppingCart, color: 'text-emerald-700', bg: 'bg-emerald-50' },
  segunda_praca:    { label: '2ª Praça', icon: Tag,          color: 'text-sky-700',     bg: 'bg-sky-50'     },
  leilao_online:    { label: 'Online',  icon: Gavel,        color: 'text-blue-700',    bg: 'bg-blue-50'    },
  primeira_praca:   { label: '1ª Praça', icon: Users,       color: 'text-amber-700',   bg: 'bg-amber-50'   },
  proposta_fechada: { label: 'Proposta', icon: Mail,         color: 'text-violet-700',  bg: 'bg-violet-50'  },
}

const AREA_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  nobre:         { label: 'Nobre',   color: 'text-violet-600', dot: 'bg-violet-500' },
  'intermediário': { label: 'Inter.', color: 'text-blue-600',   dot: 'bg-blue-500'   },
  popular:       { label: 'Popular', color: 'text-amber-600',  dot: 'bg-amber-500'  },
  comunidade:    { label: 'Comun.', color: 'text-red-500',    dot: 'bg-red-500'    },
}

const REC_LABELS: Record<string, string> = {
  strong_buy: 'Ótimo', consider: 'Bom', risky: 'Risco', avoid: 'Evitar',
}
const REC_COLORS: Record<string, string> = {
  strong_buy: 'text-emerald-600', consider: 'text-blue-600', risky: 'text-amber-600', avoid: 'text-red-500',
}

function discountColor(pct: number): string {
  if (pct >= 40) return 'text-emerald-700 bg-emerald-100'
  if (pct >= 25) return 'text-sky-700 bg-sky-100'
  if (pct >= 10) return 'text-amber-700 bg-amber-100'
  return 'text-slate-600 bg-slate-100'
}

function leftBarColor(score: number): string {
  if (score >= 60) return 'bg-orange-400'
  if (score >= 40) return 'bg-amber-400'
  if (score >= 20) return 'bg-blue-300'
  return 'bg-slate-200'
}

function fmtCompact(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}k`
  return `R$ ${v.toFixed(0)}`
}

// ── Urgency badge ─────────────────────────────────────────────────────────────

function UrgencyBadge({ auctionDate }: { auctionDate: string | null }) {
  const days = daysUntilAuction(auctionDate)
  if (days === null) return null
  if (days < 0) return <span className="text-[10px] text-slate-400 whitespace-nowrap">Encerrado</span>
  if (days === 0) return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
      <AlertTriangle size={9} /> Hoje
    </span>
  )
  if (days <= 3) return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
      <AlertTriangle size={9} /> {days}d
    </span>
  )
  if (days <= 7) return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
      {days}d
    </span>
  )
  if (days <= 30) return (
    <span className="text-[10px] text-slate-500 whitespace-nowrap">{days}d</span>
  )
  return (
    <span className="text-[10px] text-slate-400 whitespace-nowrap">
      {new Date(auctionDate!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
    </span>
  )
}

// ── PropertyRow ───────────────────────────────────────────────────────────────

interface Props {
  property: Property
  isFavorite: boolean
  onToggleFavorite: () => void
  onDismiss: () => void
  onClick: () => void
}

export default memo(function PropertyRow({ property, isFavorite, onToggleFavorite, onDismiss, onClick }: Props) {
  const heat = getHeatInfo(property)
  const evaluation = property.leila_evaluations
  const modConf = property.auction_modality ? MODALITY_SHORT[property.auction_modality] : null
  const typeLabel = property.property_type ? (TYPE_LABELS[property.property_type] ?? property.property_type) : null
  const displayArea = property.useful_area_m2 ?? property.area_m2
  const pricePerM2 = displayArea && displayArea > 0 ? property.auction_price / displayArea : null
  const effectiveArea = evaluation?.area_classification ?? property.area_classification
  const areaConf = effectiveArea && effectiveArea !== 'indefinido' ? AREA_CONFIG[effectiveArea] : null

  return (
    <div
      className="group relative flex items-center bg-white dark:bg-[#15181e] border-0 hover:bg-slate-50/50 dark:hover:bg-white/[0.03] transition-all duration-150 cursor-pointer"
      onClick={onClick}
    >
      {/* Left heat bar */}
      <div className={`w-1 self-stretch flex-shrink-0 ${leftBarColor(heat.score)}`} />

      {/* Heat score badge */}
      <div className="flex-shrink-0 w-14 flex flex-col items-center justify-center px-2 py-3 border-r border-slate-100 dark:border-slate-800/80 dark:border-slate-800/80">
        <span className="text-base leading-none">{heat.shortLabel}</span>
        <span className="text-[9px] font-bold text-slate-400 mt-0.5">{heat.score}</span>
      </div>

      {/* Discount */}
      <div className="flex-shrink-0 w-16 px-2 py-3 flex items-center justify-center border-r border-slate-100 dark:border-slate-800/80">
        {property.discount_pct != null && property.discount_pct > 0 ? (
          <span className={`flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-md ${discountColor(property.discount_pct)}`}>
            <TrendingDown size={10} />
            -{property.discount_pct.toFixed(0)}%
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">S/desc.</span>
        )}
      </div>

      {/* Type + Modality + Occupied */}
      <div className="flex-shrink-0 w-28 px-2 py-3 flex flex-col gap-1 border-r border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-1 flex-wrap">
          {typeLabel && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md">{typeLabel}</span>
          )}
          {property.is_occupied && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 bg-red-100 text-red-700 rounded border border-red-200">
              <AlertTriangle size={8} />OCP
            </span>
          )}
        </div>
        {modConf && (() => {
          const Icon = modConf.icon
          return (
            <span className={`flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md w-fit ${modConf.bg} ${modConf.color}`}>
              <Icon size={9} />
              {modConf.label}
            </span>
          )
        })()}
      </div>

      {/* Location */}
      <div className="flex-shrink-0 w-36 px-3 py-3 border-r border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
          <MapPin size={10} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />
          <span className="truncate">{[property.city, property.state].filter(Boolean).join(' — ')}</span>
        </div>
        {areaConf && (
          <div className={`flex items-center gap-1 mt-0.5 text-[10px] font-semibold ${areaConf.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${areaConf.dot}`} />
            {areaConf.label}
          </div>
        )}
      </div>

      {/* Title — flex grows */}
      <div className="flex-1 min-w-0 px-3 py-3 border-r border-slate-100 dark:border-slate-800/80">
        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate">{property.title}</p>
        {/* Metrics inline */}
        <div className="flex items-center gap-2 mt-0.5">
          {property.bedrooms != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <Bed size={9} />{property.bedrooms}
            </span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <Bath size={9} />{property.bathrooms}
            </span>
          )}
          {property.parking_spots != null && property.parking_spots > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <Car size={9} />{property.parking_spots}
            </span>
          )}
          {displayArea != null && displayArea > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
              <Ruler size={9} />{Math.round(displayArea)}m²
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="flex-shrink-0 w-32 px-3 py-3 border-r border-slate-100 dark:border-slate-800/80 text-right">
        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight num">{fmtCompact(property.auction_price)}</p>
        {pricePerM2 && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 num">{fmtCompact(pricePerM2)}/m²</p>
        )}
      </div>

      {/* Urgency */}
      <div className="flex-shrink-0 w-16 px-2 py-3 flex items-center justify-center border-r border-slate-100 dark:border-slate-800/80">
        <UrgencyBadge auctionDate={property.auction_date} />
      </div>

      {/* AI evaluation */}
      <div className="flex-shrink-0 w-20 px-2 py-3 border-r border-slate-100 dark:border-slate-800/80 flex flex-col items-center justify-center">
        {evaluation?.status === 'done' && evaluation.score != null ? (
          <>
            <span className={`text-sm font-bold num ${
              evaluation.score >= 7.5 ? 'text-emerald-600 dark:text-emerald-400' : evaluation.score >= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'
            }`}>
              {evaluation.score.toFixed(1)}
            </span>
            {evaluation.recommendation && (
              <span className={`text-[9px] font-semibold ${REC_COLORS[evaluation.recommendation] ?? 'text-slate-400'}`}>
                {REC_LABELS[evaluation.recommendation]}
              </span>
            )}
          </>
        ) : evaluation?.status === 'processing' ? (
          <span className="w-3 h-3 border border-slate-300 dark:border-slate-600 border-t-slate-500 dark:border-t-slate-400 rounded-full animate-spin" />
        ) : (
          <span className="text-[10px] text-slate-300 dark:text-slate-700">—</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-3">
        {/* Edital link */}
        {property.edital_url && (
          <a
            href={property.edital_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="Abrir edital"
          >
            <ExternalLink size={12} />
          </a>
        )}

        {/* Favoritar / Avaliar */}
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite() }}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-150 ${
            isFavorite
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
          title={isFavorite ? 'Selecionado para avaliação' : 'Selecionar para avaliação IA'}
        >
          {isFavorite ? <Check size={11} /> : <Sparkles size={11} />}
        </button>

        {/* Descartar */}
        <button
          onClick={e => { e.stopPropagation(); onDismiss() }}
          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
          title="Descartar imóvel"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
})
