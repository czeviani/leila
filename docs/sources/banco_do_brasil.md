# Banco do Brasil — resultado do spike

Em 18/08/2026, a página pública consultada retornou uma página de desafio
Cloudflare (sem catálogo de imóveis no HTML entregue ao coletor). Por isso o BB
foi marcado como `blocked` e permanece inativo no catálogo.

Não foi contratado browser externo nem API paga nesta etapa. Um próximo spike
isolado pode avaliar Playwright/Browserbase ou uma API oficial, mas só deve
promover a fonte para `testing` depois de comprovar que o acesso é permitido,
que os termos de uso permitem a coleta e que há identificador estável para
deduplicação.
