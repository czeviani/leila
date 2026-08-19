import { Landmark } from 'lucide-react'

interface SourcePalette {
  bg: string
  border: string
  text: string
  dot: string
}

const SOURCE_PALETTES: SourcePalette[] = [
  { bg: 'bg-slate-100', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-800', dot: 'bg-cyan-600' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-800', dot: 'bg-violet-600' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800', dot: 'bg-pink-600' },
]

const KNOWN_SOURCES: Record<string, SourcePalette> = {
  caixa: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-600' },
  superbid: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-600' },
  sold: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', dot: 'bg-teal-600' },
  bb: { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-900', dot: 'bg-yellow-500' },
  santander: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', dot: 'bg-red-600' },
  itau: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500' },
  bradesco: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', dot: 'bg-rose-600' },
  mega: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-600' },
  zuk: { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-800', dot: 'bg-sky-600' },
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function sourcePalette(sourceId: string, sourceName?: string | null) {
  const identity = normalize(`${sourceId} ${sourceName ?? ''}`)
  const knownKey = Object.keys(KNOWN_SOURCES).find(key => identity.includes(key))
  if (knownKey) return KNOWN_SOURCES[knownKey]

  const hash = [...identity].reduce((total, character) => total + character.charCodeAt(0), 0)
  return SOURCE_PALETTES[hash % SOURCE_PALETTES.length]
}

interface Props {
  sourceId: string
  sourceName?: string | null
  compact?: boolean
  icon?: boolean
  className?: string
}

export default function SourceBadge({ sourceId, sourceName, compact = false, icon = false, className = '' }: Props) {
  const palette = sourcePalette(sourceId, sourceName)
  const label = sourceName || sourceId

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border font-bold ${palette.bg} ${palette.border} ${palette.text} ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'} ${className}`}
      title={`Fonte: ${label}`}
    >
      {icon ? <Landmark size={compact ? 10 : 12} className="shrink-0" /> : <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${palette.dot}`} />}
      <span className="truncate">{label}</span>
    </span>
  )
}
