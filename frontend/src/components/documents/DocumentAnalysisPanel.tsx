import { AlertTriangle, CheckCircle2, FileSearch, FileText, RefreshCw, ShieldQuestion, WalletCards } from 'lucide-react'
import type { DocumentAnalysisRecord, DocumentFindingStatus } from '../../lib/api'

interface Props {
  record?: DocumentAnalysisRecord | null
  isLoading: boolean
  isRequesting: boolean
  requestError?: string | null
  canAnalyze: boolean
  onAnalyze: (force?: boolean) => void
}
const statusConfig: Record<DocumentFindingStatus, { label: string; className: string }> = {
  allowed: { label: 'Permitido', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  conditional: { label: 'Com condições', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  not_allowed: { label: 'Não permitido', className: 'bg-red-50 text-red-800 border-red-200' },
  not_found: { label: 'Não informado', className: 'bg-slate-50 text-slate-600 border-slate-200' },
}

function Finding({ label, status, note }: { label: string; status: DocumentFindingStatus; note: string }) {
  const config = statusConfig[status]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${config.className}`}>{config.label}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{note}</p>
    </div>
  )
}

export default function DocumentAnalysisPanel({ record, isLoading, isRequesting, requestError, canAnalyze, onAnalyze }: Props) {
  const status = record?.status ?? 'not_started'
  const analysis = record?.analysis

  return (
    <section aria-labelledby="document-analysis-heading" className="overflow-hidden rounded-2xl border border-[#cfe0e1] bg-[#f6faf9] shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#d8e7e5] bg-[#eaf4f2] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#176B87] text-white"><FileSearch size={18} /></div>
          <div>
            <h2 id="document-analysis-heading" className="font-display text-base font-bold text-[#163447]">Leitura das condições oficiais</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">FGTS, financiamento e responsabilidades extraídos somente após você selecionar o imóvel.</p>
          </div>
        </div>
        {(status === 'not_started' || status === 'error') && (
          <button
            type="button"
            onClick={() => onAnalyze(status === 'error')}
            disabled={!canAnalyze || isRequesting}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#163447] px-4 text-sm font-bold text-white transition hover:bg-[#0f293a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText size={15} />{isRequesting ? 'Iniciando leitura…' : 'Ler condições oficiais'}
          </button>
        )}
        {status === 'done' && (
          <button type="button" onClick={() => onAnalyze(true)} disabled={isRequesting} className="flex min-h-10 items-center gap-2 rounded-lg border border-[#b9cecc] bg-white px-3 text-xs font-bold text-[#176B87] disabled:opacity-50"><RefreshCw size={13} />Atualizar leitura</button>
        )}
      </div>

      <div className="p-5">
        {(isLoading || status === 'processing') && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-[#d5e4e3] bg-white p-5 text-sm text-slate-600">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#9bb8bd] border-t-[#176B87]" />
            Consultando e estruturando somente os trechos relevantes…
          </div>
        )}

        {status === 'not_started' && !isLoading && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-semibold text-[#163447]">Nenhum token foi gasto neste imóvel.</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">A leitura acontece sob demanda e fica armazenada para não processar novamente o mesmo conteúdo.</p>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-500"><WalletCards size={14} />Custo controlado</span>
          </div>
        )}

        {status === 'unavailable' && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={17} className="mt-0.5 flex-shrink-0" />A página oficial informa que o imóvel não está mais disponível.</div>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle size={17} className="mt-0.5 flex-shrink-0" /><span>{record?.error_message || requestError || 'Não foi possível ler a fonte oficial.'}</span></div>
        )}

        {requestError && status !== 'error' && <p className="mt-3 text-xs font-semibold text-red-700">{requestError}</p>}

        {status === 'done' && analysis && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {(record.tags ?? []).map(tag => <span key={tag} className="rounded-full border border-[#b9dcd5] bg-white px-3 py-1.5 text-xs font-bold text-[#126252]">{tag}</span>)}
            </div>

            <p className="text-sm leading-relaxed text-slate-700">{analysis.summary}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Finding label="FGTS" status={analysis.fgts.status} note={analysis.fgts.note} />
              <Finding label="Financiamento" status={analysis.financing.status} note={analysis.financing.note} />
              <Finding label="Condomínio" status={analysis.condominium_debt.status} note={analysis.condominium_debt.responsibility} />
              <Finding label="Tributos" status={analysis.tax_debt.status} note={analysis.tax_debt.responsibility} />
            </div>

            {analysis.payment_methods.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Formas de pagamento encontradas</p>
                <div className="mt-2 flex flex-wrap gap-2">{analysis.payment_methods.map(method => <span key={method} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm">{method}</span>)}</div>
              </div>
            )}

            {analysis.risks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pontos de atenção</p>
                {analysis.risks.map((risk, index) => (
                  <div key={`${risk.title}-${index}`} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                    <div><p className="font-bold">{risk.title}</p><p className="mt-1 leading-relaxed">{risk.detail}</p></div>
                  </div>
                ))}
              </div>
            )}

            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-xs font-bold text-[#176B87]">Ver trechos usados como evidência</summary>
              <div className="mt-3 space-y-3">
                {(record.evidence ?? []).map((item, index) => (
                  <blockquote key={`${item.field}-${index}`} className="border-l-2 border-[#8bbec2] pl-3 text-xs leading-relaxed text-slate-600">{item.excerpt}</blockquote>
                ))}
              </div>
            </details>

            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              {analysis.confidence === 'high' ? <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-emerald-600" /> : <ShieldQuestion size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />}
              Confiança {analysis.confidence === 'high' ? 'alta' : analysis.confidence === 'medium' ? 'média' : 'baixa'}. A fonte oficial e a matrícula continuam sendo a referência final.
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
