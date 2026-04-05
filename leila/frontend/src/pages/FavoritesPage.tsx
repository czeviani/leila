import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Sparkles, Heart, MapPin, TrendingDown, Ruler,
  CheckCircle, AlertTriangle, ExternalLink,
  ArrowRight, Loader2, RefreshCw, Building2,
  DollarSign, BarChart3, Home, ShieldAlert, ShieldCheck, Landmark,
  TrendingUp, Banknote, Percent
} from 'lucide-react'
import { useFavorites, useToggleFavorite, useRequestEvaluation, useBulkEvaluate } from '../hooks/useProperties'
import { Evaluation, EvaluationFinancialData, Property } from '../lib/api'

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatBRLCompact(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000)     return `R$ ${(value / 1_000).toFixed(0)}k`
  return formatBRL(value)
}

// ── Configs ────────────────────────────────────────────────────────────────

const RECOMMENDATION_CONFIG = {
  strong_buy: {
    label: 'Ótimo Negócio',
    sublabel: 'Compra recomendada',
    bg: 'bg-emerald-500',
    textBg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  consider: {
    label: 'Considerar',
    sublabel: 'Oportunidade moderada',
    bg: 'bg-blue-500',
    textBg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  risky: {
    label: 'Arriscado',
    sublabel: 'Avalie com cautela',
    bg: 'bg-amber-500',
    textBg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  avoid: {
    label: 'Evitar',
    sublabel: 'Não recomendado',
    bg: 'bg-red-500',
    textBg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
}

const AREA_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  nobre:        { label: 'Área Nobre',        color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200', dot: 'bg-violet-500' },
  intermediário: { label: 'Área Intermediária', color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   dot: 'bg-blue-500'   },
  popular:      { label: 'Área Popular',      color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  dot: 'bg-amber-500'  },
  comunidade:   { label: 'Área de Comunidade', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500'    },
  indefinido:   { label: 'Área Indefinida',   color: 'text-slate-500',  bg: 'bg-slate-100', border: 'border-slate-200',  dot: 'bg-slate-400'  },
}

const LIQUIDITY_CONFIG = {
  alta:  { label: 'Alta',  color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  media: { label: 'Média', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  baixa: { label: 'Baixa', color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'     },
}

const SCORE_RING_COLOR = (score: number) => {
  if (score >= 7.5) return '#10b981'
  if (score >= 5)   return '#f59e0b'
  return '#ef4444'
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const pct = score / 10
  const circumference = 2 * Math.PI * 36
  const offset = circumference * (1 - pct)
  const color = SCORE_RING_COLOR(score)

  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
        <circle cx="40" cy="40" r="36" fill="none" stroke="#f1f5f9" strokeWidth="7" />
        <circle
          cx="40" cy="40" r="36"
          fill="none" stroke={color} strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 leading-none">{score.toFixed(1)}</span>
        <span className="text-[10px] text-slate-400 mt-0.5">/10</span>
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className={`text-[11px] font-semibold ${highlight ? 'text-emerald-600' : 'text-slate-700'}`}>{value}</span>
    </div>
  )
}

function SectionCard({
  title, icon: Icon, children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 p-3.5">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon size={11} className="text-slate-400" />
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  )
}

function FinancialCard({ fd, pricePerM2 }: { fd: EvaluationFinancialData; pricePerM2: number | null }) {
  const liquidity = fd.liquidity_assessment ? LIQUIDITY_CONFIG[fd.liquidity_assessment] : null

  return (
    <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
          <BarChart3 size={12} className="text-white" />
        </div>
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Análise Financeira</p>
        {liquidity && (
          <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${liquidity.bg} ${liquidity.color} ${liquidity.border}`}>
            Liquidez {liquidity.label}
          </span>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-white rounded-lg border border-slate-100 p-2.5">
          <div className="flex items-center gap-1 mb-1">
            <Banknote size={10} className="text-slate-400" />
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Custo Total</p>
          </div>
          <p className="text-sm font-bold text-slate-900">{formatBRLCompact(fd.estimated_total_cost)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">lance + taxas</p>
        </div>

        {pricePerM2 && (
          <div className="bg-white rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Ruler size={10} className="text-slate-400" />
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Preço/m²</p>
            </div>
            <p className="text-sm font-bold text-slate-900">R$ {pricePerM2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</p>
            {fd.price_vs_market_pct != null && (
              <p className={`text-[10px] mt-0.5 font-semibold ${fd.price_vs_market_pct < 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {fd.price_vs_market_pct < 0 ? '▼' : '▲'} {Math.abs(fd.price_vs_market_pct).toFixed(1)}% vs. mercado
              </p>
            )}
          </div>
        )}

        {fd.market_avg_price_m2 && (
          <div className="bg-white rounded-lg border border-slate-100 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp size={10} className="text-slate-400" />
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Mercado/m²</p>
            </div>
            <p className="text-sm font-bold text-slate-900">R$ {fd.market_avg_price_m2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">estimativa</p>
          </div>
        )}

        {fd.rental_yield_annual_pct != null && (
          <div className={`rounded-lg border p-2.5 ${fd.rental_yield_annual_pct >= 6 ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-1 mb-1">
              <Percent size={10} className={fd.rental_yield_annual_pct >= 6 ? 'text-emerald-500' : 'text-slate-400'} />
              <p className={`text-[10px] font-medium uppercase tracking-wider ${fd.rental_yield_annual_pct >= 6 ? 'text-emerald-600' : 'text-slate-400'}`}>Yield Anual</p>
            </div>
            <p className={`text-sm font-bold ${fd.rental_yield_annual_pct >= 6 ? 'text-emerald-700' : 'text-slate-900'}`}>{fd.rental_yield_annual_pct.toFixed(1)}% a.a.</p>
            {fd.rental_estimate_monthly && (
              <p className="text-[10px] text-slate-400 mt-0.5">~{formatBRLCompact(fd.rental_estimate_monthly)}/mês</p>
            )}
          </div>
        )}
      </div>

      {/* Cost breakdown */}
      {fd.total_cost_breakdown && (
        <div className="bg-white rounded-lg border border-slate-100 p-3 mb-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Composição do Custo</p>
          <div className="space-y-1.5">
            {[
              { label: 'Arrematação', value: fd.total_cost_breakdown.arrematacao },
              { label: `ITBI (${fd.total_cost_breakdown.itbi_pct}%)`, value: fd.total_cost_breakdown.itbi },
              { label: 'Registro em Cartório', value: fd.total_cost_breakdown.registro_cartorio },
              { label: 'Comissão do Leiloeiro (5%)', value: fd.total_cost_breakdown.comissao_leiloeiro },
            ].filter(item => item.value > 0).map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{item.label}</span>
                <span className="text-[11px] font-medium text-slate-700">{formatBRL(item.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-1">
              <span className="text-xs font-semibold text-slate-700">Total</span>
              <span className="text-xs font-bold text-slate-900">{formatBRL(fd.estimated_total_cost)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Financial verdict */}
      <div className="bg-slate-900 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <DollarSign size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">{fd.financial_verdict}</p>
        </div>
      </div>
    </div>
  )
}

// ── EvaluationCard ─────────────────────────────────────────────────────────

function EvaluationCard({
  property, evaluation, onEvaluate, isEvaluating, onRemove, onNavigate,
}: {
  property: Property
  evaluation: Evaluation | undefined
  onEvaluate: () => void
  isEvaluating: boolean
  onRemove: () => void
  onNavigate: () => void
}) {
  const rec = evaluation?.recommendation ? RECOMMENDATION_CONFIG[evaluation.recommendation] : null
  const pricePerM2 = property.area_m2 && property.area_m2 > 0
    ? property.auction_price / property.area_m2
    : evaluation?.price_per_m2 ?? null
  const isPending = evaluation?.status === 'pending' || evaluation?.status === 'processing'
  const isDone = evaluation?.status === 'done'
  const isError = evaluation?.status === 'error'
  const areaConf = evaluation?.area_classification ? AREA_CONFIG[evaluation.area_classification] : null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Property header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              {property.property_type && (
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-900 text-white rounded-md">
                  {property.property_type}
                </span>
              )}
              {property.leila_sources && (
                <span className="text-[10px] font-medium px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">
                  {property.leila_sources.name}
                </span>
              )}
              {property.discount_pct != null && property.discount_pct > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 bg-emerald-500 text-white rounded-md">
                  <TrendingDown size={9} />
                  -{property.discount_pct.toFixed(0)}%
                </span>
              )}
              {areaConf && (
                <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${areaConf.bg} ${areaConf.color} ${areaConf.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${areaConf.dot}`} />
                  {areaConf.label}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
              {property.title}
            </p>
            {(property.city || property.state) && (
              <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                <MapPin size={10} />
                {[property.city, property.state].filter(Boolean).join(' — ')}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {property.edital_url && (
              <a
                href={property.edital_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-all"
              >
                <ExternalLink size={11} />
                Edital
              </a>
            )}
            <button
              onClick={onRemove}
              className="w-7 h-7 rounded-full flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all"
              title="Remover da seleção"
            >
              <Heart size={12} className="fill-red-400" />
            </button>
          </div>
        </div>

        {/* Price metrics */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-50">
          <div>
            <p className="text-lg font-bold text-slate-900 tracking-tight leading-none">{formatBRL(property.auction_price)}</p>
            {property.appraised_value && (
              <p className="text-[11px] text-slate-400 line-through mt-0.5">{formatBRL(property.appraised_value)}</p>
            )}
          </div>
          {property.area_m2 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Ruler size={11} />
              <span className="font-medium">{property.area_m2} m²</span>
            </div>
          )}
          {pricePerM2 && (
            <div className="text-xs text-slate-500">
              <span className="font-medium">R$ {pricePerM2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}/m²</span>
            </div>
          )}
        </div>
      </div>

      {/* Evaluation section */}
      <div className="px-5 py-4">
        {/* No evaluation yet */}
        {!evaluation && (
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-slate-500">Nenhuma avaliação IA ainda.</p>
            <button
              onClick={onEvaluate}
              disabled={isEvaluating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm"
            >
              <Sparkles size={13} />
              Avaliar com IA
            </button>
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2.5 text-sm text-red-600">
              <AlertTriangle size={15} />
              Erro na avaliação. Tente novamente.
            </div>
            <button
              onClick={onEvaluate}
              disabled={isEvaluating}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all"
            >
              <RefreshCw size={13} />
              Tentar novamente
            </button>
          </div>
        )}

        {/* Pending / Processing */}
        {isPending && (
          <div className="flex items-center gap-3 py-3">
            <Loader2 size={18} className="text-slate-500 animate-spin flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">Analisando com IA...</p>
              <p className="text-xs text-slate-400 mt-0.5">A página atualiza automaticamente.</p>
            </div>
          </div>
        )}

        {/* Done */}
        {isDone && evaluation && (
          <div className="space-y-4">
            {/* Score + Recommendation + Summary */}
            <div className="flex items-start gap-4">
              {evaluation.score != null && <ScoreGauge score={evaluation.score} />}
              <div className="flex-1 min-w-0">
                {rec && (
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${rec.textBg} border ${rec.border} mb-2`}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rec.bg}`} />
                    <span className={`text-sm font-bold ${rec.text}`}>{rec.label}</span>
                    <span className={`text-xs ${rec.text} opacity-70`}>— {rec.sublabel}</span>
                  </div>
                )}
                {evaluation.summary && (
                  <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                    {evaluation.summary}
                  </p>
                )}
              </div>
            </div>

            {/* Financial analysis */}
            {evaluation.financial_data && (
              <FinancialCard fd={evaluation.financial_data} pricePerM2={pricePerM2} />
            )}

            {/* Analysis grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Location */}
              {evaluation.location_notes && (
                <SectionCard title="Localização" icon={MapPin}>
                  <p className="text-xs text-slate-600 leading-relaxed">{evaluation.location_notes}</p>
                </SectionCard>
              )}

              {/* Condition */}
              {evaluation.condition_notes && (
                <SectionCard title="Condição" icon={Building2}>
                  <p className="text-xs text-slate-600 leading-relaxed">{evaluation.condition_notes}</p>
                </SectionCard>
              )}

              {/* Docs */}
              {evaluation.documents_notes && (
                <SectionCard title="Documentação" icon={Home}>
                  <p className="text-xs text-slate-600 leading-relaxed">{evaluation.documents_notes}</p>
                </SectionCard>
              )}
            </div>

            {/* Highlights + Risks */}
            {(evaluation.highlights?.length > 0 || evaluation.risks?.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {evaluation.highlights?.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <ShieldCheck size={12} className="text-emerald-600" />
                      <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Pontos Positivos</p>
                    </div>
                    <ul className="space-y-1.5">
                      {evaluation.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-emerald-800">
                          <CheckCircle size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {evaluation.risks?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <ShieldAlert size={12} className="text-amber-600" />
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Riscos</p>
                    </div>
                    <ul className="space-y-1.5">
                      {evaluation.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-800">
                          <AlertTriangle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Data table — quick reference */}
            {evaluation.financial_data && (
              <div className="bg-white border border-slate-100 rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Landmark size={11} className="text-slate-400" />
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Resumo do Investimento</p>
                </div>
                <div>
                  <InfoRow label="Lance mínimo" value={formatBRL(property.auction_price)} />
                  <InfoRow label="Custo total estimado" value={formatBRL(evaluation.financial_data.estimated_total_cost)} />
                  {pricePerM2 && <InfoRow label="Preço/m² (lance)" value={`R$ ${pricePerM2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`} />}
                  {evaluation.financial_data.market_avg_price_m2 && <InfoRow label="Média mercado/m²" value={`R$ ${evaluation.financial_data.market_avg_price_m2.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`} />}
                  {evaluation.financial_data.price_vs_market_pct != null && (
                    <InfoRow
                      label="vs. Mercado"
                      value={`${evaluation.financial_data.price_vs_market_pct < 0 ? '' : '+'}${evaluation.financial_data.price_vs_market_pct.toFixed(1)}%`}
                      highlight={evaluation.financial_data.price_vs_market_pct < 0}
                    />
                  )}
                  {evaluation.financial_data.rental_yield_annual_pct != null && (
                    <InfoRow
                      label="Yield bruto anual"
                      value={`${evaluation.financial_data.rental_yield_annual_pct.toFixed(1)}% a.a.`}
                      highlight={evaluation.financial_data.rental_yield_annual_pct >= 6}
                    />
                  )}
                  {evaluation.financial_data.rental_estimate_monthly && (
                    <InfoRow label="Aluguel estimado" value={`~${formatBRLCompact(evaluation.financial_data.rental_estimate_monthly)}/mês`} />
                  )}
                </div>
              </div>
            )}

            {/* Link to detail */}
            <div className="flex justify-end pt-1">
              <button
                onClick={onNavigate}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                Ver detalhes completos
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FavoritesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: favorites, isLoading } = useFavorites()
  const toggleFav = useToggleFavorite()
  const requestEval = useRequestEvaluation()
  const bulkEvaluate = useBulkEvaluate()

  const properties = favorites?.map(f => f.leila_properties).filter(Boolean) ?? []

  const hasPending = favorites?.some(f => {
    const ev = f.leila_properties?.leila_evaluations
    return ev?.status === 'pending' || ev?.status === 'processing'
  })

  useEffect(() => {
    if (!hasPending) return
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['favorites'] })
    }, 3000)
    return () => clearInterval(interval)
  }, [hasPending, qc])

  const handleEvaluateAll = () => {
    const ids = favorites
      ?.filter(f => {
        const ev = f.leila_properties?.leila_evaluations
        return !ev || ev.status === 'error'
      })
      .map(f => f.property_id) ?? []
    if (ids.length > 0) bulkEvaluate.mutate(ids)
  }

  const unevaluatedCount = favorites?.filter(f => {
    const ev = f.leila_properties?.leila_evaluations
    return !ev || ev.status === 'error'
  }).length ?? 0

  const doneCount = favorites?.filter(f =>
    f.leila_properties?.leila_evaluations?.status === 'done'
  ).length ?? 0

  return (
    <div className="min-h-full bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Avaliação IA</h1>
            {isLoading ? (
              <p className="text-sm text-slate-400 mt-0.5">Carregando...</p>
            ) : (
              <div className="flex items-center gap-3 mt-1">
                <p className="text-sm text-slate-400">
                  {properties.length} imóvel{properties.length !== 1 ? 'is' : ''} selecionado{properties.length !== 1 ? 's' : ''}
                </p>
                {doneCount > 0 && (
                  <span className="text-xs font-medium px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                    {doneCount} avaliado{doneCount !== 1 ? 's' : ''}
                  </span>
                )}
                {hasPending && (
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                    <Loader2 size={10} className="animate-spin" />
                    Em análise...
                  </span>
                )}
              </div>
            )}
          </div>

          {unevaluatedCount > 0 && (
            <button
              onClick={handleEvaluateAll}
              disabled={bulkEvaluate.isPending}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-slate-900/20 flex-shrink-0"
            >
              <Sparkles size={14} className={bulkEvaluate.isPending ? 'animate-pulse' : ''} />
              {bulkEvaluate.isPending
                ? `Iniciando ${unevaluatedCount > 1 ? `${unevaluatedCount} análises` : 'análise'}...`
                : `Avaliar ${unevaluatedCount > 1 ? `${unevaluatedCount} imóveis` : 'imóvel'}`}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 max-w-5xl mx-auto">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm animate-pulse">
                <div className="p-5 space-y-3">
                  <div className="flex gap-2">
                    <div className="h-5 w-16 bg-slate-100 rounded-md" />
                    <div className="h-5 w-12 bg-slate-100 rounded-md" />
                  </div>
                  <div className="h-5 bg-slate-100 rounded-full w-3/4" />
                  <div className="h-4 bg-slate-100 rounded-full w-1/3" />
                  <div className="h-16 bg-slate-100 rounded-xl w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && properties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 gap-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center">
                <Heart size={32} className="text-slate-300" strokeWidth={1.5} />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center">
                <Sparkles size={12} className="text-white" />
              </div>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-700">Nenhum imóvel selecionado</p>
              <p className="text-sm text-slate-400 mt-2 max-w-xs leading-relaxed">
                Selecione imóveis na aba <strong className="text-slate-600">Imóveis</strong> clicando no botão de avaliação.
                Depois volte aqui para rodar a análise IA.
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all shadow-sm shadow-slate-900/20"
            >
              Ver imóveis disponíveis
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* Evaluation cards */}
        {!isLoading && properties.length > 0 && (
          <div className="space-y-4">
            {favorites?.map(fav => {
              const property = fav.leila_properties
              if (!property) return null
              const evaluation = property.leila_evaluations ?? undefined

              return (
                <EvaluationCard
                  key={fav.property_id}
                  property={property}
                  evaluation={evaluation}
                  onEvaluate={() => requestEval.mutate(fav.property_id)}
                  isEvaluating={requestEval.isPending}
                  onRemove={() => toggleFav.mutate({ property_id: fav.property_id, isFav: true })}
                  onNavigate={() => navigate(`/properties/${fav.property_id}`)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
