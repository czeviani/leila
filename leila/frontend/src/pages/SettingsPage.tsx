import { useSources, useToggleSource, useRunScraper } from '../hooks/useProperties'
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react'

export default function SettingsPage() {
  const { data: sources, isLoading } = useSources()
  const toggleSource = useToggleSource()
  const runScraper = useRunScraper()

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">Configurações</h2>

      {/* Sources */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Fontes de Leilão</h3>
          <button
            onClick={() => runScraper.mutate(undefined)}
            disabled={runScraper.isPending}
            className="flex items-center gap-2 text-sm px-3 py-1.5 border border-border rounded hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={14} className={runScraper.isPending ? 'animate-spin' : ''} />
            {runScraper.isPending ? 'Executando...' : 'Executar todas ativas'}
          </button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando fontes...</p>}

        <div className="space-y-3">
          {sources?.map(source => (
            <div
              key={source.id}
              className="flex items-center justify-between p-4 border border-border rounded-lg"
            >
              <div>
                <p className="font-medium text-sm">{source.name}</p>
                <p className="text-xs text-muted-foreground">
                  {source.last_scraped_at
                    ? `Última busca: ${new Date(source.last_scraped_at).toLocaleString('pt-BR')}`
                    : 'Nunca executado'
                  }
                </p>
              </div>
              <div className="flex items-center gap-3">
                {source.active
                  ? <CheckCircle2 size={16} className="text-green-500" />
                  : <XCircle size={16} className="text-muted-foreground" />
                }
                <button
                  onClick={() => toggleSource.mutate({ id: source.id, active: !source.active })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    source.active ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      source.active ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Proxy info */}
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <h3 className="font-medium text-sm mb-2">Proxy para Caixa Econômica</h3>
        <p className="text-xs text-muted-foreground">
          A Caixa Econômica Federal bloqueia acessos de IPs internacionais.
          Configure a variável <code className="font-mono bg-muted px-1 rounded">PROXY_LIST</code> no serviço scraper
          com proxies brasileiros para garantir o funcionamento.
        </p>
      </div>
    </div>
  )
}
