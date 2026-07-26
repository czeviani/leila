import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Home,
  Scale,
  ShieldAlert,
  Users,
  Clock,
  FileText,
  Wrench,
  Activity,
  Building2,
  Info,
} from 'lucide-react'
import type { EvaluationFinancialData } from '../../lib/api'

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const PCT = (v: number, showSign = true) =>
  `${showSign && v > 0 ? '+' : ''}${v.toFixed(1)}%`

// ── Score Gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number }) {
  const r = 44
  const circumference = Math.PI * r
  const clamped = Math.max(0, Math.min(100, score))
  const filled = (clamped / 100) * circumference
  const color = clamped >= 70 ? '#10b981' : clamped >= 40 ? '#f59e0b' : '#ef4444'
  const cx = 60
  const cy = 60

  return (
    <svg viewBox="0 0 120 68" className="w-40 h-24">
      {/* Track */}
      <path
        d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
        fill="none"
        stroke="#1f2937"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {/* Fill */}
      <path
        d={`M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
      />
      {/* Number */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fill={color}
        fontSize="22"
        fontWeight="700"
        fontFamily="'IBM Plex Mono', monospace"
      >
        {clamped}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="Inter, sans-serif">
        /100
      </text>
    </svg>
  )
}

// ── Range Bar ────────────────────────────────────────────────────────────────

interface RangeBarProps {
  min: number
  max: number
  markers: Array<{ value: number; label: string; color: string; primary?: boolean }>
}

function RangeBar({ min, max, markers }: RangeBarProps) {
  const span = Math.max(max - min, 1)
  const pct = (v: number) => Math.max(2, Math.min(98, ((v - min) / span) * 100))
  const primary = markers.filter(m => m.primary)

  return (
    <div>
      {/* Track */}
      <div className="relative h-1.5 bg-gray-800 rounded-full my-3">
        {primary.map((m, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full"
            style={{
              left: `${pct(m.value)}%`,
              width: '12px',
              height: '12px',
              backgroundColor: m.color,
              boxShadow: `0 0 0 2px rgba(0,0,0,0.6), 0 0 8px ${m.color}50`,
              zIndex: 2,
            }}
          />
        ))}
      </div>
      {/* Min / Max axis labels */}
      <div className="flex justify-between text-[10px] font-mono text-gray-600 -mt-1 mb-2">
        <span>{BRL(min)}</span>
        <span>{BRL(max)}</span>
      </div>
      {/* Primary marker legend */}
      {primary.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {primary.map((m, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
              <span className="text-[10px] text-gray-500">{m.label}:</span>
              <span className="text-[10px] font-mono font-semibold" style={{ color: m.color }}>{BRL(m.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<string, string> = {
  ALTA: 'bg-emerald-900/60 text-emerald-400 border border-emerald-800',
  MÉDIA: 'bg-amber-900/60 text-amber-400 border border-amber-800',
  BAIXA: 'bg-red-900/60 text-red-400 border border-red-800',
  ALTO: 'bg-red-900/60 text-red-400 border border-red-800',
  MÉDIO: 'bg-amber-900/60 text-amber-400 border border-amber-800',
  SUBINDO: 'bg-emerald-900/60 text-emerald-400 border border-emerald-800',
  ESTÁVEL: 'bg-gray-800 text-gray-400 border border-gray-700',
  CAINDO: 'bg-red-900/60 text-red-400 border border-red-800',
  'CRÍTICO': 'bg-red-900/60 text-red-400 border border-red-800',
  IMPORTANTE: 'bg-amber-900/60 text-amber-400 border border-amber-800',
  RECOMENDADO: 'bg-blue-900/60 text-blue-400 border border-blue-800',
}

function Badge({ label }: { label: string }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${LEVEL_COLORS[label] ?? 'bg-gray-800 text-gray-400'}`}>
      {label}
    </span>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-800 px-5 py-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ── Category icon map ────────────────────────────────────────────────────────

const RISK_ICONS: Record<string, React.ReactNode> = {
  Legal: <Scale size={14} />,
  Estrutural: <Building2 size={14} />,
  Mercado: <Activity size={14} />,
  Liquidez: <Clock size={14} />,
  Regulatório: <FileText size={14} />,
  Reforma: <Wrench size={14} />,
  Vizinhança: <Users size={14} />,
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  analysis: EvaluationFinancialData
}

export default function InvestmentDashboard({ analysis }: Props) {
  const { resumo_executivo: resumo, preco_justo: preco, potencial_pos_reforma: reforma,
          analise_aluguel: aluguel, viabilidade_financeira: viab, riscos,
          indicadores_mercado: mercado, checklist_due_diligence: checklist,
          recomendacao_reforma: recReforma, metadata } = analysis

  const verdictColor =
    resumo?.veredicto === 'COMPRAR' ? 'text-emerald-400' :
    resumo?.veredicto === 'NEGOCIAR' ? 'text-amber-400' : 'text-red-400'
  const verdictBg =
    resumo?.veredicto === 'COMPRAR' ? 'bg-emerald-950 border-emerald-800' :
    resumo?.veredicto === 'NEGOCIAR' ? 'bg-amber-950 border-amber-800' : 'bg-red-950 border-red-800'

  const CDI = viab?.comparativo_cdi_atual_pct ?? 14.75

  const reformaScenarios = [
    {
      label: 'Pessimista',
      custo: reforma?.custo_reforma_maximo,
      valor: reforma?.valor_imovel_pos_reforma_minimo,
      ganho: reforma?.ganho_bruto_estimado_minimo,
    },
    {
      label: 'Realista',
      custo: reforma?.custo_reforma_mediano,
      valor: reforma?.valor_imovel_pos_reforma_mediano,
      ganho: reforma?.ganho_bruto_estimado_mediano,
    },
    {
      label: 'Otimista',
      custo: reforma?.custo_reforma_minimo,
      valor: reforma?.valor_imovel_pos_reforma_maximo,
      ganho: reforma?.ganho_bruto_estimado_maximo,
    },
  ]

  const sortedRiscos = [...(riscos ?? [])].sort((a, b) => {
    const order = { ALTO: 0, MÉDIO: 1, BAIXO: 2 }
    return (order[a.severidade] ?? 3) - (order[b.severidade] ?? 3)
  })

  const sortedChecklist = [...(checklist ?? [])].sort((a, b) => {
    const order = { 'CRÍTICO': 0, IMPORTANTE: 1, RECOMENDADO: 2 }
    return (order[a.prioridade] ?? 3) - (order[b.prioridade] ?? 3)
  })

  const roiVsCdi = reforma?.roi_bruto_pct != null
    ? Math.min(100, (reforma.roi_bruto_pct / (CDI * 2)) * 100)
    : 0

  const yieldColor = (aluguel?.yield_bruto_anual_pct ?? 0) > CDI ? 'text-emerald-400' : 'text-red-400'
  const yieldBg = (aluguel?.yield_bruto_anual_pct ?? 0) > CDI
    ? 'bg-emerald-950 border-emerald-800'
    : 'bg-red-950 border-red-800'

  const trendIcon =
    mercado?.tendencia_preco_12m === 'SUBINDO' ? <TrendingUp size={14} className="text-emerald-400" /> :
    mercado?.tendencia_preco_12m === 'CAINDO' ? <TrendingDown size={14} className="text-red-400" /> :
    <Minus size={14} className="text-gray-400" />

  return (
    <div
      className="rounded-2xl overflow-hidden text-gray-300"
      style={{ background: '#0d1117', fontFamily: 'Inter, sans-serif' }}
    >
      {/* ── SEÇÃO 1: Header / Veredicto ─────────────────────────────────── */}
      <div className="px-5 pt-6 pb-5">
        <div className={`border rounded-xl p-4 ${verdictBg} mb-4`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Veredicto</p>
              <p
                className={`text-4xl font-bold leading-none ${verdictColor}`}
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {resumo?.veredicto ?? '—'}
              </p>
              <p className="mt-3 text-sm text-gray-400 leading-snug">{resumo?.frase_decisiva}</p>
            </div>
            <div className="flex-shrink-0">
              <ScoreGauge score={resumo?.score_geral ?? 0} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 2: Posicionamento de Preço ────────────────────────────── */}
      {preco && (
        <Section title="Posicionamento de Preço">
          <RangeBar
            min={preco.valor_minimo_regiao}
            max={preco.valor_maximo_regiao}
            markers={[
              { value: preco.preco_justo_este_imovel, label: 'Preço justo', color: '#f59e0b', primary: true },
              {
                value: preco.preco_pedido,
                label: 'Preço pedido',
                color: preco.preco_pedido > preco.preco_justo_este_imovel ? '#ef4444' : '#10b981',
                primary: true,
              },
            ]}
          />
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
            <div>
              <p className="text-xs text-gray-500">Vs. mercado</p>
              <p
                className={`text-sm font-mono font-semibold ${preco.percentual_acima_abaixo_mercado > 0 ? 'text-red-400' : 'text-emerald-400'}`}
              >
                {PCT(preco.percentual_acima_abaixo_mercado)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Margem de negociação sugerida</p>
              <p className="text-sm font-mono font-semibold text-amber-400">
                {preco.margem_negociacao_estimada_pct.toFixed(1)}%
              </p>
            </div>
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 3: Potencial Pós-Reforma ──────────────────────────────── */}
      {reforma && (
        <Section title="Potencial Pós-Reforma">
          <div className="grid grid-cols-3 gap-2">
            {reformaScenarios.map((s, i) => {
              const ganho = s.ganho ?? 0
              const ganhoColor = ganho > 0 ? 'text-emerald-400' : 'text-red-400'
              const ganhoLabel = ganho < 0 ? 'Prejuízo bruto' : 'Ganho bruto'
              const roiPct = reforma.roi_bruto_pct
              const barWidth = Math.min(100, Math.max(0, (roiPct / (CDI * 2)) * 100))
              return (
                <div key={i} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{s.label}</p>
                  <div className="space-y-1.5">
                    <div>
                      <p className="text-[10px] text-gray-600">Reforma</p>
                      <p className="text-xs font-mono text-gray-400">{s.custo != null ? BRL(s.custo) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-600">Pós-reforma</p>
                      <p className="text-xs font-mono text-gray-300">{s.valor != null ? BRL(s.valor) : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-600">{ganhoLabel}</p>
                      <p className={`text-sm font-mono font-bold ${ganhoColor}`}>
                        {s.ganho != null ? BRL(s.ganho) : '—'}
                      </p>
                    </div>
                  </div>
                  {i === 1 && (
                    <div className="mt-3 pt-2 border-t border-gray-800">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-[10px] text-gray-500">ROI bruto</p>
                        <p className="text-xs font-mono font-semibold text-amber-400">{PCT(roiPct, false)}</p>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${barWidth}%`,
                            background: roiPct > CDI ? '#10b981' : '#f59e0b',
                          }}
                        />
                      </div>
                      <p className="text-[9px] text-gray-600 mt-1">CDI: {CDI}%</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
              <span className="text-gray-500">Prazo reforma: </span>
              <span className="font-mono font-semibold text-gray-300">
                {reforma.prazo_reforma_meses_estimado} meses
              </span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
              <span className="text-gray-500">ROI realista: </span>
              <span className={`font-mono font-semibold ${reforma.roi_bruto_pct > CDI ? 'text-emerald-400' : 'text-amber-400'}`}>
                {PCT(reforma.roi_bruto_pct, false)}
              </span>
            </div>
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 4: Análise de Aluguel ─────────────────────────────────── */}
      {aluguel && (
        <Section title="Análise de Aluguel">
          <RangeBar
            min={aluguel.aluguel_mensal_minimo_regiao}
            max={aluguel.aluguel_mensal_maximo_regiao}
            markers={[
              { value: aluguel.aluguel_esperado_pos_reforma, label: 'Esperado pós-reforma', color: '#f59e0b', primary: true },
            ]}
          />
          <div className="flex items-center gap-3 mt-3">
            <div className={`border rounded-lg px-3 py-2 ${yieldBg}`}>
              <p className="text-[10px] text-gray-500 mb-0.5">Yield bruto anual</p>
              <p className={`text-lg font-mono font-bold ${yieldColor}`}>
                {PCT(aluguel.yield_bruto_anual_pct, false)}
              </p>
              <p className={`text-[10px] ${yieldColor}`}>
                {(aluguel.yield_bruto_anual_pct ?? 0) > CDI ? '▲ Acima do CDI' : '▼ Abaixo do CDI'}
              </p>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
                <span className="text-gray-500">Vacância média: </span>
                <span className="font-mono font-semibold text-gray-300">{aluguel.vacancia_media_regiao_meses} meses/ano</span>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs">
                <span className="text-gray-500">Absorção do mercado: </span>
                <span className="font-mono font-semibold text-gray-300">{aluguel.tempo_absorcao_mercado_dias} dias</span>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 5: Viabilidade Financeira ─────────────────────────────── */}
      {viab && (
        <Section title="Viabilidade Financeira">
          {/* Custos de transação */}
          {viab.custos_transacao && (
            <div className="mb-3 bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Custos de Transação (além do lance)</p>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <p className="text-[10px] text-gray-600">ITBI (2%)</p>
                  <p className="text-xs font-mono text-gray-400">{BRL(viab.custos_transacao.itbi)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600">Leiloeiro (5%)</p>
                  <p className="text-xs font-mono text-gray-400">{BRL(viab.custos_transacao.comissao_leiloeiro)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-600">Cartório (0,5%)</p>
                  <p className="text-xs font-mono text-gray-400">{BRL(viab.custos_transacao.registro_cartorio)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                <p className="text-[10px] text-gray-500">Total de custos adicionais</p>
                <p className="text-sm font-mono font-bold text-red-400">{BRL(viab.custos_transacao.total)}</p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Investimento total', value: BRL(viab.investimento_total_estimado), mono: true },
              { label: 'Payback venda', value: `${viab.payback_venda_meses} meses`, mono: true },
              { label: 'Payback aluguel', value: `${viab.payback_aluguel_anos} anos`, mono: true },
              { label: 'TIR — venda', value: PCT(viab.tir_estimada_venda_pct, false), mono: true, color: viab.tir_estimada_venda_pct > CDI ? 'text-emerald-400' : 'text-amber-400' },
              { label: 'TIR — aluguel', value: PCT(viab.tir_estimada_aluguel_pct, false), mono: true, color: viab.tir_estimada_aluguel_pct > CDI ? 'text-emerald-400' : 'text-amber-400' },
              {
                label: 'Supera CDI?',
                value: viab.supera_cdi ? '✓ Sim' : '✗ Não',
                mono: false,
                color: viab.supera_cdi ? 'text-emerald-400' : 'text-red-400',
              },
            ].map((kpi, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <p className="text-[10px] text-gray-500 mb-1 leading-tight">{kpi.label}</p>
                <p className={`text-sm font-semibold leading-tight ${kpi.color ?? 'text-gray-200'} ${kpi.mono ? 'font-mono' : ''}`}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 6: Riscos ─────────────────────────────────────────────── */}
      {sortedRiscos.length > 0 && (
        <Section title="Riscos">
          <div className="space-y-2">
            {sortedRiscos.map((r, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0 text-gray-400 mt-0.5">
                    {RISK_ICONS[r.categoria] ?? <ShieldAlert size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge label={r.severidade} />
                      <span className="text-[10px] text-gray-600">{r.categoria}</span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${r.probabilidade_pct}%`,
                              background: r.severidade === 'ALTO' ? '#ef4444' : r.severidade === 'MÉDIO' ? '#f59e0b' : '#6b7280',
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-gray-500">{r.probabilidade_pct}%</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-300 mb-1">{r.descricao}</p>
                    <p className="text-[11px] text-gray-500">
                      <span className="text-gray-600 font-semibold">Mitigação: </span>
                      {r.mitigacao}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 7: Indicadores de Mercado ─────────────────────────────── */}
      {mercado && (
        <Section title="Indicadores de Mercado">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">Liquidez da região</p>
              <Badge label={mercado.liquidez_regiao} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">Demanda de locação</p>
              <Badge label={mercado.demanda_locacao} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">Tendência 12 meses</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {trendIcon}
                <span className="text-xs font-mono font-semibold text-gray-300">
                  {PCT(mercado.variacao_preco_12m_estimada_pct)}
                </span>
                <Badge label={mercado.tendencia_preco_12m} />
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">Tempo médio de venda</p>
              <p className="text-sm font-mono font-semibold text-gray-300">
                {mercado.tempo_medio_venda_regiao_dias} dias
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] text-gray-500 mb-1">Concorrência (oferta similar)</p>
              <Badge label={mercado.concorrencia_oferta_similar} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 col-span-1">
              <p className="text-[10px] text-gray-500 mb-1">Perfil do comprador/locatário</p>
              <p className="text-xs text-gray-400 leading-snug">{mercado.perfil_comprador_alvo}</p>
            </div>
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 8: Due Diligence ──────────────────────────────────────── */}
      {sortedChecklist.length > 0 && (
        <Section title="Due Diligence">
          <div className="space-y-1.5">
            {sortedChecklist.map((item, i) => {
              const iconColor =
                item.prioridade === 'CRÍTICO' ? 'text-red-400' :
                item.prioridade === 'IMPORTANTE' ? 'text-amber-400' : 'text-blue-400'
              const boxColor =
                item.prioridade === 'CRÍTICO' ? 'border-red-800' :
                item.prioridade === 'IMPORTANTE' ? 'border-amber-800' : 'border-blue-900'
              return (
                <div key={i} className={`flex items-start gap-3 bg-gray-900 border rounded-lg px-3 py-2.5 ${boxColor}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${boxColor}`}>
                    <div className={`w-2 h-2 rounded-sm ${iconColor.replace('text-', 'bg-')}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-gray-300">{item.item}</span>
                      <Badge label={item.prioridade} />
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug">{item.observacao}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── SEÇÃO 9: Recomendação de Reforma ───────────────────────────── */}
      {recReforma && (
        <Section title="Recomendação de Reforma">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Escopo mínimo</p>
              <p className="text-xs text-gray-400 leading-snug">{recReforma.escopo_minimo}</p>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mt-3 mb-2">Escopo recomendado</p>
              <p className="text-xs text-gray-400 leading-snug">{recReforma.escopo_recomendado}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-2">Alto impacto</p>
              <ul className="space-y-1 mb-3">
                {recReforma.itens_alto_impacto.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-400">
                    <CheckCircle size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wider mb-2">Evitar</p>
              <ul className="space-y-1">
                {recReforma.itens_evitar.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-500">
                    <XCircle size={11} className="text-red-600 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {recReforma.alerta_reforma && (
            <div className="flex items-start gap-3 bg-amber-950/50 border border-amber-900/60 rounded-xl p-3">
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300 leading-snug">{recReforma.alerta_reforma}</p>
            </div>
          )}
        </Section>
      )}

      {/* ── Metadata ─────────────────────────────────────────────────────── */}
      {metadata && (
        <div className="border-t border-gray-800 px-5 py-4 flex items-start gap-3">
          <Info size={13} className="text-gray-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[11px] text-gray-600">
              Referência: <span className="text-gray-500">{metadata.regiao_referencia}</span>
              {metadata.classificacao_regional && (
                <> · Região: <span className="text-gray-500">{metadata.classificacao_regional.replace('_', ' ')}</span></>
              )}
              {' · '}Confiança: <Badge label={metadata.confianca_analise} />
            </p>
            {metadata.ressalvas && (
              <p className="text-[11px] text-gray-600 italic leading-snug">{metadata.ressalvas}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
