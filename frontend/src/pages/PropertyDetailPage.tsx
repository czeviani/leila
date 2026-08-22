import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, Bath, BedDouble, Calendar, Car, CheckCircle2,
  CircleHelp, CircleX, Clock3, Database, ExternalLink, FileText, Gavel,
  Heart, Home, MapPin, Ruler, ShieldCheck, Sparkles, TrendingDown,
} from 'lucide-react'
import { useProperty, useFavorites, useToggleFavorite, useRequestEvaluation, useDocumentAnalysis, useRequestDocumentAnalysis } from '../hooks/useProperties'
import InvestmentDashboard from '../components/evaluator/InvestmentDashboard'
import DocumentAnalysisPanel from '../components/documents/DocumentAnalysisPanel'
import SourceBadge from '../components/properties/SourceBadge'
import type { Property } from '../lib/api'

function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return 'Não informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Não informado'
  return date.toLocaleString('pt-BR', withTime
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatAuctionEvent(value: string | null) {
  if (!value) return 'Data não informada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function relativeTime(value: string | null) {
  if (!value) return 'sem verificação registrada'
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'sem verificação registrada'
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000))
  if (hours < 1) return 'há menos de 1 hora'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

const MODALITY_LABELS: Record<string, string> = {
  compra_direta: 'Compra direta',
  segunda_praca: '2ª praça',
  leilao_online: 'Leilão online',
  primeira_praca: '1ª praça',
  proposta_fechada: 'Proposta fechada',
}

const SOURCE_URLS: Record<string, string> = {
  caixa: 'https://venda-imoveis.caixa.gov.br',
  bb: 'https://www.brasilmais.com.br',
  santander: 'https://www.santander.com.br/leiloes',
}

const SELLER_LABELS: Record<string, string> = {
  caixa: 'Caixa Econômica Federal',
  bb: 'Banco do Brasil',
  santander: 'Santander',
  itau: 'Itaú',
  bradesco: 'Bradesco',
  mega_leiloes: 'Mega Leilões',
}

function availabilityOf(property: Property) {
  if (property.availability_status) return property.availability_status
  return property.is_active === false ? 'unavailable' : 'available'
}

function qualityInfo(score: number | null | undefined) {
  if (!score) return { label: 'Não calculada', tone: 'text-slate-600', bar: 'bg-slate-300' }
  if (score >= 80) return { label: 'Dados completos', tone: 'text-emerald-700', bar: 'bg-emerald-500' }
  if (score >= 60) return { label: 'Dados razoáveis', tone: 'text-amber-700', bar: 'bg-amber-500' }
  return { label: 'Dados limitados', tone: 'text-red-700', bar: 'bg-red-500' }
}

function AvailabilityPanel({ property }: { property: Property }) {
  const status = availabilityOf(property)
  const lastCheck = property.last_verified_at ?? property.last_seen_at ?? property.scraped_at
  const configs = {
    available: {
      icon: CheckCircle2,
      title: 'Disponível na última coleta',
      copy: 'O imóvel apareceu na fonte oficial na verificação mais recente. Confirme novamente antes de tomar qualquer decisão.',
      panel: 'bg-emerald-50 border-emerald-200',
      iconBox: 'bg-emerald-100 text-emerald-700',
      text: 'text-emerald-950',
    },
    suspect: {
      icon: AlertTriangle,
      title: 'Disponibilidade não confirmada',
      copy: 'O imóvel não apareceu na coleta mais recente. Ele continua visível enquanto fazemos uma segunda verificação.',
      panel: 'bg-amber-50 border-amber-200',
      iconBox: 'bg-amber-100 text-amber-700',
      text: 'text-amber-950',
    },
    unavailable: {
      icon: CircleX,
      title: 'Indisponível na fonte',
      copy: 'O imóvel deixou de aparecer em duas coletas válidas consecutivas. Os dados abaixo são mantidos apenas como histórico.',
      panel: 'bg-red-50 border-red-200',
      iconBox: 'bg-red-100 text-red-700',
      text: 'text-red-950',
    },
  } as const
  const config = configs[status]
  const Icon = config.icon

  return (
    <section
      aria-labelledby="availability-title"
      role={status === 'available' ? undefined : 'status'}
      className={`rounded-2xl border p-4 sm:p-5 ${config.panel}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${config.iconBox}`}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 id="availability-title" className={`text-sm font-bold ${config.text}`}>{config.title}</h2>
            <span className="text-xs font-medium text-slate-600">Verificado {relativeTime(lastCheck)}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm">{config.copy}</p>
        </div>
      </div>
    </section>
  )
}

function DetailItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon size={14} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium text-slate-700">{value}</div>
      </div>
    </div>
  )
}


export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: property, isLoading } = useProperty(id!)
  const { data: favorites } = useFavorites()
  const toggleFav = useToggleFavorite()
  const requestEval = useRequestEvaluation()
  const { data: documentAnalysis, isLoading: documentAnalysisLoading } = useDocumentAnalysis(id!)
  const requestDocumentAnalysis = useRequestDocumentAnalysis()

  if (isLoading) {
    return (
      <div className="min-h-full bg-slate-50" aria-busy="true" aria-label="Carregando ficha do imóvel">
        <div className="bg-white border-b border-slate-100 px-6 py-4">
          <div className="h-5 w-24 bg-slate-100 rounded-full animate-pulse" />
        </div>
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
          <div className="h-8 bg-slate-100 rounded-xl animate-pulse w-3/4" />
          <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="min-h-full bg-slate-50 flex items-center justify-center">
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <Home size={28} className="text-red-400" strokeWidth={1.5} />
          </div>
          <p className="text-base font-semibold text-slate-700">Imóvel não encontrado</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const isFav = favorites?.some(f => f.property_id === property.id) ?? false
  const evaluation = property.leila_evaluations ?? undefined
  const availability = availabilityOf(property)
  const officialUrl = property.listing_url ?? property.leila_sources?.url ?? SOURCE_URLS[property.source_id] ?? null
  const isDirectPropertyUrl = Boolean(property.listing_url)
  const quality = qualityInfo(property.data_quality_score)
  const displayArea = property.useful_area_m2 ?? property.area_m2
  const address = [property.address, property.city, property.state].filter(Boolean).join(', ')

  return (
    <div className="min-h-full bg-slate-50">
      {/* Top nav bar */}
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            <ArrowLeft size={16} aria-hidden="true" /> Voltar
          </button>
          <div className="flex min-w-0 items-center gap-2">
            {property.leila_sources && (
              <SourceBadge sourceId={property.source_id} sourceName={property.leila_sources.name} compact className="hidden max-w-44 sm:inline-flex" />
            )}
            <button
              onClick={() => toggleFav.mutate({ property_id: property.id, isFav })}
              aria-pressed={isFav}
              aria-label={isFav ? 'Remover imóvel dos salvos' : 'Salvar imóvel'}
              disabled={toggleFav.isPending}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                isFav
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60`}
            >
              <Heart size={15} aria-hidden="true" className={isFav ? 'fill-red-500 text-red-500' : ''} />
              {isFav ? 'Salvo' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-slate-200/70 px-2 py-1 font-mono">ID {property.external_id}</span>
            {property.property_type && <span className="capitalize">{property.property_type}</span>}
            {property.auction_modality && <><span aria-hidden="true">·</span><span>{MODALITY_LABELS[property.auction_modality] ?? property.auction_modality}</span></>}
          </div>
          <h1 className="text-2xl font-bold leading-snug tracking-tight text-slate-900 sm:text-3xl">{property.title}</h1>
          {address && <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-500"><MapPin size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />{address}</p>}
        </div>

        <AvailabilityPanel property={property} />

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">

        {/* Photo */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
          <img
            src={property.photos?.[0] ?? '/property-placeholder.svg'}
            alt={property.photos?.[0] ? `Foto do imóvel: ${property.title}` : 'Imagem do imóvel não disponível na fonte'}
            className="h-56 w-full object-cover sm:h-80"
            onError={(e) => { e.currentTarget.src = '/property-placeholder.svg' }}
          />
        </div>

        {/* Details grid */}
        <section aria-labelledby="financial-heading">
          <h2 id="financial-heading" className="mb-3 text-base font-bold text-slate-900">Valores anunciados</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              Lance de referência
            </p>
            <p className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{formatBRL(property.auction_price)}</p>
            <p className="mt-1 text-xs text-slate-400">Base estratégica; não garante que a etapa futura ocorrerá ou que não haverá disputa.</p>
          </div>

          {property.current_stage_price != null && property.current_stage_price !== property.auction_price && (
            <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-cyan-700">Preço da etapa atual</p>
              <p className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{formatBRL(property.current_stage_price)}</p>
              <p className="mt-1 text-xs text-cyan-800">A oportunidade ainda está nesta etapa.</p>
            </div>
          )}

          {property.appraised_value && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Avaliação informada</p>
              <p className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{formatBRL(property.appraised_value)}</p>
            </div>
          )}

          {property.discount_pct != null && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-emerald-600">Desconto anunciado</p>
              <div className="flex items-center gap-2">
                <TrendingDown className="text-emerald-500" size={22} aria-hidden="true" />
                <p className="text-2xl font-bold text-emerald-700 tracking-tight">{property.discount_pct.toFixed(1)}%</p>
              </div>
            </div>
          )}

          {displayArea && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">{property.useful_area_m2 ? 'Área útil' : 'Área informada'}</p>
              <div className="flex items-center gap-2">
                <Ruler className="text-slate-400" size={20} aria-hidden="true" />
                <p className="text-2xl font-bold text-slate-900 tracking-tight">{displayArea} <span className="text-base font-normal text-slate-500">m²</span></p>
              </div>
            </div>
          )}
          </div>
        </section>

        {property.auction_stages && property.auction_stages.length > 0 && (
          <section aria-labelledby="auction-stages-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 id="auction-stages-heading" className="text-base font-bold text-slate-900">Etapas do leilão</h2>
            <p className="mt-1 text-sm text-slate-500">Valores e datas obtidos diretamente na página oficial da Caixa.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {property.auction_stages.map((stage) => {
                const isCurrent = property.auction_stage === stage.stage
                const isPossible = stage.certainty === 'possible' || stage.status === 'possible'
                return (
                  <div key={`${stage.stage}-${stage.event_at}`} className={`rounded-xl border p-4 ${isPossible ? 'border-dashed border-slate-300 bg-white' : isCurrent ? 'border-cyan-300 bg-cyan-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-800">{stage.label ?? (stage.stage === 'first' ? '1º leilão' : stage.stage === 'second' ? '2º leilão' : 'Etapa única')}</p>
                      {isCurrent && <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">Etapa atual</span>}
                      {property.target_stage === stage.stage && !isCurrent && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">Melhor preço</span>}
                    </div>
                    <p className="mt-2 text-lg font-bold text-slate-900">{stage.price != null ? formatBRL(stage.price) : 'Valor não informado'}</p>
                    <p className="mt-1 text-xs text-slate-500">{isPossible ? 'Possibilidade, não garantida pela fonte' : formatAuctionEvent(stage.event_at)}</p>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="property-details-heading" className="rounded-2xl border border-slate-200 bg-white px-4 shadow-sm sm:px-5">
          <h2 id="property-details-heading" className="border-b border-slate-100 py-4 text-base font-bold text-slate-900">Detalhes para triagem</h2>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
            {address && <DetailItem icon={MapPin} label="Localização" value={address} />}
            <DetailItem icon={Gavel} label="Modalidade" value={property.auction_modality ? (MODALITY_LABELS[property.auction_modality] ?? property.auction_modality) : 'Não informada'} />
            <DetailItem icon={Calendar} label="Data do evento" value={formatDate(property.auction_date)} />
            <DetailItem icon={Home} label="Ocupação" value={property.is_occupied === true ? 'Ocupado — exige atenção' : property.is_occupied === false ? 'Desocupado segundo a fonte' : 'Não informada'} />
            <DetailItem icon={BedDouble} label="Quartos" value={property.bedrooms ?? 'Não informado'} />
            <DetailItem icon={Bath} label="Banheiros" value={property.bathrooms ?? 'Não informado'} />
            <DetailItem icon={Car} label="Vagas" value={property.parking_spots ?? 'Não informado'} />
            <DetailItem icon={Ruler} label="Área total" value={property.area_m2 ? `${property.area_m2} m²` : 'Não informada'} />
          </div>
        </section>

        {/* Description */}
        {property.description && (
          <section aria-labelledby="description-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 id="description-heading" className="mb-3 text-base font-bold text-slate-900">Descrição da fonte</h2>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{property.description}</p>
          </section>
        )}

        <ErrorBoundary fallbackTitle="A leitura documental não pôde ser exibida.">
          <DocumentAnalysisPanel
            record={documentAnalysis}
            isLoading={documentAnalysisLoading}
            isRequesting={requestDocumentAnalysis.isPending}
            requestError={requestDocumentAnalysis.isError ? (requestDocumentAnalysis.error as Error).message : null}
            canAnalyze={Boolean(property.edital_url) && availability !== 'unavailable'}
            onAnalyze={force => requestDocumentAnalysis.mutate({ propertyId: property.id, force })}
          />
        </ErrorBoundary>

        {/* AI Evaluation */}
        <section aria-labelledby="ai-heading" className="overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="flex flex-col gap-3 px-1 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <h2 id="ai-heading" className="text-sm font-semibold text-slate-900">Estimativa assistida por IA</h2>
                <p className="text-xs text-slate-400">Apoio à triagem; não substitui laudo, edital ou diligência.</p>
              </div>
            </div>
            {availability !== 'unavailable' && (!evaluation || evaluation.status === 'error') && (
              <div className="flex flex-col items-start gap-1.5 sm:items-end">
                <button
                  onClick={() => requestEval.mutate(property.id)}
                  disabled={requestEval.isPending}
                  aria-describedby="ai-disclaimer"
                  className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-all shadow-sm shadow-slate-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                >
                  <Sparkles size={13} />
                  {requestEval.isPending ? 'Solicitando...' : 'Avaliar com IA'}
                </button>
                {requestEval.isError && (
                  <p className="text-xs text-red-500">{(requestEval.error as Error)?.message ?? 'Erro ao solicitar'}</p>
                )}
              </div>
            )}
          </div>

          <p id="ai-disclaimer" className="sr-only">A análise usa estimativas e deve ser validada com documentos e fontes independentes.</p>

          {!evaluation && availability !== 'unavailable' && (
            <div className="text-center py-8 bg-white border border-slate-200 rounded-2xl">
              <p className="text-sm text-slate-500">Clique em <strong className="text-slate-700">Avaliar com IA</strong> para gerar uma estimativa de apoio à triagem.</p>
            </div>
          )}

          {!evaluation && availability === 'unavailable' && (
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500">
              Uma nova estimativa não será gerada enquanto o imóvel estiver indisponível. Consulte o histórico apenas como referência.
            </div>
          )}

          {evaluation?.status === 'processing' && (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-10 bg-[#0d1117] rounded-2xl">
              {/* Skeleton shimmer */}
              <div className="w-full px-5 space-y-3 animate-pulse">
                <div className="h-24 bg-gray-800 rounded-xl" />
                <div className="grid grid-cols-3 gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-800 rounded-xl" />)}
                </div>
                <div className="h-20 bg-gray-800 rounded-xl" />
                <div className="grid grid-cols-2 gap-2">
                  {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-800 rounded-xl" />)}
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-2">Analisando com IA... (~40 segundos)</p>
              <p className="text-xs text-gray-600">A página atualiza automaticamente</p>
            </div>
          )}

          {evaluation?.status === 'error' && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">
                {availability === 'unavailable'
                  ? 'A avaliação anterior falhou. O imóvel agora está indisponível na fonte.'
                  : 'Erro ao gerar a avaliação. Tente novamente.'}
              </p>
            </div>
          )}

          {evaluation?.status === 'done' && evaluation.financial_data && (
            <>
              {evaluation.decision_status !== 'ready_for_final_review' && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-bold">Relatório financeiro ainda não está liberado para decisão</p>
                  <p className="mt-1 text-xs leading-relaxed">Ele é uma estimativa de triagem. Resolva as diligências documentais antes de considerar qualquer arrematação.</p>
                  {(evaluation.blocking_issues ?? []).length > 0 && <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{evaluation.blocking_issues?.map(issue => <li key={issue}>{issue}</li>)}</ul>}
                </div>
              )}
              <InvestmentDashboard analysis={evaluation.financial_data} />
            </>
          )}

          {evaluation?.status === 'done' && !evaluation.financial_data && (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700">Análise indisponível — tente reavaliar o imóvel.</p>
            </div>
          )}
        </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Proveniência e ações">
            <section aria-labelledby="source-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-slate-500" aria-hidden="true" />
                <h2 id="source-heading" className="text-sm font-bold text-slate-900">Origem dos dados</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Fonte</dt>
                  <dd className="mt-1"><SourceBadge sourceId={property.source_id} sourceName={property.leila_sources?.name} /></dd>
                </div>
                {property.seller_id && (
                  <div>
                    <dt className="text-xs text-slate-400">Vendedor/originador</dt>
                    <dd className="mt-0.5 font-semibold text-slate-700">{SELLER_LABELS[property.seller_id] ?? property.seller_id}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400">Identificador oficial</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-slate-700">{property.external_id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Visto na fonte</dt>
                  <dd className="mt-0.5 text-slate-700">{formatDate(property.last_seen_at ?? property.scraped_at, true)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Disponibilidade verificada</dt>
                  <dd className="mt-0.5 text-slate-700">{formatDate(property.last_verified_at, true)}</dd>
                </div>
              </dl>

              {officialUrl ? (
                <a
                  href={officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                >
                  <ExternalLink size={15} aria-hidden="true" />
                  {isDirectPropertyUrl ? 'Consultar na fonte oficial' : 'Abrir site da fonte'}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : (
                <div className="mt-5 rounded-xl bg-slate-100 p-3 text-xs leading-relaxed text-slate-600">
                  O link oficial não foi fornecido. Use o identificador acima ao consultar a fonte.
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                A página oficial é a referência final para preço, regras, documentos e disponibilidade.
              </p>
            </section>

            <section aria-labelledby="quality-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-slate-500" aria-hidden="true" />
                  <h2 id="quality-heading" className="text-sm font-bold text-slate-900">Completude</h2>
                </div>
                <span className={`text-xs font-bold ${quality.tone}`}>
                  {property.data_quality_score ? `${property.data_quality_score}/100` : 'Sem nota'}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className={`h-full rounded-full ${quality.bar}`} style={{ width: `${Math.max(0, Math.min(property.data_quality_score || 0, 100))}%` }} />
              </div>
              <p className={`mt-2 text-sm font-semibold ${quality.tone}`}>{quality.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Mede apenas quantos campos relevantes foram coletados. Não garante que as informações estejam corretas.</p>
              {(property.data_quality_score ?? 0) < 60 && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                  <CircleHelp size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                  Confirme endereço, área, ocupação, datas e documentos diretamente na fonte.
                </div>
              )}
            </section>

            <section aria-labelledby="checklist-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-500" aria-hidden="true" />
                <h2 id="checklist-heading" className="text-sm font-bold text-slate-900">Antes de decidir</h2>
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-600">
                <li className="flex gap-2"><span aria-hidden="true">•</span><span>Confirme disponibilidade e preço na fonte.</span></li>
                <li className="flex gap-2"><span aria-hidden="true">•</span><span>Leia edital, matrícula e débitos vinculados.</span></li>
                <li className="flex gap-2"><span aria-hidden="true">•</span><span>Valide ocupação e custos de desocupação.</span></li>
                <li className="flex gap-2"><span aria-hidden="true">•</span><span>Consulte profissionais jurídico e imobiliário.</span></li>
              </ul>
            </section>

            <div className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-400">
              <Clock3 size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              Dados de leilão mudam rapidamente. Este registro é um apoio à triagem, não uma oferta vinculante.
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
