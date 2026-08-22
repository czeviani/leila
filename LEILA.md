# LEILA — Referência Completa para IA

> **Este é o documento de referência definitivo da plataforma Leila.**
> Sempre leia este arquivo antes de qualquer intervenção no projeto.
> Ele descreve arquitetura, decisões de design, regras e armadilhas conhecidas.

---

## O que é a Leila Radar

Plataforma pessoal de diligência para imóveis de leilão bancário. A cobertura executável atual é Caixa em 27 UFs; BB e Santander são roadmap e não podem ser ativados sem adapter validado. A interface deixa explícitas a procedência, a última observação e a completude dos dados. A IA é apoio à triagem, nunca confirmação de disponibilidade nem substituta da fonte oficial.

### Contrato de confiança (Migration 009)

- `availability_status`: `available` (observado), `suspect` (uma ausência em coleta válida) ou `unavailable` (duas ausências consecutivas).
- Falha de UF, WAF ou escrita impede reconciliação; uma rodada parcial nunca remove anúncios.
- `last_seen_at` registra a última presença; `last_verified_at` só avança em observação positiva ou confirmação negativa final.
- `data_quality_score` mede completude de campos (0–100), não veracidade nem qualidade do investimento.
- `leila_ingestion_runs` registra status, regiões verificadas/falhas e contagens de cada execução.
- `leila_reconcile_missing` faz a reconciliação set-based e atômica como `service_role`.
- Aplicar `009_data_trust_pipeline.sql` antes de publicar scraper/backend compatíveis.

**Usuário único:** Caique Zeviani (caiquezeviani@gmail.com). Sem multi-tenant. RLS ativa em todas as tabelas desde 2026-05-31.

---

## URLs e Endpoints de Produção

| Serviço   | URL                                          |
|-----------|----------------------------------------------|
| Frontend  | `leila-lemon.vercel.app`                     |
| Backend   | `leila-api.zekeon.com`                       |
| Scraper   | interno na VPS — não exposto publicamente    |
| Banco     | `mfgkpmlesblvvyasamyx.supabase.co`           |

---

## Stack

| Camada   | Tecnologia                                  | Detalhe                        |
|----------|---------------------------------------------|--------------------------------|
| Frontend | React 18 + Vite + TypeScript + Tailwind     | SPA — `frontend/`             |
| UI       | shadcn/ui (`components/ui/`)                | componentes base               |
| Backend  | Node.js 20 + Express + TypeScript           | API REST — `backend/`         |
| Scraper  | Python 3.11 + httpx + BeautifulSoup         | FastAPI — `scraper/`          |
| Banco    | Supabase (PostgreSQL)                       | prefixo `leila_` nas tabelas  |
| Auth     | Supabase Auth (JWT + Google SSO)            | middleware em `auth.ts`       |
| IA       | Anthropic API (Claude Sonnet 4.6)           | avaliações de imóveis         |
| Proxy    | IPs brasileiros rotativos                   | obrigatório para Caixa        |

---

## Localização dos Arquivos

```
/root/projects/web/leila/
├── CLAUDE.md              ← guia de engenharia resumido
├── LEILA.md               ← ESTE ARQUIVO (referência definitiva)
├── docker-compose.yml     ← containers backend + scraper na VPS
├── Dockerfile.backend
├── Dockerfile.scraper
├── vercel.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                         ← router principal
│   │   ├── pages/
│   │   │   ├── PropertiesPage.tsx          ← lista principal (grid + lista densa)
│   │   │   ├── PropertyDetailPage.tsx      ← detalhe + avaliação IA
│   │   │   ├── FavoritesPage.tsx           ← fila de avaliação em massa
│   │   │   ├── LoginPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── components/
│   │   │   ├── properties/
│   │   │   │   ├── PropertyCard.tsx        ← card do modo grid
│   │   │   │   └── PropertyRow.tsx         ← linha do modo lista densa (default)
│   │   │   ├── filters/
│   │   │   │   └── FilterPanel.tsx         ← painel de filtros
│   │   │   ├── evaluator/
│   │   │   │   └── InvestmentDashboard.tsx ← dashboard financeiro da avaliação IA
│   │   │   └── ui/                         ← shadcn components
│   │   ├── hooks/
│   │   │   └── useProperties.ts            ← todos os hooks TanStack Query
│   │   ├── lib/
│   │   │   ├── api.ts                      ← tipos + chamadas ao backend
│   │   │   ├── heatScore.ts               ← cálculo de temperatura (heat_score)
│   │   │   └── supabase.ts                ← cliente Supabase
│   │   └── context/
│   │       └── AuthContext.tsx
│   └── public/
│       └── property-placeholder.svg        ← fallback para imagens quebradas
├── backend/
│   └── src/
│       ├── server.ts
│       ├── config/supabase.ts
│       ├── middleware/auth.ts
│       ├── routes/                         ← um arquivo por recurso
│       └── controllers/
│           └── properties.controller.ts    ← filtros, sort, busca, heat_score
├── scraper/
│   ├── main.py                             ← FastAPI, porta 8000
│   ├── sources/
│   │   ├── base.py
│   │   ├── caixa.py                        ← scraper Caixa + MODALITY_MAP
│   │   └── area_classifier.py             ← classificação heurística de área
│   └── proxy/manager.py
└── supabase/
    └── migrations/
        ├── 001_initial_schema.sql
        ├── 002_evaluation_financial_fields.sql
        ├── 003_modality_area_classification.sql
        ├── 004_llm_settings.sql (ou area_classification_on_properties)
        ├── 005_property_enrichment_fields.sql
        ├── 006_backfill_enrichment_from_description.sql
        └── 007_heat_score.sql              ← heat_score + trigger + índice
```

---

## Banco de Dados — Tabelas Principais

### `leila_properties`
| Coluna                | Tipo          | Detalhe                                         |
|-----------------------|---------------|-------------------------------------------------|
| `id`                  | uuid          | PK                                              |
| `source_id`           | uuid          | FK → `leila_sources`                            |
| `external_id`         | text          | ID original da fonte                            |
| `title`               | text          |                                                 |
| `address`             | text          |                                                 |
| `city`                | text          |                                                 |
| `state`               | text          | UF (2 letras)                                   |
| `property_type`       | text          | apartamento/casa/terreno/loja/galpão/sala/sobrado|
| `area_m2`             | numeric       |                                                 |
| `useful_area_m2`      | numeric       | preferível sobre `area_m2` quando existir       |
| `appraised_value`     | numeric       | valor de avaliação do banco                     |
| `auction_price`       | numeric       | lance mínimo                                    |
| `discount_pct`        | numeric       | `(appraised - auction) / appraised * 100`       |
| `auction_date`        | timestamptz   |                                                 |
| `auction_status`      | text          |                                                 |
| `auction_modality`    | text          | ver seção Modalidades                           |
| `area_classification` | text          | heurística do scraper (nobre/intermediário/popular/comunidade/indefinido) |
| `bedrooms`            | smallint      |                                                 |
| `bathrooms`           | smallint      |                                                 |
| `parking_spots`       | smallint      |                                                 |
| `is_occupied`         | boolean       | imóvel ocupado = risco adicional                |
| `heat_score`          | numeric       | **calculado via trigger** — ver seção Heat Score|
| `photos`              | text[]        | URLs; podem expirar (usar fallback)             |
| `edital_url`          | text          |                                                 |
| `scraped_at`          | timestamptz   |                                                 |
| `features`            | jsonb         |                                                 |

### `leila_evaluations`
| Coluna              | Tipo    | Detalhe                                               |
|---------------------|---------|-------------------------------------------------------|
| `id`                | uuid    | PK                                                    |
| `property_id`       | uuid    | FK → `leila_properties`                               |
| `status`            | text    | pending / processing / done / error                   |
| `score`             | numeric | 0–10                                                  |
| `recommendation`    | text    | strong_buy / consider / risky / avoid                 |
| `area_classification`| text  | nobre/intermediário/popular/comunidade — **sobrescreve heurística** |
| `financial_data`    | jsonb   | estrutura `EvaluationFinancialData` (ver `api.ts`)    |
| `risks`             | text[]  |                                                       |
| `highlights`        | text[]  |                                                       |
| `price_per_m2`      | numeric |                                                       |

### `leila_sources`
Fontes de scraping: Caixa, BB, Santander. Campos: `name`, `active`, `last_scraped_at`, `scraper_key`.

### `leila_filters`
Filtros persistidos do usuário. Um registro por `user_id`.

### `leila_favorites`
Imóveis selecionados para avaliação IA. Relação `user_id × property_id`.

### `leila_document_analyses`
Uma linha por imóvel (`UNIQUE property_id` — re-análise sobrescreve). Colunas v2: `liabilities` (jsonb, ver `Liability` em `api.ts`), `payment_rules`, `conflicts`, `documents_read`, `total_arrematante_brl`, `stage`/`stage_detail` (progresso durante `processing`).

### `leila_property_documents`
Um snapshot por documento lido (`UNIQUE property_id, source_url, content_hash`) — `document_type` em `edital`/`matricula`/`laudo`/`errata`/`certificate`/`attachment`/`listing`/`unknown`. Alimentada pelo pipeline de leitura documental (F1), não pela coleta em lote.

### `leila_ai_usage_events`
**Append-only** — cada chamada de IA do projeto (leitura documental, avaliação, enriquecimento do scraper) vira uma linha permanente, nunca atualizada. `run_id` agrupa uma rodada inteira (ex.: os 3 agentes de uma leitura documental). Existe porque `leila_document_analyses`/`leila_evaluations` são `UNIQUE(property_id)` e re-análises perdiam o histórico de custo.

---

## Heat Score (Migration 007)

**O que é:** score de oportunidade composto (0–100) calculado automaticamente via trigger PostgreSQL a cada INSERT/UPDATE em `leila_properties`.

**Função:** `leila_calc_heat_score(discount_pct, state, auction_modality, area_classification, auction_date)`

**Critérios e pesos:**
| Critério               | Peso máximo | Detalhe                                           |
|------------------------|-------------|---------------------------------------------------|
| Desconto               | 35 pts      | `min(discount_pct / 50, 1) × 35` — 50% = máximo  |
| Região Sudeste         | 20 pts      | SP, RJ, MG, ES                                    |
| Modalidade             | 15 pts      | 2ª praça=15, online=10, direta=8, proposta=5, 1ª=3|
| Classificação de área  | 15 pts      | nobre=15, intermediário=10, popular=5             |
| Urgência temporal      | 15 pts      | ≤7 dias=15, ≤30 dias=8, >30 dias=3               |

**Tiers no frontend (`heatScore.ts`):**
| Score | Tier   | Label        | Emoji |
|-------|--------|--------------|-------|
| 60+   | hot    | Quente       | 🔥   |
| 40-59 | warm   | Boa oferta   | ⚡   |
| 20-39 | cool   | Regular      | 📋   |
| <20   | cold   | Frio         | —    |

**Cuidado com urgência:** o score do banco é calculado no momento do INSERT/UPDATE. Como o scraper roda terças e sextas, propriedades com leilão na semana seguinte terão urgência recalculada a cada scrape. Propriedades muito antigas (leilão encerrado) não atualizam automaticamente — use `UPDATE leila_properties SET heat_score = leila_calc_heat_score(...)` periodicamente se necessário.

---

## Modalidades de Leilão

| Chave              | Label         | Ícone       | Destaque                        |
|--------------------|---------------|-------------|---------------------------------|
| `segunda_praca`    | 2ª Praça      | Tag         | **Melhor oportunidade** — lance ~60% do avaliado |
| `compra_direta`    | Compra Direta | ShoppingCart| Preço fixo, sem concorrência    |
| `leilao_online`    | Leilão Online | Gavel       | Lances em tempo real            |
| `primeira_praca`   | 1ª Praça      | Users       | Lance = valor avaliado          |
| `proposta_fechada` | Proposta      | Mail        | Banco escolhe melhor oferta     |

---

## Classificação de Área — Dois Níveis

**Nível 1 — Heurística do scraper** (zero tokens, automático):
- Módulo: `scraper/sources/area_classifier.py`
- Campo: `leila_properties.area_classification`
- Lógica: keywords de comunidade → nobre → preço/m² vs threshold por tier de cidade
- Tiers de cidade: SP/RJ/BSB/Curitiba/POA=high; capitais médias=mid; interior=low

**Nível 2 — IA (avaliação sob demanda)**:
- Campo: `leila_evaluations.area_classification`
- **Prioridade no frontend:** `evaluation.area_classification ?? property.area_classification`
- Badge mostra `✦` quando vem da IA, `~` quando é estimativa

---

## Filtros do Backend — Parâmetros da API

`GET /api/properties` aceita:

| Parâmetro               | Tipo    | Exemplo                  | Detalhe                                      |
|-------------------------|---------|--------------------------|----------------------------------------------|
| `state`                 | string  | `SP,RJ,MG`               | multi-valor separado por vírgula             |
| `city`                  | string  | `São Paulo,Campinas`     | ILIKE em cada cidade                         |
| `type`                  | string  | `apartamento,casa`       | tipo de imóvel                               |
| `price_min`             | number  | `200000`                 |                                              |
| `price_max`             | number  | `800000`                 |                                              |
| `discount_min`          | number  | `30`                     | % mínimo de desconto                         |
| `modality`              | string  | `segunda_praca`          | modalidade de leilão                         |
| `search`                | string  | `itaim bibi`             | ILIKE em title, city e address               |
| `has_evaluation`        | boolean | `true`                   | apenas imóveis com avaliação IA concluída    |
| `area_classification`   | string  | `nobre,intermediário`    | classificação de área                        |
| `days_until_auction_max`| number  | `7`                      | leilão nos próximos N dias                   |
| `sort_by`               | string  | `heat_score`             | heat_score/discount_pct/auction_price/area_m2/scraped_at/auction_date |
| `sort_order`            | string  | `desc`                   | asc ou desc                                  |
| `page`                  | number  | `1`                      |                                              |
| `limit`                 | number  | `50`                     | 50/100/99999                                 |

---

## Avaliação IA — Fluxo

1. Usuário clica "Selecionar para Avaliação" no card/row → favorita o imóvel
2. Na `FavoritesPage`, clica "Avaliar com IA" (ou "Avaliar todos")
3. Backend chama `evaluator.service.ts` → Claude Sonnet 4.6
4. Status: pending → processing → done/error
5. Polling automático: `useProperty` refetch a cada 3s quando status=processing
6. Resultado: `EvaluationFinancialData` em JSONB — exibido em `InvestmentDashboard`

**Model padrão:** `claude-sonnet-4-6` (configurável em Settings por usuário via `leila_llm_settings`)

**Campos da avaliação IA (`financial_data`):**
- `resumo_executivo`: veredicto (COMPRAR/NEGOCIAR/EVITAR), score_geral, frase_decisiva
- `preco_justo`: comparação com mercado regional
- `potencial_pos_reforma`: ROI estimado, custo de reforma
- `analise_aluguel`: yield bruto, aluguel estimado, vacância
- `viabilidade_financeira`: investimento total, payback, TIR, vs CDI
- `riscos[]`: lista com categoria, severidade, probabilidade, mitigação
- `indicadores_mercado`: liquidez, demanda, tendência 12m
- `checklist_due_diligence`: itens críticos/importantes/recomendados
- `recomendacao_reforma`: escopo mínimo, recomendado, itens de alto impacto

---

## Leitura Documental — Pipeline v2 (3 agentes)

Botão "Ler condições oficiais" / "Atualizar leitura" em `DocumentAnalysisPanel.tsx`. Diferente da avaliação IA (que lê só os dados já estruturados do anúncio), esta lê os **documentos oficiais** do imóvel — edital, matrícula, laudo de avaliação — e responde à pergunta "quem paga cada dívida: eu (arrematante) ou o vendedor?".

**Antes da v2** (até 2026-08): o botão fazia um único fetch na página de anúncio via `r.jina.ai`, cortava 24k caracteres e mandava para `qwen/qwen3.5-9b`; a saída da IA era sobrescrita por um regex sempre que o regex não achava nada. Nunca lia matrícula ou laudo. Substituído.

**Fluxo (todo em `backend/src/services/document-agents/` + `document-analysis.service.ts`):**
1. **Descoberta** — `POST {SCRAPER_URL}/documents/discover` (`scraper/documents.py`): abre a página do imóvel com o mesmo proxy BR + `curl_cffi impersonate="chrome120"` da coleta em lote, varre `<a href>` por PDFs de edital/matrícula/laudo, classifica por tipo. Para Superbid/Sold, extrai `product.attachments` do `__NEXT_DATA__` (não são `<a href>`). Para Mega Leilões, também segue `raw_data.event_url` (o edital vive na página do leilão, não na do lote).
2. **Coleta** — `POST {SCRAPER_URL}/documents/fetch` baixa cada documento (teto 32 MB) e devolve base64; até 6 documentos por rodada, priorizando edital/matrícula/laudo. Persistido em `leila_property_documents`.
3. **Agente A — Extrator** (`extractor.ts`, 1 chamada por documento, em paralelo, `claude-sonnet-5`): lê o PDF nativamente (bloco `document` base64, sem parser) com `citations: {enabled: true}`. Cada fato extraído carrega um `verbatim_quote` **verificado pelo servidor da Anthropic** como trecho literal do documento — frase sem citação anexada é descartada. É o guard-rail anti-alucinação; substitui o regex antigo.
4. **Agente B — Jurista de ônus** (`liabilities.ts`, 1 chamada, `claude-opus-5`): classifica cada ônus (condomínio, IPTU, hipoteca, penhora, ação judicial, ITBI, comissão...) por `payer`: `arrematante` | `vendedor` | `sub_rogado_no_preco` | `indefinido`. "Indefinido" é o veredicto correto quando os documentos não deixam claro — nunca vira silenciosamente "sem dívida".
5. **Agente C — Consolidador** (`consolidator.ts`, 1 chamada, `claude-sonnet-5`): monta resumo, riscos ranqueados, tags, conflitos entre documentos (ex.: um diz desocupado, outro diz ocupado) e `completeness_score`.

**Custo:** cada chamada de cada agente grava uma linha em `leila_ai_usage_events` (append-only, `run_id` agrupa uma rodada inteira). Preços em `ai-usage.service.ts`. Exibido no rodapé do painel via `GET /api/properties/:id/ai-usage`.

**Modelos** (env, todos com default sensato — só sobrescrever para testar): `DOCUMENT_EXTRACTOR_MODEL`, `DOCUMENT_LIABILITIES_MODEL`, `DOCUMENT_CONSOLIDATOR_MODEL`.

**Onde "quem paga" aparece na tela:** três grupos no topo do painel — 🔴 Você paga (arrematante, com total em destaque) · 🟢 Quitado/sub-rogado · ⚪ Indefinido (a confirmar antes do lance).

---

## Modos de Visualização

### Modo Lista (default, `viewMode='list'`)
- Componente: `PropertyRow.tsx`
- ~17-20 imóveis visíveis por tela sem scroll
- Persistido em `localStorage('leila_view_mode')`
- Colunas: Heat | Desconto | Tipo+Modalidade | Localização+Área | Título+Métricas | Preço | Urgência | Score IA | Ações

### Modo Grid
- Componente: `PropertyCard.tsx`
- 4 colunas em 1920px
- Mantido para visão macro e quando preferido

### Estado "Descartados"
- Imóveis descartados com botão × no modo lista
- Armazenados em `localStorage('leila_dismissed')`
- Botão "Restaurar N" visível no header quando há descartados
- **Não persiste entre dispositivos** — apenas local storage

---

## Imagens

**Problema:** URLs de fotos da Caixa expiram ou retornam 403 após algum tempo.

**Solução implementada:**
- `PropertyDetailPage`: `onError={(e) => e.currentTarget.src = '/property-placeholder.svg'}`
- `PropertyCard`: não exibe foto na listagem (decisão de performance)
- Placeholder: `frontend/public/property-placeholder.svg`

**Regra:** toda `<img>` de foto de imóvel deve ter `onError` com fallback para o placeholder.

---

## Scraping

**Agendamento:** GitHub Actions — **terças e sextas às 07h BRT** (cron `0 10 * * 2,5` UTC)

**Arquivo:** `.github/workflows/scraper.yml`

**Botão manual:** "Atualizar dados" em `PropertiesPage` → `POST /api/scraper/run/all`

**Caixa Econômica:** bloqueia IPs não brasileiros — proxy rotation com IPs BR é obrigatório em produção. Em dev local, `NODE_ENV=development` desabilita proxy.

**MODALITY_MAP** está em `scraper/sources/caixa.py` — sempre atualizar lá quando a Caixa mudar os labels.

---

## Infraestrutura VPS

**IP do servidor:** `195.201.34.10`

**Containers Docker:**
- `leila-api` → porta 3001 → exposto via Traefik em `leila-api.zekeon.com`
- `leila-scraper` → porta `127.0.0.1:8000` → bind local, **não exposto publicamente**

**CRÍTICO — Traefik:**
- Configuração em `/etc/easypanel/traefik/config/leila.yaml`
- Traefik aponta para `http://195.201.34.10:3001/` (IP do host), **NÃO** pelo hostname do container
- Motivo: container standalone não é acessível via hostname no overlay Docker Swarm do Easypanel
- Se o IP do servidor mudar, atualizar `/etc/easypanel/traefik/config/leila.yaml`
- Após `docker compose build && docker compose up -d`, o Traefik continua funcionando sem ação adicional

**Segurança (aplicada 2026-05-31):**
- **CORS:** restrito a `CORS_ORIGINS=https://leila-lemon.vercel.app` no backend
- **Rate limiting:** `/api` geral 300 req/15min; `/api/evaluations` 5 req/min (express-rate-limit)
- **Scraper auth:** todos os endpoints exigem header `X-Scraper-Secret` — secret em `backend/.env` e `scraper/.env`
- **RLS:** ativa em todas as 6 tabelas leila_*
  - `leila_properties`, `leila_sources`: SELECT para usuários autenticados (escrita via service_role do scraper)
  - `leila_filters`, `leila_favorites`, `leila_evaluations`, `leila_settings`: ALL com `auth.uid() = user_id`
- **vercel.json:** CSP sem `unsafe-eval`, HSTS `max-age=63072000`, `Permissions-Policy`
- **LLM model whitelist:** `settings.controller.ts` valida modelo contra lista fixa por provider

**Rede Docker:**
- Containers na rede `leila-net`
- Backend também declarado na rede `easypanel-zeke` no compose (não remover)

---

## Deploy

### Frontend
```
git push origin master → Vercel deploy automático
URL: leila-lemon.vercel.app
```

**Workaround se Vercel CLI falhar:**
```bash
cd /root/.openclaw/workspace && npx vercel --prod --yes
```

### Backend
```bash
cd /root/projects/web/leila
docker compose build leila-api && docker compose up -d leila-api
```

### Verificar logs do backend
```bash
docker compose logs -f leila-api
```

---

## Variáveis de Ambiente

### Backend (`backend/.env`)
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://mfgkpmlesblvvyasamyx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
SCRAPER_URL=http://localhost:8000
PORT=3001
NODE_ENV=production
```

### Frontend (`frontend/.env` / Vercel env vars)
```
VITE_SUPABASE_URL=https://mfgkpmlesblvvyasamyx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=https://leila-api.zekeon.com
```

### Scraper (`scraper/.env`)
```
PROXY_LIST=ip1:port:user:pass,ip2:port:user:pass,...
PROXY_ROTATION=true
```

---

## Migrations — Histórico

| Arquivo                                    | O que faz                                                         |
|--------------------------------------------|-------------------------------------------------------------------|
| `001_initial_schema.sql`                   | Tabelas base: properties, sources, favorites, filters, evaluations|
| `002_evaluation_financial_fields.sql`      | `price_per_m2`, `financial_data` JSONB em evaluations            |
| `003_modality_area_classification.sql`     | `auction_modality` em properties; `area_classification` em evaluations |
| `004_area_classification_on_properties.sql`| `area_classification` em properties (heurística do scraper)      |
| `005_property_enrichment_fields.sql`       | `bedrooms`, `bathrooms`, `parking_spots`, `is_occupied`, `useful_area_m2` |
| `006_backfill_enrichment_from_description.sql` | Backfill dos campos acima via parsing de description          |
| `007_heat_score.sql`                       | `heat_score` coluna + função `leila_calc_heat_score` + trigger + índice |
| *(tabela não mantida entre 007 e 2026-08 — ver `supabase/migrations/` para o histórico real)* | |
| `20260822150000_leila_ai_usage_events.sql` | Cria `leila_ai_usage_events` (append-only, custo de IA por chamada)   |
| `20260822150100_document_analysis_v2.sql`  | `liabilities`, `payment_rules`, `conflicts`, `documents_read`, `stage`/`stage_detail`, `total_arrematante_brl` em `leila_document_analyses` |

**Para aplicar nova migration:**
- Via MCP Supabase: `mcp__supabase__apply_migration` com `project_id=mfgkpmlesblvvyasamyx`
- Ou criar o arquivo em `supabase/migrations/` e rodar `supabase db push` (se CLI disponível)
- Sempre numerar sequencialmente: `008_`, `009_`, etc.

---

## Padrões de Código

### Backend
- Controllers em `controllers/`, um arquivo por módulo
- Rotas em `routes/`, registradas em `server.ts`
- Usar `req.supabase` (não admin client) para queries autenticadas
- Retornar sempre `res.json()` ou `res.status(xxx).json()`
- `supabaseAdmin` apenas em controllers que precisam de bypass de RLS

### Frontend
- Chamadas ao backend via `api.*` em `lib/api.ts`
- Queries com TanStack Query (`useQuery` / `useMutation`)
- Tipos compartilhados em `lib/api.ts`
- UI components: shadcn em `components/ui/`
- Preferir `useMemo` para sets/listas derivados (ex: `favoriteIds`)

### Banco
- Prefixo `leila_` em todas as tabelas e funções
- RLS desativado (V1 — single-user)
- Migrations em `supabase/migrations/` numeradas sequencialmente

---

## Regras Absolutas

1. **Sempre ler os arquivos antes de editar** — nunca escrever de memória
2. **`npm run build` antes de commitar** — zero build errors é requisito
3. **Nunca quebrar auth** — `authMiddleware` em todas as rotas `/api/*`
4. **Model de IA:** `claude-sonnet-4-6` para avaliações, `claude-haiku-4-5-20251001` para tarefas simples
5. **Traefik aponta para IP do host** (195.201.34.10:3001), nunca hostname do container
6. **Toda imagem de imóvel deve ter `onError` com fallback** para `/property-placeholder.svg`
7. **Heat score é calculado no banco** via trigger — nunca sobrescrever `heat_score` manualmente sem entender o trigger
8. **Busca textual é server-side** — nunca filtrar lista de imóveis no cliente (`filteredProperties` foi removido)
9. **Nunca usar GitHub MCP nesta VPS** — usar `gh` CLI via Bash (já autenticado como czeviani)
10. **Push para `master` trigga Vercel deploy automático** — checar o deploy após push

---

## Armadilhas Conhecidas

### Imagens expiradas da Caixa
URLs de fotos têm TTL curto. Sempre usar `onError` com fallback. O `PropertyCard` no modo lista não exibe foto (decisão intencional de performance).

### `area_classification` com acento
O valor `'intermediário'` tem acento (ó). Comparações devem ser exatas. Verificar encoding ao salvar/comparar strings.

### Heat score e urgência temporal
O heat score é calculado no INSERT/UPDATE, não recalculado diariamente. Imóveis com leilão amanhã que não foram atualizados hoje terão urgência desatualizada. O scraper bieweekly (ter/sex) atualiza registros e re-trigga o cálculo.

### `sort_by=heat_score` é o novo default
O backend agora ordena por `heat_score DESC` por padrão (antes era `discount_pct`). Se adicionar novos sort options, atualizar `SORT_FIELDS` em `properties.controller.ts`.

### `pageSize=99999` como "mostrar tudo"
Magic number intencional. Funciona até ~100k imóveis. Se o banco crescer muito, implementar scroll infinito.

### Estado "descartados" é local
`localStorage('leila_dismissed')` — não sincroniza entre dispositivos/browsers. Isso é intencional (ferramenta pessoal de uso single-session).

### Filtros são persistidos no banco
`leila_filters` persiste os filtros do usuário no Supabase. Ao carregar a página, os filtros são restaurados e aplicados automaticamente. Sempre incluir novos campos de filtro em:
1. Interface `PropertyFilters` em `api.ts`
2. Função `filtersToParams` em `FilterPanel.tsx`
3. Hook `useFilters` / `useSaveFilters` (já genérico)
4. Backend `properties.controller.ts`

---

## Histórico de Decisões Importantes

| Data       | Decisão                                                     | Motivo                                      |
|------------|-------------------------------------------------------------|---------------------------------------------|
| 2026-04-05 | Google SSO configurado                                      | facilidade de login                         |
| 2026-04-05 | Traefik → IP host, não hostname container                   | Easypanel Swarm não roteia por hostname     |
| 2026-05-23 | Lista densa como modo default                               | 4x mais imóveis visíveis por scroll         |
| 2026-05-23 | Heat score via trigger PostgreSQL (não client-side)         | Permite sort server-side em 25k+ imóveis    |
| 2026-05-23 | Busca textual movida para backend                           | Busca client-side só operava em 50 registros|
| 2026-05-23 | Imóvel descartado via localStorage (não banco)              | Simplicidade — single user, single device   |
| 2026-05-23 | Filtro "Apenas com IA" como toggle proeminente              | Feature de maior ROI para o usuário         |
| 2026-05-23 | Atalhos de região no FilterPanel                            | 1 clique para selecionar 4 estados do Sudeste|
