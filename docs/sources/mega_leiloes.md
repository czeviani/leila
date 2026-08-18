# Mega Leilões — spike e coletor

## Resultado do spike

- Catálogo público em HTML server-rendered: `https://www.megaleiloes.com.br/?imoveis=1`.
- Paginação explícita por `?imoveis=N`; o catálogo informa o total de páginas.
- Cartões de lote/evento usam identificadores `ML...` e foram excluídos.
- Cartões de imóvel usam URLs `/imoveis/...` e identificadores `X...` ou `J...`.
- O HTML já fornece título, localidade, banco vendedor, preço, modalidade, datas,
  imagem e área quando ela aparece no título.
- As praças são preservadas em `raw_data.instances`, com data e valor separados;
  o link do evento e o status do lote também são mantidos quando publicados.

## Implementação

O adaptador está registrado no serviço, e a fonte está `testing` e inativa
no catálogo do Supabase até completar três rodadas válidas. Isso evita publicar
dados de uma fonte nova antes de medir duplicidade, cobertura e estabilidade.

O primeiro ciclo deve validar:

1. pelo menos 95% dos cartões de imóvel com identificador e preço;
2. duplicidade por `source_id + external_id` menor que 1%;
3. localidade e vendedor preservados nos registros;
4. reconciliação de ausências limitada às páginas realmente verificadas.
