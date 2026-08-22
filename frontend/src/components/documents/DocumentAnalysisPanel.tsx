import { useState } from 'react'
import {
  AlertTriangle, CheckCircle2, FileSearch, FileText, RefreshCw,
  WalletCards, Landmark, HelpCircle, FileWarning, Scale, FileCheck2, FileX2,
} from 'lucide-react'
import type { DocumentAnalysisRecord, Liability, PaymentRule } from '../../lib/api'
import { usePropertyAiUsage } from '../../hooks/useProperties'

interface Props {
  record?: DocumentAnalysisRecord | null
  isLoading: boolean
  isRequesting: boolean
  requestError?: string | null
  canAnalyze: boolean
  onAnalyze: (force?: boolean) => void
}

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const LIABILITY_LABELS: Record<string, string> = {
  condominio: 'Condomínio', iptu: 'IPTU', tributos_municipais: 'Tributos municipais',
  hipoteca: 'Hipoteca', penhora: 'Penhora', alienacao_fiduciaria: 'Alienação fiduciária',
  usufruto: 'Usufruto', acao_judicial: 'Ação judicial', comissao_leiloeiro: 'Comissão do leiloeiro',
  itbi: 'ITBI', registro: 'Registro em cartório', desocupacao: 'Desocupação', outros: 'Outros',
}

const PAYMENT_RULE_LABELS = { fgts: 'FGTS', financiamento: 'Financiamento', consorcio: 'Consórcio' } as const

function LiabilityLine({ liability }: { liability: Liability }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#163447]">{LIABILITY_LABELS[liability.kind] ?? liability.label}</p>
          <p className="truncate text-xs text-slate-500">{liability.label}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {liability.amount_brl != null && <span className="text-sm font-bold text-[#163447]">{formatBRL(liability.amount_brl)}</span>}
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${liability.payer_confidence === 'high' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : liability.payer_confidence === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            {liability.payer_confidence === 'high' ? 'confirmado' : liability.payer_confidence === 'medium' ? 'provável' : 'a confirmar'}
          </span>
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
          <p>{liability.amount_note}</p>
          <blockquote className="border-l-2 border-[#8bbec2] pl-2 italic leading-relaxed text-slate-500">"{liability.basis_quote}"</blockquote>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">{liability.source_document_type} · {new URL(liability.source_url).hostname}</p>
        </div>
      )}
    </div>
  )
}

function PayerGroup({ title, icon, tone, liabilities, emptyLabel }: {
  title: string; icon: React.ReactNode; tone: 'red' | 'green' | 'gray'; liabilities: Liability[]; emptyLabel: string
}) {
  const toneClasses = {
    red: 'border-red-200 bg-red-50', green: 'border-emerald-200 bg-emerald-50', gray: 'border-slate-200 bg-slate-50',
  }[tone]
  const total = liabilities.filter(l => l.amount_brl != null).reduce((sum, l) => sum + (l.amount_brl as number), 0)
  return (
    <div className={`rounded-xl border p-4 ${toneClasses}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-[#163447]">{icon}{title}</div>
        {tone === 'red' && total > 0 && <span className="text-base font-black text-red-700">{formatBRL(total)}</span>}
      </div>
      {liabilities.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-3 space-y-2">{liabilities.map((l, i) => <LiabilityLine key={`${l.kind}-${i}`} liability={l} />)}</div>
      )}
    </div>
  )
}

function PaymentRuleChip({ label, rule }: { label: string; rule: PaymentRule }) {
  if (!rule.applicable) return null
  const config = {
    allowed: { text: 'Aceito', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    conditional: { text: 'Com condições', className: 'border-amber-200 bg-amber-50 text-amber-800' },
    not_allowed: { text: 'Não aceito', className: 'border-red-200 bg-red-50 text-red-800' },
    not_found: { text: 'Não informado', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  }[rule.status]
  return (
    <div className={`rounded-xl border p-3 ${config.className}`}>
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide">{label}</p><span className="text-[10px] font-bold">{config.text}</span></div>
      <p className="mt-1 text-xs leading-relaxed">{rule.note}</p>
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  discovering: 'Localizando documentos oficiais…',
  reading: 'Lendo os documentos…',
  classifying: 'Classificando ônus e responsabilidades…',
  consolidating: 'Consolidando o resultado…',
}

export default function DocumentAnalysisPanel({ record, isLoading, isRequesting, requestError, canAnalyze, onAnalyze }: Props) {
  const status = record?.status ?? 'not_started'
  const showCost = status === 'done' || status === 'processing'
  const { data: usage } = usePropertyAiUsage(record?.property_id ?? '', showCost)
  const isLegacyShape = status === 'done' && (record?.liabilities?.length ?? 0) === 0 && !record?.documents_read?.length && Boolean(record?.analysis)

  const liabilities = record?.liabilities ?? []
  const arrematante = liabilities.filter(l => l.payer === 'arrematante')
  const subRogado = liabilities.filter(l => l.payer === 'sub_rogado_no_preco' || l.payer === 'vendedor')
  const indefinido = liabilities.filter(l => l.payer === 'indefinido')

  return (
    <section aria-labelledby="document-analysis-heading" className="overflow-hidden rounded-2xl border border-[#cfe0e1] bg-[#f6faf9] shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#d8e7e5] bg-[#eaf4f2] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#176B87] text-white"><FileSearch size={18} /></div>
          <div>
            <h2 id="document-analysis-heading" className="font-display text-base font-bold text-[#163447]">Leitura das condições oficiais</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Edital, matrícula e laudo de avaliação lidos por IA — quem paga cada dívida fica destacado abaixo.</p>
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
        {(status === 'done' || isLegacyShape) && (
          <button type="button" onClick={() => onAnalyze(true)} disabled={isRequesting} className="flex min-h-10 items-center gap-2 rounded-lg border border-[#b9cecc] bg-white px-3 text-xs font-bold text-[#176B87] disabled:opacity-50"><RefreshCw size={13} />Atualizar leitura</button>
        )}
      </div>

      <div className="p-5">
        {(isLoading || status === 'processing') && (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-[#d5e4e3] bg-white p-5 text-sm text-slate-600">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#9bb8bd] border-t-[#176B87]" />
            <div>
              <p className="font-semibold text-[#163447]">{(record?.stage && STAGE_LABELS[record.stage]) ?? 'Consultando as fontes oficiais…'}</p>
              {record?.stage_detail && <p className="mt-0.5 text-xs text-slate-500">{record.stage_detail}</p>}
            </div>
          </div>
        )}

        {status === 'not_started' && !isLoading && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-sm font-semibold text-[#163447]">Nenhum documento foi lido ainda para este imóvel.</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">A leitura lê edital, matrícula e laudo com 3 agentes de IA especializados — custa alguns centavos e fica salva, não processa de novo o mesmo conteúdo.</p>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-500"><WalletCards size={14} />~R$ 0,10–0,30 por leitura</span>
          </div>
        )}

        {status === 'unavailable' && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={17} className="mt-0.5 flex-shrink-0" />A página oficial informa que o imóvel não está mais disponível.</div>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle size={17} className="mt-0.5 flex-shrink-0" /><span>{record?.error_message || requestError || 'Não foi possível ler a fonte oficial.'}</span></div>
        )}

        {requestError && status !== 'error' && <p className="mt-3 text-xs font-semibold text-red-700">{requestError}</p>}

        {isLegacyShape && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <FileWarning size={17} className="mt-0.5 flex-shrink-0 text-slate-400" />
            <span>Esta leitura foi feita numa versão anterior, mais superficial. Clique em <strong>Atualizar leitura</strong> para uma diligência completa com matrícula, laudo e classificação de quem paga cada dívida.</span>
          </div>
        )}

        {status === 'done' && !isLegacyShape && (
          <div className="space-y-5">
            <div className={`rounded-xl border p-4 text-sm ${record!.decision_status === 'ready_for_final_review' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : record!.decision_status === 'blocked' ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
              <p className="font-bold">{record!.decision_status === 'ready_for_final_review' ? 'Diligência documental pronta para revisão final' : record!.decision_status === 'blocked' ? 'Documento bloqueado para decisão' : 'Diligência pendente — não dar lance com base neste resultado'}</p>
              <p className="mt-1 text-xs leading-relaxed">Identidade: {record!.identity_match ?? 'não verificada'} · Completude: {record!.completeness_score ?? 0}/100</p>
              {(record!.blocking_issues ?? []).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{record!.blocking_issues?.map(issue => <li key={issue}>{issue}</li>)}</ul>}
            </div>

            <div className="flex flex-wrap gap-2">
              {(record!.tags ?? []).map(tag => <span key={tag} className="rounded-full border border-[#b9dcd5] bg-white px-3 py-1.5 text-xs font-bold text-[#126252]">{tag}</span>)}
            </div>

            {record!.analysis?.summary && <p className="text-sm leading-relaxed text-slate-700">{record!.analysis.summary}</p>}

            {/* Quem paga o quê — o ponto central da diligência */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Quem paga o quê</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <PayerGroup title="Você paga (arrematante)" icon={<Landmark size={15} className="text-red-700" />} tone="red" liabilities={arrematante} emptyLabel="Nenhum ônus atribuído a você nesta leitura." />
                <PayerGroup title="Quitado / sub-rogado no preço" icon={<FileCheck2 size={15} className="text-emerald-700" />} tone="green" liabilities={subRogado} emptyLabel="Nenhum ônus quitado ou sub-rogado identificado." />
                <PayerGroup title="Indefinido — confirmar antes do lance" icon={<HelpCircle size={15} className="text-slate-500" />} tone="gray" liabilities={indefinido} emptyLabel="Nenhum ônus com responsabilidade indefinida." />
              </div>
            </div>

            {/* Documentos lidos */}
            {(record!.documents_read ?? []).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Documentos lidos</p>
                <div className="flex flex-wrap gap-2">
                  {record!.documents_read!.map((doc, i) => (
                    <span key={`${doc.url}-${i}`} title={doc.url} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${doc.readOk ? 'border-slate-200 bg-white text-slate-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                      {doc.readOk ? <FileCheck2 size={13} /> : <FileX2 size={13} />}
                      {doc.type} {doc.readOk ? `(${doc.factCount} fatos)` : '— falhou'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Regras de pagamento — só as aplicáveis */}
            {record!.payment_rules && Object.values(record!.payment_rules).some(r => r.applicable) && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Formas de pagamento</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(Object.entries(PAYMENT_RULE_LABELS) as Array<[keyof typeof PAYMENT_RULE_LABELS, string]>).map(([key, label]) => (
                    <PaymentRuleChip key={key} label={label} rule={record!.payment_rules![key]} />
                  ))}
                </div>
              </div>
            )}

            {/* Conflitos entre documentos */}
            {(record!.conflicts ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700"><Scale size={13} />Conflito entre documentos</p>
                {record!.conflicts!.map((c, i) => (
                  <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <p className="font-bold">{c.topic}</p>
                    <p className="mt-1 leading-relaxed">{c.description}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Riscos */}
            {(record!.analysis?.risks ?? []).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Pontos de atenção</p>
                {(record!.analysis!.risks as Array<{ severity: string; title: string; detail: string; source_url?: string | null }>)
                  .map((risk, index) => (
                    <div key={`${risk.title}-${index}`} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                      <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                      <div><p className="font-bold">{risk.title}</p><p className="mt-1 leading-relaxed">{risk.detail}</p></div>
                    </div>
                  ))}
              </div>
            )}

            <details className="rounded-xl border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer text-xs font-bold text-[#176B87]">Ver trechos usados como evidência ({(record!.evidence ?? []).length})</summary>
              <div className="mt-3 space-y-3">
                {(record!.evidence ?? []).map((item, index) => (
                  <blockquote key={`${item.field}-${index}`} className="border-l-2 border-[#8bbec2] pl-3 text-xs leading-relaxed text-slate-600">
                    <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-[#176B87]">{item.field}</span>
                    "{item.excerpt}"
                  </blockquote>
                ))}
              </div>
            </details>

            <div className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0 text-emerald-600" />
              Toda dívida acima traz o trecho literal do documento que a sustenta. A fonte oficial e a matrícula continuam sendo a referência final.
            </div>
          </div>
        )}

        {showCost && usage && usage.total.calls > 0 && (
          <details className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-[#176B87]">
              <span className="flex items-center gap-1.5"><WalletCards size={13} />Custo desta leitura: {formatBRL(usage.total.cost_brl)}</span>
              <span className="font-normal text-slate-400">{usage.total.calls} chamada(s) · {(usage.total.input_tokens + usage.total.output_tokens).toLocaleString('pt-BR')} tokens</span>
            </summary>
            <div className="mt-3 space-y-1.5">
              {usage.events.slice(0, 12).map(ev => (
                <div key={ev.id} className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>{ev.stage ?? ev.feature} <span className="text-slate-400">· {ev.model}</span></span>
                  <span>{formatBRL(ev.cost_brl)} <span className="text-slate-400">({(ev.input_tokens + ev.output_tokens).toLocaleString('pt-BR')} tok)</span></span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
