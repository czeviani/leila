# Jornada de venda e preço estratégico

## O que a mesa deve responder

A mesa separa duas perguntas que não podem compartilhar o mesmo campo:

1. **Onde o imóvel está agora?** `auction_stage`, `current_stage_price` e `current_stage_date`.
2. **Qual é o menor valor oficial já conhecido?** `auction_price`, `target_stage` e `discount_pct`.

`auction_price` é o preço estratégico usado na coluna Lance, nos filtros, no R$/m² e no ranking. Ele só pode usar preços observados na fonte. Uma modalidade futura sem preço não entra no cálculo.

## Contrato de `auction_stages`

Cada item da sequência contém:

- `stage`: chave estável da etapa;
- `label`: nome apresentado ao usuário;
- `sequence`: ordem visual;
- `price`: mínimo oficial, quando publicado;
- `event_at`: data e hora oficiais, quando publicadas;
- `status`: `completed`, `current`, `upcoming` ou `possible`;
- `certainty`: `official`, `observed` ou `possible`.

Etapas `possible` aparecem pontilhadas, não participam do menor preço e nunca devem ser anunciadas como garantidas.

## Regra por fonte

| Fonte | Jornada exibida | Preço estratégico | Limitação |
|---|---|---|---|
| Caixa — Leilão SFI | 1º leilão → 2º leilão → possível nova oferta | Menor mínimo publicado entre 1º e 2º leilões | Nova modalidade após o leilão é decisão da Caixa; não há preço antecipado |
| Caixa — Licitação Aberta | Uma disputa observada | Mínimo publicado | Não presumir venda direta posterior |
| Caixa — Venda Online | Uma disputa com cronômetro | Mínimo publicado | Lances podem elevar o valor final |
| Caixa — Compra Direta | Uma oferta corrente | Preço publicado | A primeira proposta válida pode vencer |
| Superbid / SOLD | Um lote na disputa online | Lance mínimo ou atual informado | O marketplace agrega vendedores e regras; novas praças só entram se vierem no lote |
| Mega Leilões | Praça/modalidade observada no anúncio | Mínimo da praça publicada | Não inferir uma praça ausente |
| Zuk | Praça/modalidade observada no anúncio | Mínimo publicado | Não inferir sequência sem datas e valores explícitos |

## Semântica visual

- Quadrado azul: etapa atual.
- Quadrado âmbar: etapa futura com o melhor preço conhecido.
- Quadrado cinza com marca: etapa concluída.
- Quadrado branco: etapa futura confirmada.
- Quadrado pontilhado com `?`: caminho possível, não garantido.

Ao passar o mouse ou focar uma etapa, a interface informa nome, valor, data e situação. Na página do imóvel, a mesma informação aparece expandida.

## Regra de atualização

A jornada é recalculada a cada coleta diária. Para leilões SFI da Caixa, a página oficial do imóvel é a fonte das datas e dos dois valores. Se o detalhe não puder ser lido, a etapa fica desconhecida; o sistema não escolhe automaticamente o primeiro leilão.

O coletor muda a etapa atual após o horário oficial da primeira disputa. Se o imóvel desaparecer da fonte, a reconciliação normal de disponibilidade continua valendo e impede que um anúncio antigo seja tratado como disponível.

