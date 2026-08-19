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
- `status`: `completed`, `current` ou `upcoming`;
- `certainty`: `official` ou `observed`.

Só entram quadrantes pertencentes ao fluxo publicado para aquele lote. Uma modalidade que talvez ocorra depois não é uma etapa do imóvel e não aparece na trilha.

## Regra por fonte

| Fonte | Jornada exibida | Preço estratégico | Limitação |
|---|---|---|---|
| Caixa — Leilão SFI | 1º leilão → 2º leilão | Menor mínimo publicado entre 1º e 2º leilões | Venda posterior não integra esta trilha porque não é garantida |
| Caixa — Licitação Aberta | Uma disputa observada | Mínimo publicado | Não presumir venda direta posterior |
| Caixa — Venda Online | Uma disputa com cronômetro | Mínimo publicado | Lances podem elevar o valor final |
| Caixa — Compra Direta | Uma oferta corrente | Preço publicado | A primeira proposta válida pode vencer |
| Superbid / SOLD | Praça única, duas ou três praças, conforme descrição/edital do lote | Menor mínimo publicado nas praças do lote | A quantidade não é fixa no marketplace |
| Mega Leilões | Praça única ou duas praças, conforme o cartão do imóvel | Menor mínimo publicado nas praças | Venda Direta é fluxo próprio de uma etapa |
| Zuk | 1º → 2º leilão quando ambos são publicados; Venda Direta isolada | Menor mínimo publicado | Venda Direta não prova que aquele imóvel passou pelos dois leilões dentro da coleta |

## Semântica visual

- Quadrado azul: etapa atual.
- Quadrado âmbar: etapa futura com o melhor preço conhecido.
- Quadrado cinza com marca: etapa concluída.
- Quadrado branco: etapa futura confirmada.

Ao passar o mouse ou focar uma etapa, a interface informa nome, valor, data e situação. Na página do imóvel, a mesma informação aparece expandida.

## Regra de atualização

A jornada é recalculada a cada coleta diária. Para leilões SFI da Caixa, a página oficial do imóvel é a fonte das datas e dos dois valores. Se o detalhe não puder ser lido, nenhum quadrante é mostrado; o sistema não cria uma etapa “desconhecida” nem escolhe automaticamente o primeiro leilão.

O coletor muda a etapa atual após o horário oficial da primeira disputa. Se o imóvel desaparecer da fonte, a reconciliação normal de disponibilidade continua valendo e impede que um anúncio antigo seja tratado como disponível.
