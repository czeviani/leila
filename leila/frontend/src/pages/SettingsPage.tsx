import { useSources, useToggleSource, useRunScraper } from '../hooks/useProperties'
import { RefreshCw, CheckCircle2, XCircle, Globe, Info } from 'lucide-react'

export default function SettingsPage() {
  const { data: sources, isLoading } = useSources()
  const toggleSource = useToggleSource()
  const runScraper = useRunScraper()

  const activeSources = sources?.filter(s => s.active).length ?? 0

  return (
    <div className="min-h-full bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-100 px-6 py-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Configurações</h1>
        <p className="text-sm text-slate-400 mt-0.5">Gerencie as fontes de dados e configurações do scraper</p>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

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
                  {isLoading ? 'Carregando...' : `${activeSources} ativa${activeSources !== 1 ? 's' : ''} de ${sources?.length ?? 0}`}
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
            {isLoading && (
              <div className="px-5 py-10 text-center">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto" />
              </div>
            )}

            {!isLoading && (!sources || sources.length === 0) && (
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
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        source.active ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
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
