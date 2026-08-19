import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, Check, Heart, MapPin, Scale, Sparkles, X } from 'lucide-react'
import { Property } from '../../lib/api'
import {
  confidenceLabel, effectiveArea, effectivePricePerM2, neighborhoodInsight,
  neighborhoodName, opportunityFactors, opportunityScore,
} from '../../lib/opportunityTable'
import SourceBadge from './SourceBadge'

const money = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

const findingLabel = (status?: string) => ({
  allowed: 'Permitido', conditional: 'Com condições', not_allowed: 'Não permitido', not_found: 'Não informado',
}[status ?? ''] ?? 'Não analisado')

interface Props {
  properties: Property[]
  favoriteIds: Set<string>
  onRemove: (id: string) => void
  onClear: () => void
  onOpenProperty: (id: string) => void
  onToggleFavorite: (property: Property) => void
}

export default function ComparisonTray({ properties, favoriteIds, onRemove, onClear, onOpenProperty, onToggleFavorite }: Props) {
  if (!properties.length) return null

  const metric = (values: Array<number | null>, direction: 'min' | 'max') => {
    const valid = values.filter((value): value is number => value != null && Number.isFinite(value))
    return valid.length ? (direction === 'min' ? Math.min(...valid) : Math.max(...valid)) : null
  }
  const best = {
    score: metric(properties.map(opportunityScore), 'max'),
    price: metric(properties.map(property => property.auction_price), 'min'),
    area: metric(properties.map(effectiveArea), 'max'),
    sqm: metric(properties.map(effectivePricePerM2), 'min'),
    discount: metric(properties.map(property => property.discount_pct), 'max'),
    neighborhood: metric(properties.map(property => neighborhoodInsight(property).score), 'max'),
  }

  return (
    <Dialog.Root>
      <div className="fixed bottom-4 left-1/2 z-40 hidden w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#315365] bg-[#163447] p-3 text-white shadow-[0_24px_70px_rgba(7,29,40,.3)] xl:flex">
        <div className="flex-1">
          <p className="text-xs font-extrabold">{properties.length} de 4 imóveis na comparação</p>
          <div className="mt-1 flex gap-1.5">
            {properties.map(property => <span key={property.id} className="inline-flex max-w-[135px] items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px]"><span className="truncate">{neighborhoodName(property) ?? property.city ?? 'Imóvel'}</span><button type="button" onClick={() => onRemove(property.id)} aria-label="Remover da comparação" className="shrink-0 text-white/60 hover:text-white"><X size={10} /></button></span>)}
          </div>
        </div>
        <button type="button" onClick={onClear} className="rounded-lg px-3 py-2 text-xs font-bold text-white/65 hover:bg-white/10 hover:text-white">Limpar</button>
        <Dialog.Trigger asChild>
          <button type="button" disabled={properties.length < 2} className="flex min-h-10 items-center gap-2 rounded-xl bg-[#76d1ce] px-4 text-xs font-extrabold text-[#123242] transition hover:bg-[#92dedb] disabled:cursor-not-allowed disabled:opacity-45">Comparar lado a lado <ArrowRight size={14} /></button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#071d28]/70 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-4 z-50 overflow-hidden rounded-3xl border border-white/20 bg-[#f3f7f7] shadow-2xl focus:outline-none xl:inset-x-[4vw] xl:inset-y-[5vh]">
          <header className="flex items-start justify-between border-b border-[#d6e2e2] bg-white px-6 py-5">
            <div><Dialog.Title className="font-display text-2xl font-extrabold tracking-tight text-[#163447]">Comparação objetiva</Dialog.Title><Dialog.Description className="mt-1 text-sm text-slate-500">Os mesmos critérios, lado a lado. Ausência de dado continua visível.</Dialog.Description></div>
            <Dialog.Close className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Fechar comparação"><X size={18} /></Dialog.Close>
          </header>
          <div className="h-[calc(100%-89px)] overflow-auto p-5">
            <div className={`grid min-w-[900px] gap-3`} style={{ gridTemplateColumns: `150px repeat(${properties.length}, minmax(230px, 1fr))` }}>
              <CompareLabel label="Imóvel" />
              {properties.map(property => <div key={`${property.id}-head`} className="rounded-2xl border border-[#d5e2e2] bg-white p-4"><SourceBadge sourceId={property.source_id} sourceName={property.leila_sources?.name} compact /><h3 className="mt-2 line-clamp-2 font-bold text-[#163447]">{property.title}</h3><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} />{neighborhoodName(property) ?? property.city ?? 'Localização pendente'}</p></div>)}
              <CompareLabel label="Oportunidade" />
              {properties.map(property => { const score = opportunityScore(property); return <CompareValue key={`${property.id}-score`} emphasis best={score === best.score}><span>{score} <small>/ 100</small></span><span className="mt-1 block font-sans text-[10px] font-semibold text-slate-500">{opportunityFactors(property).join(' · ')}</span></CompareValue> })}
              <CompareLabel label="Melhor mínimo" />
              {properties.map(property => <CompareValue key={`${property.id}-price`} emphasis best={property.auction_price === best.price}>{money(property.auction_price)}</CompareValue>)}
              <CompareLabel label="Área" />
              {properties.map(property => { const area = effectiveArea(property); return <CompareValue key={`${property.id}-area`} best={area != null && area === best.area}>{area ? `${Math.round(area)} m²` : '—'}</CompareValue> })}
              <CompareLabel label="Preço por m²" />
              {properties.map(property => { const sqm = effectivePricePerM2(property); return <CompareValue key={`${property.id}-sqm`} best={sqm != null && sqm === best.sqm}>{money(sqm)}</CompareValue> })}
              <CompareLabel label="Desconto" />
              {properties.map(property => <CompareValue key={`${property.id}-discount`} best={property.discount_pct != null && property.discount_pct === best.discount}>{property.discount_pct != null ? `${property.discount_pct.toFixed(0)}%` : '—'}</CompareValue>)}
              <CompareLabel label="Bairro" />
              {properties.map(property => { const data = neighborhoodInsight(property); return <CompareValue key={`${property.id}-neighborhood`} best={data.score != null && data.score === best.neighborhood}>{data.score != null ? <span className="inline-flex items-center gap-2"><Scale size={14} />{data.score.toFixed(1)} · {confidenceLabel(data.confidence)}</span> : 'Dados insuficientes'}</CompareValue> })}
              <CompareLabel label="Ocupação" />
              {properties.map(property => <CompareValue key={`${property.id}-occupied`}>{property.is_occupied == null ? 'Não informada' : property.is_occupied ? 'Ocupado' : <span className="inline-flex items-center gap-1 text-[#167261]"><Check size={14} />Desocupado</span>}</CompareValue>)}
              <CompareLabel label="FGTS" />
              {properties.map(property => <CompareValue key={`${property.id}-fgts`}>{findingLabel(property.leila_document_analyses?.analysis?.fgts?.status)}</CompareValue>)}
              <CompareLabel label="Financiamento" />
              {properties.map(property => <CompareValue key={`${property.id}-financing`}>{findingLabel(property.leila_document_analyses?.analysis?.financing?.status)}</CompareValue>)}
              <CompareLabel label="Condomínio" />
              {properties.map(property => <CompareValue key={`${property.id}-condo`}>{findingLabel(property.leila_document_analyses?.analysis?.condominium_debt?.status)}</CompareValue>)}
              <CompareLabel label="Tributos" />
              {properties.map(property => <CompareValue key={`${property.id}-tax`}>{findingLabel(property.leila_document_analyses?.analysis?.tax_debt?.status)}</CompareValue>)}
              <CompareLabel label="Ações" />
              {properties.map(property => <div key={`${property.id}-actions`} className="flex gap-2 rounded-xl bg-white p-3"><button type="button" onClick={() => onToggleFavorite(property)} className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold ${favoriteIds.has(property.id) ? 'border-[#e3b7bd] bg-[#fff0f1] text-[#B33A48]' : 'border-slate-200 text-slate-600'}`}><Heart size={13} fill={favoriteIds.has(property.id) ? 'currentColor' : 'none'} />Favoritar</button><Dialog.Close asChild><button type="button" onClick={() => onOpenProperty(property.id)} className="rounded-lg bg-[#163447] px-3 py-2 text-xs font-bold text-white">Abrir</button></Dialog.Close></div>)}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function CompareLabel({ label }: { label: string }) {
  return <div className="flex items-center rounded-xl bg-[#e3eeee] px-4 py-3 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#53717b]">{label}</div>
}

function CompareValue({ children, emphasis, best }: { children: React.ReactNode; emphasis?: boolean; best?: boolean }) {
  return <div className={`relative rounded-xl border px-4 py-3 ${emphasis ? 'num text-lg font-bold text-[#163447]' : 'text-sm font-semibold text-slate-600'} ${best ? 'border-[#79bdb4] bg-[#edf8f5] text-[#126553]' : 'border-[#dce6e6] bg-white'}`}>{best && <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#d7efe9] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[#126553]"><Sparkles size={8} /> melhor</span>}{children}</div>
}
