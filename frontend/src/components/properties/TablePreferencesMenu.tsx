import { useEffect, useRef, useState } from 'react'
import { Check, Columns3, Rows3, X } from 'lucide-react'
import {
  COLUMN_LABELS, DEFAULT_COLUMNS, OpportunityColumn, OpportunityTablePreferences,
} from '../../lib/opportunityTable'

interface Props {
  preferences: OpportunityTablePreferences
  onChange: (preferences: OpportunityTablePreferences) => void
}

export default function TablePreferencesMenu({ preferences, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const toggleColumn = (column: OpportunityColumn) => {
    const visible = preferences.columns.includes(column)
    if (visible && preferences.columns.length <= 4) return
    onChange({ ...preferences, columns: visible ? preferences.columns.filter(item => item !== column) : [...preferences.columns, column] })
  }

  return (
    <div ref={root} className="relative hidden xl:block">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex h-10 items-center gap-2 rounded-lg border border-[#cddcdd] bg-white px-3 text-xs font-bold text-[#163447] transition hover:border-[#176B87]">
        <Columns3 size={14} /> Colunas
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-[#cbdadb] bg-white p-4 shadow-[0_20px_60px_rgba(22,52,71,.18)]">
          <div className="mb-4 flex items-start justify-between">
            <div><p className="font-bold text-[#163447]">Organizar mesa</p><p className="text-xs text-slate-500">Escolha ao menos quatro indicadores.</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(COLUMN_LABELS) as OpportunityColumn[]).map(column => {
              const visible = preferences.columns.includes(column)
              return (
                <button type="button" key={column} onClick={() => toggleColumn(column)} className={`flex min-h-9 items-center gap-2 rounded-lg border px-2.5 text-left text-[11px] font-semibold transition ${visible ? 'border-[#a9cbcd] bg-[#edf6f6] text-[#176B87]' : 'border-slate-200 text-slate-500 hover:border-[#a9cbcd]'}`}>
                  <span className={`grid h-4 w-4 place-items-center rounded border ${visible ? 'border-[#176B87] bg-[#176B87] text-white' : 'border-slate-300'}`}>{visible && <Check size={10} />}</span>
                  {COLUMN_LABELS[column]}
                </button>
              )
            })}
          </div>
          <div className="mt-4 border-t border-[#e3ebeb] pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Rows3 size={12} />Densidade</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['compact', 'comfortable'] as const).map(density => <button type="button" key={density} onClick={() => onChange({ ...preferences, density })} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${preferences.density === density ? 'border-[#176B87] bg-[#176B87] text-white' : 'border-slate-200 text-slate-500'}`}>{density === 'compact' ? 'Compacta' : 'Confortável'}</button>)}
            </div>
          </div>
          <button type="button" onClick={() => onChange({ version: 4, columns: DEFAULT_COLUMNS, density: 'compact' })} className="mt-3 text-xs font-bold text-[#176B87]">Restaurar padrão</button>
        </div>
      )}
    </div>
  )
}
