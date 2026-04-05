import { useSources, useToggleSource, useRunScraper, useFilters, useSaveFilters } from '../hooks/useProperties'
import { RefreshCw, CheckCircle2, XCircle, Globe, Info, ShoppingCart, Gavel, Users, Mail } from 'lucide-react'
import { MODALITY_CONFIG } from '../components/filters/FilterPanel'

const MODALITY_DETAILS: Record<string, { description: string; examples: string }> = {
  compra_direta: {
    description: 'Pague o valor anunciado e o imóvel é seu. Sem concorrência, sem lances.',
    examples: 'Caixa: Venda Direta / Venda Online',
  },
  leilao_online: {
    description: 'Faça lances pela internet e dispute com outros compradores em tempo real.',
    examples: 'Caixa: Licitação Aberta Online',
  },
  leilao: {
    description: 'Leilão com leiloeiro oficial. Você vence com o maior lance.',
    examples: 'Caixa: Licitação Aberta (1ª/2ª Praça)',
  },
  proposta_fechada: {
    description: 'Envie uma proposta ao banco. O banco escolhe a melhor oferta recebida.',
    examples: 'Caixa: Proposta Online',
  },
}

const ICON_MAP: Record<string, React.ElementType> = {
  compra_direta: ShoppingCart,
  leilao_online: Gavel,
  leilao: Users,
  proposta_fechada: Mail,
}

export default function SettingsPage() {
  const { data: sources, isLoading: sourcesLoading } = useSources()
  const { data: savedFilters } = useFilters()
  const toggleSource = useToggleSource()
  const runScraper = useRunScraper()
  const saveFilters = useSaveFilters()

  const activeSources = sources?.filter(s => s.active).length ?? 0
  const activeModalities: string[] = savedFilters?.modality_categories ?? []

  const toggleModality = (key: string) => {
    const current = activeModalities
    const updated = current.includes(key)
      ? current.filter(m => m !== key)
      : [...current, key]
    saveFilters.mutate({ ...(savedFilters ?? {}), modality_categories: updated } as Parameters<typeof saveFilters.mutate>[0])
  }

  return (
    <div className="min-h-full bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Configurações</h1>
        <p className="text-sm text-slate-400 mt-0.5">Gerencie fontes de dados, modalidades e preferências do scraper</p>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Modality preferences card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                <Gavel size={14} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Tipos de Negociação</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selecione quais modalidades aparecem nos resultados.{' '}
                  {activeModalities.length === 0
                    ? 'Mostrando todos os tipos.'
                    : `${activeModalities.length} selecionado${activeModalities.length > 1 ? 's' : ''}.`}
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {Object.entries(MODALITY_CONFIG).map(([key, cfg]) => {
              const Icon = ICON_MAP[key] ?? cfg.icon
              const detail = MODALITY_DETAILS[key]
              const isActive = activeModalities.includes(key)
              const allSelected = activeModalities.length === 0

              return (
                <div
                  key={key}
                  className={`flex items-start justify-between gap-4 px-5 py-4 transition-colors ${isActive ? `${cfg.bg}` : 'hover:bg-slate-50/50'}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5 ${isActive ? `${cfg.bg} ${cfg.border}` : 'bg-slate-100 border-slate-200'}`}>
                      <Icon size={14} className={isActive ? cfg.color : 'text-slate-400'} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${isActive ? cfg.color : 'text-slate-800'}`}>{cfg.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{detail?.description}</p>
                      {detail?.examples && (
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">{detail.examples}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                    {allSelected && !isActive && (
                      <span className="text-[10px] text-slate-400 font-medium">incluso</span>
                    )}
                    <button
                      onClick={() => toggleModality(key)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                        isActive ? 'bg-slate-900' : 'bg-slate-200'
                      }`}
                      title={isActive ? 'Desativar' : 'Ativar'}
                    >
                      <span
                        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200"
                        style={{ transform: isActive ? 'translateX(18px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {activeModalities.length > 0 && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => saveFilters.mutate({ ...(savedFilters ?? {}), modality_categories: [] } as Parameters<typeof saveFilters.mutate>[0])}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
              >
                Limpar seleção (mostrar todos)
              </button>
            </div>
          )}
        </div>

        {/* Sources card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                <Globe size={14} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Fontes de Leilão</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {sourcesLoading ? 'Carregando...' : `${activeSources} ativa${activeSources !== 1 ? 's' : ''} de ${sources?.length ?? 0}`}
                </p>
              </div>
            </div>
            <button
              onClick={() => runScraper.mutate(undefined)}
              disabled={runScraper.isPending || activeSources === 0}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-slate-900/20"
            >
              <RefreshCw size={13} className={runScraper.isPending ? 'animate-spin' : ''} />
              {runScraper.isPending ? 'Executando...' : 'Executar ativas'}
            </button>
          </div>

          {/* Sources list */}
          <div className="divide-y divide-slate-100">
            {sourcesLoading && (
              <div className="px-5 py-10 text-center">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto" />
              </div>
            )}

            {!sourcesLoading && (!sources || sources.length === 0) && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-slate-400">Nenhuma fonte configurada.</p>
              </div>
            )}

            {sources?.map(source => (
              <div
                key={source.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${source.active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{source.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {source.last_scraped_at
                        ? `Última busca: ${new Date(source.last_scraped_at).toLocaleString('pt-BR')}`
                        : 'Nunca executado'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {source.active
                    ? <CheckCircle2 size={15} className="text-emerald-500" />
                    : <XCircle size={15} className="text-slate-300" />
                  }
                  <button
                    onClick={() => toggleSource.mutate({ id: source.id, active: !source.active })}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                      source.active ? 'bg-slate-900' : 'bg-slate-200'
                    }`}
                    title={source.active ? 'Desativar fonte' : 'Ativar fonte'}
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200"
                      style={{ transform: source.active ? 'translateX(18px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proxy info card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-start gap-4 px-5 py-5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Info size={14} className="text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-1.5">Proxy para Caixa Econômica</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                A Caixa Econômica Federal bloqueia acessos de IPs internacionais.
                Configure a variável{' '}
                <code className="font-mono text-xs bg-slate-100 border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md">
                  PROXY_LIST
                </code>{' '}
                no serviço scraper com proxies brasileiros para garantir o funcionamento.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
