import { useState, useEffect } from 'react'
import { useSources, useToggleSource, useRunScraper, useFilters, useSaveFilters, useLlmSettings, useSaveLlmSettings, useSaveWorkLocation } from '../hooks/useProperties'
import { RefreshCw, CheckCircle2, XCircle, Globe, Info, ShoppingCart, Gavel, Users, Mail, Tag, Cpu, Check, MapPin } from 'lucide-react'
import { MODALITY_CONFIG } from '../components/filters/FilterPanel'
import { LLM_PROVIDERS, LlmProvider } from '../lib/api'

const MODALITY_DETAILS: Record<string, { description: string; examples: string; tip?: string }> = {
  compra_direta: {
    description: 'Preço fixo anunciado. Você paga e o imóvel é seu — sem concorrência, sem lances.',
    examples: 'Caixa: Compra Direta',
  },
  segunda_praca: {
    description: 'Segundo round ou mais do leilão judicial. Lance mínimo ≈ 60% da avaliação. Maiores descontos.',
    examples: 'Caixa/BB/Santander: 2ª Praça, 3ª Praça',
    tip: 'Melhor oportunidade de desconto real',
  },
  leilao_online: {
    description: 'Lances em tempo real pela internet. Qualquer pessoa pode participar no horário marcado.',
    examples: 'Caixa: Licitação Aberta Online',
  },
  primeira_praca: {
    description: 'Primeiro round do leilão judicial. Lance mínimo = valor de avaliação. Se não houver lances, vai para a 2ª Praça com preço menor.',
    examples: 'Caixa/BB: 1ª Praça',
    tip: 'Lance mínimo no valor cheio — pode não valer a pena aguardar a 2ª Praça',
  },
  proposta_fechada: {
    description: 'Envie sua proposta ao banco pelo portal. O banco escolhe a melhor oferta recebida.',
    examples: 'Caixa: Proposta Online, Concorrência',
  },
}

const ICON_MAP: Record<string, React.ElementType> = {
  compra_direta:    ShoppingCart,
  segunda_praca:    Tag,
  leilao_online:    Gavel,
  primeira_praca:   Users,
  proposta_fechada: Mail,
}

export default function SettingsPage() {
  const { data: sources, isLoading: sourcesLoading } = useSources()
  const { data: savedFilters } = useFilters()
  const toggleSource = useToggleSource()
  const runScraper = useRunScraper()
  const saveFilters = useSaveFilters()

  // LLM settings state
  const { data: llmSettings, isLoading: llmLoading } = useLlmSettings()
  const saveLlmSettings = useSaveLlmSettings()
  const [selectedProvider, setSelectedProvider] = useState<LlmProvider>('anthropic')
  const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-6')
  const [llmSaved, setLlmSaved] = useState(false)
  const saveWorkLocation = useSaveWorkLocation()
  const [workAddress, setWorkAddress] = useState('')
  const [workSaved, setWorkSaved] = useState(false)

  useEffect(() => {
    if (llmSettings) {
      setSelectedProvider(llmSettings.llm_provider)
      setSelectedModel(llmSettings.llm_model)
      setWorkAddress(llmSettings.work_address ?? '')
    }
  }, [llmSettings])

  const handleProviderChange = (provider: LlmProvider) => {
    setSelectedProvider(provider)
    setSelectedModel(LLM_PROVIDERS[provider].models[0].id)
  }

  const llmDirty =
    selectedProvider !== llmSettings?.llm_provider ||
    selectedModel !== llmSettings?.llm_model

  const handleLlmSave = () => {
    saveLlmSettings.mutate(
      { llm_provider: selectedProvider, llm_model: selectedModel },
      {
        onSuccess: () => {
          setLlmSaved(true)
          setTimeout(() => setLlmSaved(false), 2500)
        },
      },
    )
  }

  const handleWorkSave = () => {
    saveWorkLocation.mutate(workAddress.trim(), {
      onSuccess: () => {
        setWorkSaved(true)
        setTimeout(() => setWorkSaved(false), 2500)
      },
    })
  }

  const activeSources = sources?.filter(s => s.active && s.coverage_mode === 'direct' && s.implementation_status === 'ready').length ?? 0
  const indirectSources = sources?.filter(s => s.operational_status === 'covered_indirectly').length ?? 0
  const pendingSources = sources?.filter(s => s.implemented === false).length ?? 0
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

        <div className="overflow-hidden rounded-2xl border border-[#cfdede] bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#176B87] text-white">
                <MapPin size={14} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Endereço do trabalho</h2>
                <p className="mt-0.5 text-xs text-slate-500">Usado para calcular gratuitamente a proximidade dos imóveis.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3 px-5 py-5">
            <label className="block text-xs font-semibold text-slate-500" htmlFor="work-address">Endereço completo</label>
            <input
              id="work-address"
              value={workAddress}
              onChange={event => { setWorkAddress(event.target.value); setWorkSaved(false) }}
              placeholder="Rua, número, cidade e estado"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#176B87] focus:bg-white focus:ring-2 focus:ring-[#176B87]/10"
            />
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] leading-relaxed text-slate-400">
                {llmSettings?.work_geocoded_at
                  ? `Localizado · ${Math.round((llmSettings.work_geocode_confidence ?? 0) * 100)}% de confiança`
                  : 'A distância exibida será aproximada e calculada matematicamente.'}
              </p>
              <button
                type="button"
                onClick={handleWorkSave}
                disabled={workAddress.trim().length < 5 || workAddress.trim() === (llmSettings?.work_address ?? '') || saveWorkLocation.isPending}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${workSaved ? 'bg-emerald-500 text-white' : 'bg-[#163447] text-white hover:bg-[#0f293a] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'}`}
              >
                {workSaved ? <><Check size={13} /> Salvo</> : saveWorkLocation.isPending ? 'Localizando…' : 'Salvar endereço'}
              </button>
            </div>
            {saveWorkLocation.isError && <p className="text-xs font-semibold text-red-600">{(saveWorkLocation.error as Error).message}</p>}
            <p className="text-[10px] text-slate-400">Localização por dados abertos · Powered by Geoapify / OpenStreetMap</p>
          </div>
        </div>

        {/* LLM settings card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
                <Cpu size={14} className="text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Modelo de IA</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Provider e modelo usado nas avaliações de imóveis e na leitura de documentos oficiais
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-5 space-y-4">
            {llmLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Provider select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Provider</label>
                  <div className="flex gap-2">
                    {(Object.keys(LLM_PROVIDERS) as LlmProvider[]).map(p => (
                      <button
                        key={p}
                        onClick={() => handleProviderChange(p)}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-semibold border transition-all ${
                          selectedProvider === p
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        {LLM_PROVIDERS[p].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Model select */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Modelo</label>
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    className="w-full py-2.5 px-3 rounded-xl text-sm text-slate-800 border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition-all"
                  >
                    {LLM_PROVIDERS[selectedProvider].models.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    {selectedProvider === 'openrouter'
                      ? 'Requer OPENROUTER_API_KEY configurada no backend. Qualidade da análise varia por modelo.'
                      : selectedProvider === 'openai'
                        ? 'Requer OPENAI_API_KEY configurada no backend.'
                        : 'Requer ANTHROPIC_API_KEY no backend. Claude Sonnet 4.6 é o recomendado para análises.'}
                  </p>
                </div>

                {/* Save button */}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-slate-400">
                    {llmSettings
                      ? `Atual: ${LLM_PROVIDERS[llmSettings.llm_provider]?.label} — ${llmSettings.llm_model}`
                      : 'Padrão: Anthropic — claude-sonnet-4-6'}
                  </p>
                  <button
                    onClick={handleLlmSave}
                    disabled={!llmDirty || saveLlmSettings.isPending}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      llmSaved
                        ? 'bg-emerald-500 text-white'
                        : llmDirty
                          ? 'bg-slate-900 text-white hover:bg-slate-800'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {llmSaved
                      ? <><Check size={13} /> Salvo</>
                      : saveLlmSettings.isPending
                        ? 'Salvando...'
                        : 'Salvar'}
                  </button>
                </div>
                {saveLlmSettings.isError && (
                  <p className="text-xs font-semibold text-red-600">{(saveLlmSettings.error as Error).message}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Modality preferences card */}
        <div className="overflow-hidden rounded-2xl border border-[#cfdede] bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#176B87] text-white"><Info size={14} /></div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Como ler a jornada</h2>
                <p className="mt-0.5 text-xs text-slate-500">A mesa separa a etapa atual do melhor preço oficial já conhecido.</p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 px-5 py-4 text-xs text-slate-600 md:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-900">Quadrados da mesa</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                <span className="flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[3px] bg-[#176B87] ring-2 ring-[#bce3e1]" />Etapa atual</span>
                <span className="flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-[3px] border border-[#C68A2D] bg-[#fff4df]" />Melhor preço</span>
              </div>
              <p className="mt-2 text-slate-500">Passe o mouse sobre cada etapa para ver valor, data e situação.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Regras por fonte</p>
              <p className="mt-2"><strong>Caixa SFI:</strong> dois quadrantes — 1º e 2º leilões. Venda Online, Licitação e Compra Direta são modalidades independentes quando anunciadas.</p>
              <p className="mt-1"><strong>Superbid/SOLD:</strong> um, dois ou três quadrantes, conforme as praças publicadas no lote.</p>
              <p className="mt-1"><strong>Mega:</strong> praça única ou duas praças, conforme o cartão. <strong>Zuk:</strong> normalmente dois leilões; Venda Direta é uma modalidade de etapa única.</p>
            </div>
          </div>
        </div>

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
                      {detail?.tip && (
                        <p className={`text-[11px] font-semibold mt-1 ${isActive ? cfg.color : 'text-slate-400'}`}>↳ {detail.tip}</p>
                      )}
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
                  {sourcesLoading
                    ? 'Carregando...'
                    : `${activeSources} coletor${activeSources !== 1 ? 'es' : ''} ativo${activeSources !== 1 ? 's' : ''} · ${indirectSources} cobertura${indirectSources !== 1 ? 's' : ''} indireta${indirectSources !== 1 ? 's' : ''}${pendingSources ? ` · ${pendingSources} pendente${pendingSources !== 1 ? 's' : ''}` : ''}`}
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
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${source.operational_status === 'collecting' ? 'bg-emerald-500' : source.operational_status === 'covered_indirectly' ? 'bg-sky-500' : 'bg-slate-300'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{source.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {source.implemented === false
                        ? 'Em integração — ainda não participa da cobertura'
                        : source.coverage_mode === 'indirect'
                        ? `${source.property_count ?? 0} imóvel(is) identificado(s) por parceiros`
                        : source.last_scraped_at
                        ? `${source.property_count ?? 0} imóvel(is) · Última busca: ${new Date(source.last_scraped_at).toLocaleString('pt-BR')}`
                        : 'Nunca executado'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      Status: {source.coverage_mode === 'indirect' ? 'Cobertura indireta' : source.implementation_status ?? 'não informado'}
                      {' · '}Última tentativa: {source.last_attempted_at
                        ? new Date(source.last_attempted_at).toLocaleString('pt-BR')
                        : 'Nunca tentada'}
                    </p>
                    {source.coverage_mode === 'indirect' && source.coverages && source.coverages.length > 0 && (
                      <p className="text-[11px] text-sky-600 mt-1 leading-relaxed">
                        Coberta por: {source.coverages.map(coverage => coverage.collector_source_id).join(', ')}
                      </p>
                    )}
                    {source.last_error && (
                      <p className="text-[11px] text-rose-600 mt-1 line-clamp-2">Diagnóstico: {source.last_error}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {source.active && source.implementation_status === 'ready'
                    ? <CheckCircle2 size={15} className="text-emerald-500" />
                    : <XCircle size={15} className="text-slate-300" />
                  }
                  <button
                    onClick={() => toggleSource.mutate({ id: source.id, active: !source.active })}
                    disabled={!source.can_activate}
                    aria-label={source.implemented === false ? `${source.name} ainda não disponível` : `${source.active ? 'Desativar' : 'Ativar'} ${source.name}`}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                      source.active ? 'bg-slate-900' : 'bg-slate-200'
                    } ${!source.can_activate ? 'cursor-not-allowed opacity-40' : ''
                    }`}
                    title={source.implemented === false ? 'Integração ainda não disponível' : source.active ? 'Desativar fonte' : 'Ativar fonte'}
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
