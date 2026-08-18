# Plano de execução — raspagem multifonte do Leila Radar

## Estado da execução — 18/08/2026

Escopo operacional fixado em **SP / cidade de São Paulo**.

| Fonte | Estratégia em produção | Estado | Resultado da rodada |
|---|---|---|---:|
| Caixa | CSV oficial, executor com IP/proxy brasileiro | Bloqueada na VPS alemã; preserva histórico | 598 ativos históricos |
| Mega Leilões | HTML público determinístico | Ativa | 85 ativos |
| Zuk | leitor textual externo, sem IA | Ativa com catálogo parcial explícito | 30 ativos |
| Superbid | JSON estruturado `__NEXT_DATA__` | Ativa | 33 ativos observados |
| SOLD | canal identificado dentro da Superbid | Ativa | 14 ativos |
| Santander | atribuição de vendedor nos parceiros | Cobertura indireta | 5 observados na rodada |
| Itaú | atribuição de vendedor nos parceiros | Cobertura indireta | 15 observados na rodada |
| Bradesco | atribuição de vendedor nos parceiros | Cobertura indireta | 1 observado na rodada |
| Banco do Brasil | atribuição explícita; portal oficial monitorado | Cobertura indireta, zero atual | 0 observado |

Entregue nesta execução:

- uma rodada automática por dia, às 06:00 de Brasília;
- coletores diretos de Mega, Zuk, Superbid e SOLD;
- separação entre origem do anúncio (`source_id`) e vendedor (`seller_id`);
- persistência em lote, staging, snapshots, trava de concorrência e heartbeat;
- reconciliação de ausentes limitada a catálogos completos;
- escopo geográfico aplicado no coletor, na persistência e no backend;
- painel de fontes com última tentativa, último sucesso, volume, erro e cobertura indireta;
- banco, backend, scraper e frontend publicados;
- rodada real concluída e verificada.

Pendência operacional conhecida: a Caixa retorna HTTP 403 na VPS da Alemanha. O coletor está pronto e limitado a SP, mas a próxima melhoria é executá-lo em um runner brasileiro ou contratar apenas um proxy residencial/datacenter brasileiro para essa fonte. Mover para outra VPS europeia não resolve o bloqueio geográfico.

> Documento de implementação para ser executado por uma IA/agente de desenvolvimento.
> Seguir as fases na ordem. Não ativar uma fonte antes de cumprir seus critérios de aceite.

## 1. Objetivo

Transformar o Leila de um coletor exclusivo da Caixa em uma plataforma de coleta multifonte que:

- execute uma única rodada automática por dia;
- não dependa, na primeira versão, de Apify, Bright Data, Zyte, Firecrawl ou outro serviço pago de scraping;
- tenha coletores próprios e testáveis para fontes públicas viáveis;
- mostre nas configurações todas as fontes conhecidas, inclusive as ainda não implementadas;
- deixe inequívoco quais fontes estão ativas, desativadas, em teste ou bloqueadas;
- mostre a última tentativa e a última coleta bem-sucedida de cada fonte;
- nunca apresente uma fonte como coberta quando não houver coletor validado;
- grave dados em lotes, sem milhares de requisições individuais ao Supabase;
- impeça execuções concorrentes da mesma fonte;
- mantenha procedência, histórico de alterações e segurança contra remoções causadas por falhas parciais.

## 2. Resultado esperado ao final

Ao final da execução deste plano, o catálogo deve ter, no mínimo:

| Entrada no catálogo | Coleta | Situação final pretendida | Observação |
|---|---|---|---|
| Caixa Econômica Federal | Direta | Pronta e ativa | CSV oficial por UF |
| Banco do Brasil | Direta | Pronta e ativa, se o spike for aprovado | Portal público oficial |
| Mega Leilões | Direta | Pronta e ativa, se o spike for aprovado | Agregador/leiloeiro público |
| Santander | Indireta ou inexistente | Desativada como coletor direto | Pode ter anúncios encontrados na Mega |
| Itaú | Indireta ou inexistente | Desativada como coletor direto | Pode ter anúncios encontrados na Mega |
| Bradesco | Indireta ou inexistente | Desativada como coletor direto | Pode ter anúncios encontrados na Mega |
| Zuk | Não implementada | Desativada / planejada | Executar somente em onda posterior |
| Sold | Não implementada | Desativada / planejada | Executar somente em onda posterior |
| Superbid | Não implementada | Desativada / planejada | Executar somente em onda posterior |

Banco do Brasil e Mega só podem terminar ativos se seus coletores passarem por todos os testes deste documento. Se uma delas exigir autenticação privada, CAPTCHA constante, contrato ou API paga, deve permanecer visível e desativada com o motivo registrado.

## 3. Regras obrigatórias para o agente executor

1. Ler `CLAUDE.md`, `LEILA.md`, este documento e os arquivos citados antes de editar.
2. Preservar alterações locais preexistentes e não relacionadas.
3. Trabalhar fase por fase, preferencialmente com um commit por fase.
4. Não colocar credenciais em código, log, fixture ou commit.
5. Não expor `SUPABASE_SERVICE_KEY` no frontend.
6. Toda tabela nova em `public` deve ter RLS, grants explícitos e políticas compatíveis com o usuário único atual.
7. Funções de ingestão devem usar `SECURITY INVOKER` sempre que possível e ficar acessíveis apenas ao `service_role` quando forem internas.
8. Antes de criar uma migration, executar `supabase --help`, `supabase migration --help` e criar o arquivo com `supabase migration new <nome>`.
9. Não aplicar migration diretamente na produção antes de testá-la localmente ou em ambiente de homologação.
10. Não ativar uma fonte apenas porque o HTML foi baixado uma vez.
11. Não usar IA para afirmar disponibilidade, preço ou data. Esses campos devem vir de conteúdo observável da fonte.
12. Não remover anúncios quando uma coleta estiver vazia, parcial, bloqueada ou sem cobertura comprovada.
13. Não instalar serviço pago ou contratar API durante este plano.
14. Se uma fonte não puder ser coletada de forma estável sem serviço externo, classificá-la como `blocked`, registrar o motivo e continuar.
15. Ao final de cada fase, executar os testes e critérios de aceite daquela fase antes de avançar.

## 4. Decisões de arquitetura

### 4.1 Uma rodada por dia

- Horário automático: 06:00 no horário de Brasília.
- Cron UTC do GitHub Actions: `0 9 * * *`.
- Cada fonte pronta e ativa participa no máximo uma vez da rodada automática diária.
- Execuções manuais continuam permitidas, mas devem exigir ação explícita do usuário e respeitar a trava de concorrência.
- Uma execução manual não deve disparar automaticamente um segundo mecanismo quando falhar.

### 4.2 Um único significado para “fonte ativa”

`active = true` deve significar somente:

> “Esta fonte possui um coletor validado e deve participar da rodada automática.”

Uma fonte planejada, bloqueada ou apenas coberta indiretamente nunca pode ter `active = true`.

### 4.3 Separar fonte coletada de vendedor do imóvel

Para anúncios obtidos na Mega Leilões:

- `source_id = mega_leiloes`, pois foi onde o anúncio foi observado;
- `seller_id = santander`, `itau`, `bradesco` ou outro vendedor identificado;
- a interface deve mostrar “Encontrado em Mega Leilões” e, quando conhecido, “Vendedor: Santander”.

Não gravar um anúncio obtido na Mega como se tivesse sido coletado diretamente do site do Santander.

### 4.4 Coleta determinística primeiro

Ordem de extração:

1. JSON, CSV, endpoint público ou dados estruturados presentes na página;
2. HTML com seletores e regras determinísticas;
3. expressões regulares conservadoras para texto residual;
4. IA somente para enriquecimento opcional, nunca para o funcionamento básico da fonte.

### 4.5 Compatibilidade gradual

Não reescrever a aplicação inteira para introduzir imóveis canônicos nesta primeira entrega.

- Manter `leila_properties` como tabela consumida pelo frontend.
- Adicionar procedência e vendedor de forma compatível.
- Criar snapshots e hashes sem quebrar os campos existentes.
- Deixar a entidade canônica e a deduplicação entre fontes para uma fase posterior e isolada.

## 5. Modelo de estados das fontes

Adicionar em `leila_sources`:

| Campo | Tipo sugerido | Uso |
|---|---|---|
| `implementation_status` | text | `planned`, `testing`, `ready`, `blocked`, `deprecated` |
| `source_kind` | text | `official`, `auctioneer`, `aggregator`, `coverage_target` |
| `active` | boolean | Participa da rodada automática |
| `coverage_mode` | text | `direct`, `indirect`, `none` |
| `covered_by_source_id` | text nullable | Fonte que fornece cobertura indireta |
| `requires_external_service` | boolean | Verdadeiro quando o coletor próprio não é viável |
| `last_attempted_at` | timestamptz nullable | Última tentativa, mesmo com erro |
| `last_successful_at` | timestamptz nullable | Última coleta válida e concluída |
| `last_status` | text nullable | Último resultado da fonte |
| `last_error` | text nullable | Resumo seguro do último erro |
| `last_found_count` | integer | Itens encontrados na última execução válida |
| `last_written_count` | integer | Itens inseridos ou atualizados |
| `last_duration_ms` | integer nullable | Duração total |
| `consecutive_failures` | integer | Falhas consecutivas |
| `coverage_notes` | text nullable | Explicação para o usuário |
| `collector_version` | text nullable | Versão do adaptador em produção |

Regras de banco:

- `active = true` só é permitido com `implementation_status = 'ready'`.
- `coverage_mode = 'indirect'` exige `covered_by_source_id`.
- `last_successful_at` só avança em execução `success`.
- Uma execução `partial` atualiza `last_attempted_at`, mas não substitui a data da última coleta completamente bem-sucedida.
- Manter `last_scraped_at` temporariamente para compatibilidade, sincronizado com `last_successful_at` até o frontend deixar de usá-lo.

Seed esperado após a migration:

| id | status inicial | active | coverage_mode | covered_by |
|---|---|---:|---|---|
| `caixa` | `ready` | true | `direct` | null |
| `bb` | `planned` | false | `none` | null |
| `mega_leiloes` | `planned` | false | `none` | null |
| `santander` | `planned` | false | `none` | null |
| `itau` | `planned` | false | `none` | null |
| `bradesco` | `planned` | false | `none` | null |
| `zuk` | `planned` | false | `none` | null |
| `sold` | `planned` | false | `none` | null |
| `superbid` | `planned` | false | `none` | null |

Depois que a Mega estiver validada, Santander, Itaú e Bradesco podem mudar para `coverage_mode = 'indirect'` e `covered_by_source_id = 'mega_leiloes'`, mas permanecem `active = false`, pois não têm coletores diretos.

## 6. Evolução da ingestão

### 6.1 Corrigir as execuções

Evoluir `leila_ingestion_runs` com:

- `trigger_type`: `scheduled`, `manual`, `recovery`;
- `heartbeat_at`;
- `collector_version`;
- `unchanged_count`;
- `rejected_count`;
- `duration_ms`;
- status adicionais `stale`, `cancelled` e `skipped`.

Criar índice único parcial que impeça mais de uma execução `running` por fonte.

Criar função interna para:

1. marcar como `stale` uma execução `running` cujo heartbeat tenha mais de 60 minutos;
2. tentar criar uma nova execução;
3. retornar `skipped` quando já existir uma execução válida em andamento.

Não manter lock de conexão Postgres aberto durante scraping. Usar a linha da execução e o índice único parcial como lease persistente.

### 6.2 Staging por rodada

Criar `leila_ingestion_items`:

- `run_id`;
- `source_id`;
- `external_id`;
- `state` ou região da fonte;
- `normalized_data jsonb`;
- `raw_data jsonb`;
- `content_hash`;
- `observed_at`;
- chave única `(run_id, source_id, external_id)`.

Permissões:

- RLS ativa;
- nenhum acesso para `anon`;
- frontend autenticado não precisa ler staging;
- `service_role` pode inserir, selecionar e remover;
- grants explícitos, pois tabelas novas podem não ser expostas automaticamente pela Data API.

### 6.3 Gravação em lote e commit atômico

Substituir o loop de um `upsert` por imóvel.

Fluxo obrigatório:

1. O adaptador retorna os itens normalizados.
2. O scraper calcula `content_hash` de campos estáveis e relevantes.
3. Insere staging em lotes de 500 itens.
4. Chama uma RPC `leila_commit_ingestion_run(run_id)`.
5. A RPC faz merge set-based em `leila_properties`.
6. A RPC retorna contagens reais de `inserted`, `updated`, `unchanged` e `rejected`.
7. A reconciliação de ausentes ocorre somente para regiões comprovadamente completas.
8. O run é finalizado e a fonte recebe suas métricas.

Usar `SECURITY INVOKER` e conceder execução somente a `service_role`.

Se a RPC falhar, o run deve ser `failed` e nenhuma região pode ser reconciliada.

### 6.4 Snapshots

Criar `leila_property_snapshots` para registrar apenas mudanças relevantes:

- `property_id`;
- `run_id`;
- `source_id`;
- `content_hash`;
- `snapshot_data jsonb`;
- `observed_at`.

Adicionar snapshot quando:

- o imóvel é novo; ou
- o `content_hash` mudou.

Não criar snapshots repetidos para anúncios inalterados.

### 6.5 Vendedores

Criar `leila_sellers` com os vendedores/originadores conhecidos:

- Caixa;
- Banco do Brasil;
- Santander;
- Itaú;
- Bradesco;
- outros identificados posteriormente.

Adicionar `seller_id` nullable em `leila_properties`.

O adaptador da Caixa preenche `seller_id = 'caixa'`.
O adaptador do BB preenche `seller_id = 'bb'`.
O adaptador da Mega identifica o vendedor pela página e preenche quando houver evidência; caso contrário, deixa nulo.

## 7. Fases de implementação

## Fase 0 — baseline e proteção

### Objetivo

Registrar o comportamento atual e criar proteção contra regressões antes da refatoração.

### Tarefas

- Registrar contagens atuais por fonte, status, UF e qualidade.
- Salvar fixtures sanitizadas de pelo menos três CSVs reais da Caixa:
  - formato normal;
  - variação de cabeçalho;
  - resposta HTML/WAF simulada.
- Criar testes para `_parse_brl`, `_parse_area`, modalidade, bairro e `_parse_row`.
- Criar teste provando que HTML/CAPTCHA não é considerado coleta válida.
- Criar teste provando que resultado vazio não reconcilia anúncios.
- Documentar variáveis de ambiente sem copiar valores reais.

### Arquivos principais

- `scraper/tests/`
- `scraper/sources/caixa.py`
- `scraper/sources/base.py`
- `scraper/.env.example`

### Aceite

- Testes executam sem rede.
- Nenhuma fixture contém dado secreto.
- O comportamento atual da Caixa está coberto antes de ser alterado.

## Fase 1 — uma rodada diária e trava de concorrência

### Objetivo

Eliminar rodadas duplicadas e execuções eternamente presas.

### Tarefas

- Alterar `.github/workflows/scraper.yml` para `0 9 * * *`.
- Adicionar `concurrency` no workflow para impedir duas rodadas diárias simultâneas.
- Aumentar temporariamente o timeout do workflow para 90 minutos durante a migração; reduzir depois de medir a gravação em lote.
- Criar migration com os novos campos e estados de execução.
- Criar lease por fonte com índice único parcial.
- Atualizar heartbeat a cada região ou a cada lote persistido.
- Marcar runs antigos presos como `stale` via migration de dados ou script administrativo idempotente.
- Remover o fallback silencioso do backend que dispara GitHub Actions para qualquer erro do scraper local.
- Em falha manual, retornar erro claro e não iniciar uma segunda coleta oculta.
- Para disparo manual, retornar `202 Accepted` com `run_id` quando o trabalho for aceito.

### Arquivos principais

- `.github/workflows/scraper.yml`
- `scraper/main.py`
- `scraper/run.py`
- `backend/src/controllers/scraper.controller.ts`
- `backend/src/services/scraper.service.ts`
- nova migration criada pelo Supabase CLI

### Aceite

- Existe somente uma agenda automática por dia.
- Duas solicitações simultâneas para a mesma fonte resultam em uma execução e um `skipped`.
- Um run sem heartbeat por mais de 60 minutos deixa de aparecer como `running`.
- Um erro no scraper local não dispara GitHub Actions automaticamente.

## Fase 2 — catálogo e painel de fontes confiável

### Objetivo

Fazer a tela de configurações refletir exatamente o que existe em produção.

### Tarefas de banco

- Adicionar os campos da seção 5 em `leila_sources`.
- Aplicar constraints de status/ativação/cobertura.
- Inserir todas as fontes do catálogo sem ativar fontes não implementadas.
- Corrigir BB e Santander que estejam ativos sem coletor, colocando `active = false`.
- Preservar datas históricas existentes da Caixa.
- Criar RLS, policies e grants explícitos.

### Tarefas de backend

- Remover `IMPLEMENTED_SOURCES` hardcoded do controller.
- O backend deve ler `implementation_status` do banco.
- Antes de ativar, validar:
  - status `ready`;
  - adaptador presente no `/status` do scraper;
  - `requires_external_service = false` nesta primeira versão.
- Retornar no endpoint de fontes:
  - status de implementação;
  - ativo/desativado;
  - coleta direta/indireta;
  - última tentativa;
  - último sucesso;
  - último status e erro resumido;
  - contagens da última execução;
  - fonte de cobertura indireta;
  - versão do coletor.

### Tarefas de frontend

Cada fonte deve ter um card com:

- nome;
- tipo de fonte;
- badge `Ativa`, `Desativada`, `Em teste`, `Planejada`, `Bloqueada` ou `Indireta`;
- “Última coleta bem-sucedida”;
- “Última tentativa”;
- itens encontrados/escritos;
- resumo do último erro;
- nota de cobertura;
- toggle somente quando `implementation_status = ready`;
- botão manual somente quando o adaptador estiver pronto;
- tooltip explicando por que uma fonte não pode ser ativada.

Para fonte nunca executada, mostrar “Nunca coletada”, não uma data vazia.

Para Santander coberto pela Mega, mostrar:

> Cobertura indireta via Mega Leilões. Não existe coletor direto validado.

### Arquivos principais

- `backend/src/controllers/sources.controller.ts`
- `backend/src/controllers/trust.controller.ts`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/lib/api.ts`
- nova migration

### Aceite

- Caixa aparece ativa e com data de último sucesso.
- BB, Santander e demais fontes aparecem desativadas enquanto não houver coletor pronto.
- Nenhuma fonte não implementada pode ser ativada manipulando a API.
- A tela distingue última tentativa de último sucesso.
- A tela não depende de uma lista hardcoded diferente da lista do banco.

## Fase 3 — ingestão em lote e estabilização da Caixa

### Objetivo

Fazer a coleta atual terminar com segurança e em tempo previsível.

### Tarefas

- Criar staging, snapshots e RPC de commit descritos na seção 6.
- Trocar upsert unitário por lotes de 500.
- Corrigir métricas de inseridos, alterados e inalterados.
- Calcular hash sem incluir campos que mudam a cada execução, como `scraped_at`.
- Escolher proxy por tentativa/UF, não um proxy por execução inteira.
- Implementar até três tentativas com troca de proxy após bloqueio ou timeout.
- Manter cookies por sessão quando necessário.
- Registrar diagnóstico por UF sem registrar credenciais ou URL autenticada do proxy.
- Tornar a lista de regiões uma capacidade do adaptador, não uma suposição global.
- Não avançar `last_successful_at` em rodada parcial.
- Atualizar `last_attempted_at` em qualquer tentativa.
- Executar enriquecimento opcional como etapa separada; a coleta não pode depender da Anthropic.

### Testes obrigatórios

- Rodar o mesmo fixture duas vezes: primeira execução insere; segunda retorna tudo como inalterado.
- Alterar preço de um item: apenas um registro deve ser atualizado e receber snapshot.
- Simular erro de escrita em um lote: nenhuma reconciliação de ausentes.
- Simular falha de uma UF: somente UFs válidas podem ser reconciliadas.
- Simular resposta vazia: fonte/UF fica em falha, não remove dados.
- Confirmar que 25 mil itens não geram 25 mil chamadas individuais ao Supabase.

### Aceite

- A Caixa conclui uma rodada completa dentro de 30 minutos em duas execuções consecutivas.
- Nenhum run permanece preso.
- `inserted`, `updated` e `unchanged` refletem a realidade.
- Uma segunda execução idempotente não cria duplicatas nem snapshots redundantes.

## Fase 4 — framework de adaptadores

### Objetivo

Permitir novas fontes sem copiar a lógica da Caixa ou do orquestrador.

### Contrato do adaptador

Cada adaptador deve declarar:

- `source_id`;
- `collector_version`;
- `supports_regions`;
- `supports_details`;
- `supports_documents`;
- `supports_photos`;
- método `discover()`;
- método opcional `fetch_details()`;
- regiões verificadas e falhas;
- validação de resposta;
- geração de ID externo estável;
- normalização para `ScrapedProperty`;
- método de health check sem executar coleta completa.

### Estrutura sugerida

```text
scraper/
  sources/
    base.py
    registry.py
    caixa.py
    bb.py
    mega_leiloes.py
  pipeline/
    orchestrator.py
    persistence.py
    reconciliation.py
    hashing.py
  tests/
    fixtures/
    test_caixa.py
    test_bb.py
    test_mega_leiloes.py
    test_persistence.py
```

`registry.py` deve ser a única lista executável de adaptadores Python.
O endpoint `/status` deve devolver os adaptadores presentes, suas versões e capacidades.

O banco continua sendo o catálogo de negócio. A ativação exige a interseção:

> fonte `ready + active` no banco E adaptador presente no registry.

### Aceite

- Um adaptador falso de teste consegue passar pelo pipeline completo.
- Caixa usa o novo contrato sem perder dados.
- O orquestrador não contém regras específicas da Caixa.

## Fase 5 — spike e coletor do Banco do Brasil

### Objetivo

Determinar se o BB pode ser coletado diretamente sem API paga e, se puder, implementar.

### Spike obrigatório antes de codificar o parser

Documentar em `docs/sources/bb.md`:

- URL oficial inicial;
- URLs e redirects utilizados;
- existência de JSON/CSV/XHR público;
- paginação;
- identificador estável do anúncio/lote;
- campos disponíveis na listagem;
- campos disponíveis no detalhe;
- documentos e fotos;
- necessidade de JavaScript;
- presença de CAPTCHA/WAF;
- termos/robots aplicáveis;
- amostra de pelo menos 100 anúncios ou toda a fonte quando menor;
- conclusão `aprovado` ou `bloqueado`.

### Ordem técnica

1. Preferir endpoint JSON/CSV público usado pelo próprio portal.
2. Se não houver, usar HTML determinístico com `httpx`/`BeautifulSoup`.
3. Usar navegador automatizado local somente se a página exigir JavaScript e continuar estável.
4. Não usar IA para navegar ou descobrir anúncios em produção.

### Critérios para aprovar

- Coletar três vezes em dias diferentes.
- IDs estáveis entre rodadas.
- Paginação completa comprovada.
- Resultado total coerente e sem duplicação material.
- Campos mínimos: external ID, título/endereço, cidade/UF, preço ou lance e URL oficial.
- Ausência de bloqueio recorrente que exija serviço pago.

### Ativação

Somente depois dos testes:

- registrar `BbSource` no registry;
- definir `implementation_status = ready`;
- definir `active = true`;
- definir `coverage_mode = direct`;
- limpar `last_error`;
- executar backfill inicial controlado;
- validar contagens no banco e na interface.

Se reprovado:

- `implementation_status = blocked`;
- `active = false`;
- `requires_external_service = true` se aplicável;
- preencher `coverage_notes` com o motivo técnico;
- não continuar tentando em toda rodada diária.

## Fase 6 — spike e coletor da Mega Leilões

### Objetivo

Obter cobertura própria de um leiloeiro/agregador que publica anúncios de Santander, Itaú, Bradesco e leilões judiciais.

### Spike obrigatório

Documentar em `docs/sources/mega_leiloes.md` os mesmos itens do spike BB, acrescentando:

- diferenciação entre lote e evento de leilão;
- identificação de vendedor/originador;
- primeira e segunda praça separadas;
- preço de cada praça;
- status do lote;
- edital e matrícula quando publicados;
- vendedor desconhecido como nulo, nunca inferido sem evidência.

### Regras de modelagem

- `source_id = mega_leiloes`.
- `external_id` deve ser o ID estável do lote, não apenas o ID do evento.
- `seller_id` deve vir de texto/metadata observável.
- Guardar URL do lote e URL do evento quando ambas existirem.
- Guardar todas as praças no `raw_data`; mapear a praça relevante para os campos legados do frontend até existir modelo próprio de rodadas.
- Não duplicar o mesmo lote porque ele aparece em uma listagem geral e em uma página de vendedor.

### Ativação

Depois de três coletas válidas:

- `mega_leiloes`: `ready`, `active = true`, `coverage_mode = direct`;
- Santander, Itaú e Bradesco: `active = false`, `coverage_mode = indirect`, `covered_by_source_id = mega_leiloes` quando houver cobertura real observada;
- a data mostrada para cobertura indireta deve vir da última coleta bem-sucedida da Mega e estar rotulada como indireta.

### Aceite

- Paginação completa e idempotente.
- Vendedor corretamente identificado em amostra revisada manualmente.
- Datas e valores de praças não são misturados.
- Itens encerrados seguem a política de duas ausências válidas ou status explícito da fonte.
- A interface mostra Mega como fonte e o banco como vendedor, quando conhecido.

## Fase 7 — documentos, datas e fotos

### Objetivo

Corrigir as maiores lacunas atuais sem transformar IA em requisito de ingestão.

### Tarefas

- Implementar coleta de páginas de detalhe apenas para itens novos ou cujo hash de listagem mudou.
- Extrair deterministicamente:
  - data e hora;
  - primeira/segunda praça;
  - valor por praça;
  - fotos;
  - edital;
  - ocupação quando explicitamente informada;
  - forma de pagamento;
  - comissão;
  - responsabilidade por débitos quando explicitamente informada.
- Salvar documentos com URL de origem, hash, data observada e tipo.
- Não baixar novamente documento com mesmo hash.
- Executar IA apenas depois da persistência do anúncio e documento.
- Registrar modelo, versão de prompt e evidências do texto usado no enriquecimento.
- Não sobrescrever valor/data determinísticos com resposta da IA.

### Aceite

- Pelo menos 80% dos anúncios de fontes que publicam datas exibem data/modalidade.
- Pelo menos 80% dos anúncios de fontes que publicam fotos têm ao menos uma foto válida.
- Todo edital armazenado mantém URL e hash de procedência.
- Falha da Anthropic não falha nem reverte uma coleta.

## Fase 8 — fontes posteriores

Executar uma fonte por vez, repetindo integralmente o processo de spike, teste e ativação.

Ordem sugerida:

1. Zuk;
2. Sold;
3. Superbid;
4. leiloeiros regionais priorizados por volume comprovado;
5. portais diretos de Santander, Itaú e Bradesco somente se oferecerem cobertura adicional à Mega.

Uma fonte permanece `planned` até começar o spike.
Durante o spike fica `testing` e `active = false`.
Se aprovada vira `ready`; se reprovada vira `blocked`.

Não adicionar uma fonte à rodada diária para “ver se funciona”.

## Fase 9 — deduplicação entre fontes

Esta fase só começa depois de Caixa, BB e Mega estarem estáveis.

### Objetivo

Reconhecer o mesmo imóvel anunciado em mais de uma fonte sem perder as publicações independentes.

### Estratégia

- Criar entidade canônica separada das publicações.
- Preservar cada `listing` e sua procedência.
- Matching exato por matrícula, número de processo ou identificador oficial quando disponível.
- Gerar candidatos por CEP/endereço normalizado, área, cidade, tipo e valores próximos.
- Mesclar automaticamente somente matches de confiança muito alta.
- Matches médios entram em fila de revisão.
- IA pode classificar candidatos, mas não executar merge definitivo sem regra de confiança e trilha de auditoria.

### Aceite

- Nenhuma publicação de origem é apagada ao criar entidade canônica.
- É possível desfazer uma associação incorreta.
- Todo merge registra método, confiança e data.

## 8. Comportamento esperado da tela de configurações

Exemplo final:

```text
Caixa Econômica Federal
ATIVA · COLETA DIRETA
Último sucesso: hoje, 06:21
Última tentativa: hoje, 06:00
25.503 encontrados · 25.480 inalterados · 23 alterados
[Executar agora] [toggle ligado]

Mega Leilões
ATIVA · COLETA DIRETA
Último sucesso: hoje, 06:29
216 encontrados · 4 vendedores identificados
[Executar agora] [toggle ligado]

Santander
COBERTURA INDIRETA · DESATIVADA COMO COLETOR
Coberta parcialmente via Mega Leilões
Última atualização indireta: hoje, 06:29
[toggle indisponível]

Banco do Brasil
PLANEJADA / BLOQUEADA / PRONTA, conforme a fase
Nunca coletada, quando aplicável
[toggle indisponível enquanto não estiver pronta]
```

Regras visuais:

- Nunca usar apenas cor para comunicar status.
- Nunca escrever “ativa” para cobertura indireta.
- Data indireta precisa do rótulo “via <fonte>”.
- Exibir erro resumido, mas não stack trace ou dados secretos.
- Mostrar há quanto tempo ocorreu a última coleta e a data absoluta no tooltip.

## 9. Monitoramento e alertas

Criar no endpoint de saúde:

- total de fontes prontas e ativas;
- última execução de cada fonte;
- fonte atrasada quando `last_successful_at` superar 30 horas;
- execução presa quando heartbeat superar 60 minutos;
- queda anormal quando encontrados forem menores que 60% da mediana das últimas sete execuções válidas;
- aumento anormal quando superar 180% da mediana;
- taxa de rejeição;
- regiões com falha;
- duração;
- cobertura de campos importantes por fonte.

Uma queda de volume deve gerar `partial`/alerta e impedir reconciliação automática até ser confirmada.

Não é obrigatório contratar Sentry ou outro serviço nesta entrega. O painel e `leila_ingestion_runs` devem ser suficientes inicialmente.

## 10. Testes finais obrigatórios

### Backend e frontend

- Fonte planejada não pode ser ativada pela API.
- Fonte bloqueada não pode ser ativada.
- Fonte pronta pode ser ativada/desativada.
- Última tentativa e último sucesso aparecem separadamente.
- Cobertura indireta aparece sem toggle ativo.
- “Nunca coletada” aparece corretamente.

### Pipeline

- Duas execuções simultâneas da mesma fonte não rodam juntas.
- Uma execução stale é recuperável.
- Reexecução idempotente não duplica registros.
- Falha parcial não remove anúncios.
- Erro de banco não reconcilia ausentes.
- Upsert em lote retorna métricas corretas.
- Fonte desativada não participa da rodada diária.
- Cada fonte ativa participa no máximo uma vez da rodada automática.

### Segurança

- RLS ativa em todas as tabelas públicas novas.
- Grants explícitos verificados.
- Staging e funções internas inacessíveis para `anon` e frontend autenticado.
- `service_role` ausente do bundle frontend.
- Funções internas não executáveis por `PUBLIC`, `anon` ou `authenticated`.
- Rodar advisors do Supabase antes de finalizar migrations.

### Build

- Testes Python.
- Build TypeScript do backend.
- Build do frontend.
- Teste manual da página de configurações.
- Dry-run dos três adaptadores sem escrita.
- Uma rodada de homologação com escrita.
- Consulta final de contagem por fonte e status.

## 11. Definição de pronto da iniciativa

O plano só está concluído quando:

- existe exatamente uma rodada automática diária às 06:00 BRT;
- Caixa conclui duas rodadas consecutivas sem execução presa;
- gravação ocorre em lote;
- o catálogo mostra todas as fontes, inclusive planejadas e bloqueadas;
- toda fonte ativa possui adaptador validado;
- toda fonte ativa mostra última tentativa, último sucesso, status e contagens;
- BB e Mega estão ativas apenas se aprovadas por testes reais de três dias;
- Santander, Itaú e Bradesco não fingem coleta direta;
- cobertura indireta está claramente rotulada;
- nenhuma fonte desativada roda automaticamente;
- falhas parciais não removem anúncios;
- o frontend continua funcionando com os dados existentes;
- documentação operacional explica como adicionar, testar, ativar, bloquear e desativar uma fonte.

## 12. Fora do escopo da primeira entrega

- Contratar serviço externo de scraping.
- Comprar feed/API de terceiros.
- Garantir cobertura de todos os leiloeiros do Brasil.
- Automatizar arrematação ou envio de lances.
- Usar IA como navegador autônomo em produção.
- Migrar imediatamente todos os dados para um novo modelo canônico.
- Ativar fontes que não passaram por três coletas válidas.

## 13. Pontos de parada obrigatórios

O agente executor deve parar e pedir decisão antes de:

- contratar ou integrar serviço pago;
- contornar autenticação ou CAPTCHA de forma não autorizada;
- aceitar termos ou celebrar contrato em nome do usuário;
- ativar uma fonte reprovada no spike;
- fazer alteração destrutiva em `leila_properties`;
- excluir histórico ou registros existentes;
- mudar o significado dos scores de oportunidade;
- publicar migrations sem teste de homologação.

## 14. Ordem resumida para execução

1. Testes e fixtures da Caixa.
2. Uma rodada diária e lease por fonte.
3. Catálogo/status completo no banco, backend e configurações.
4. Staging, batch upsert, snapshots e estabilização da Caixa.
5. Framework comum de adaptadores.
6. Spike e eventual ativação do BB.
7. Spike e eventual ativação da Mega.
8. Cobertura indireta de Santander/Itaú/Bradesco.
9. Detalhes, documentos, datas, fotos e IA opcional.
10. Zuk, Sold e Superbid, uma de cada vez.
11. Deduplicação canônica entre fontes.
