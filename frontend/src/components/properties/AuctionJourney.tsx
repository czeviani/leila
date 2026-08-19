import { Check } from 'lucide-react'
import type { Property } from '../../lib/api'

type Stage = Property['auction_stages'][number]

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})

function stageDescription(stage: Stage, isCurrent: boolean, isTarget: boolean) {
  const parts = [stage.label ?? stage.stage]
  if (stage.price != null) parts.push(money(stage.price))
  if (stage.event_at) parts.push(new Date(stage.event_at).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }))
  if (isCurrent) parts.push('etapa atual')
  if (isTarget && !isCurrent) parts.push('melhor preço conhecido')
  if (stage.certainty === 'possible') parts.push('possibilidade, não garantida')
  return parts.join(' · ')
}

export default function AuctionJourney({ property, className = '' }: { property: Property; className?: string }) {
  const stages = property.auction_stages ?? []
  if (!stages.length) return null

  return (
    <div className={`flex items-center gap-1 ${className}`} aria-label="Etapas da oportunidade">
      {stages.map((stage, index) => {
        const isCurrent = property.auction_stage === stage.stage
        const isTarget = property.target_stage === stage.stage
        const isCompleted = stage.status === 'completed'
        const isPossible = stage.certainty === 'possible' || stage.status === 'possible'
        const description = stageDescription(stage, isCurrent, isTarget)
        return (
          <div key={`${stage.stage}-${index}`} className="flex items-center gap-1">
            {index > 0 && <span className={`h-px w-2 ${isPossible ? 'border-t border-dashed border-slate-300' : 'bg-slate-300'}`} aria-hidden="true" />}
            <span
              title={description}
              aria-label={description}
              className={`relative grid h-4 w-4 place-items-center rounded-[4px] text-[8px] font-extrabold transition-transform hover:scale-125 ${
                isPossible
                  ? 'border border-dashed border-slate-400 bg-white text-slate-400'
                  : isCurrent
                    ? 'border border-[#176B87] bg-[#176B87] text-white ring-2 ring-[#bce3e1]'
                    : isTarget
                      ? 'border border-[#C68A2D] bg-[#fff4df] text-[#8a5a12]'
                      : isCompleted
                        ? 'border border-slate-300 bg-slate-200 text-slate-500'
                        : 'border border-[#9eb8bd] bg-white text-[#176B87]'
              }`}
            >
              {isCompleted ? <Check size={9} strokeWidth={3} /> : isPossible ? '?' : stage.sequence ?? index + 1}
              {isTarget && !isCurrent && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#C68A2D]" aria-hidden="true" />}
            </span>
          </div>
        )
      })}
    </div>
  )
}
