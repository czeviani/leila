# Leila — Guia de Engenharia para Claude

## O que é a Leila

Plataforma de rastreamento e avaliação de imóveis de leilão. Agrega imóveis de múltiplas fontes (Caixa Econômica Federal, Banco do Brasil, Santander, etc.), aplica pré-filtros configurados pelo usuário, e usa IA (Claude) para avaliar os imóveis flaggados.

**Desafio central**: a Caixa Econômica bloqueia IPs não brasileiros — o scraper Python usa proxy rotation com IPs BR.

---

## Stack

| Camada | Tecnologia | Detalhes |
|--------|------------|---------|
| Frontend | React 18 + Vite + TypeScript | SPA, porta 8080 no dev |
| UI | shadcn/ui + Tailwind CSS | componentes em `frontend/src/components/ui/` |
| Backend | Node.js 20 + Express + TypeScript | API REST, porta 3001 |
| Scraping | Python 3.11 + httpx + BeautifulSoup | serviço separado, porta 8000 |
| Banco | Supabase (PostgreSQL) | prefixo `leila_` nas tabelas |
| Auth | Supabase Auth (JWT) | middleware em `backend/src/middleware/auth.ts` |
| IA | Anthropic API (Claude Sonnet 4.6) | avaliação de imóveis |
| Proxy | Rotating Brazilian IPs | necessário para Caixa Econômica |

---

## Estrutura de Arquivos

```
leila/
├── CLAUDE.md                    ← este arquivo
├── frontend/                    ← React + Vite + TS
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── App.tsx              ← router principal
│       ├── pages/               ← páginas da app
│       ├── components/          ← componentes por módulo + ui/
│       ├── context/             ← AuthContext
│       ├── hooks/               ← queries TanStack
│       └── lib/
│           ├── api.ts           ← chamadas ao backend + tipos
│           └── supabase.ts      ← cliente Supabase
├── backend/                     ← Node.js + Express + TS
│   └── src/
│       ├── server.ts            ← entry point
│       ├── config/supabase.ts
│       ├── middleware/auth.ts
│       ├── routes/
│       ├── controllers/
│       └── services/
│           ├── scraper.service.ts   ← chama serviço Python
│           └── evaluator.service.ts ← Claude API
├── scraper/                     ← Python scraping service
│   ├── main.py                  ← FastAPI app, porta 8000
│   ├── sources/
│   │   ├── base.py              ← classe base Source
│   │   └── caixa.py             ← scraper da Caixa
│   └── proxy/
│       └── manager.py           ← proxy rotation
└── supabase/
    └── migrations/              ← SQL migrations
```

---

## Variáveis de Ambiente

### Backend (`backend/.env`)
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
SCRAPER_URL=http://localhost:8000
PORT=3001
NODE_ENV=development
```

### Frontend (`frontend/.env`)
```
VITE_SUPABASE_URL=https://...supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3001
```

### Scraper (`scraper/.env`)
```
PROXY_LIST=ip1:port:user:pass,ip2:port:user:pass
PROXY_ROTATION=true
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64)...
```

---

## Workflow de Engenharia

```
editar localmente → npm run build → commit → push → deploy automático
```

- **Frontend**: Vercel (via `vercel.json`)
- **Backend**: Easypanel VPS (via `Dockerfile.backend`)
- **Scraper**: container Docker separado na VPS

---

## Módulos

### 1. Rastreador
- Painel admin para ativar/desativar fontes
- Botão "Scrape agora" + agendamento
- Ícone da fonte em cada imóvel

### 2. Pré-filtro
- Faixa de preço (mín/máx)
- Estado + cidade
- Tipo: apartamento, casa, terreno, comercial
- Desconto mínimo (% abaixo do avaliado)

### 3. Triagem
- Lista de imóveis filtrados
- Flag ⭐ para favoritar
- Só favoritos vão para o Avaliador (economiza tokens)

### 4. Avaliador IA
- Aciona Claude Sonnet para imóveis favoritados
- Lê edital em PDF
- Gera: localização, condições, riscos, score 0-10

---

## Padrões de Código

### Backend
- Controllers em `controllers/`, um arquivo por módulo
- Rotas em `routes/`, registradas no `server.ts`
- Usar `req.supabase` (não admin client) para queries autenticadas
- Retornar sempre `res.json()` ou `res.status(xxx).json()`

### Frontend
- Chamadas ao backend via `api.*` em `lib/api.ts`
- Queries com TanStack Query
- Tipos compartilhados em `api.ts`
- UI components: shadcn em `components/ui/`

### Banco
- Prefixo `leila_` em todas as tabelas
- RLS desativado V1 (single-user)
- Migrations em `supabase/migrations/` numeradas sequencialmente

---

## Regras

1. Sempre ler os arquivos antes de editar
2. `npm run build` antes de commitar (checar tipos)
3. Nunca quebrar auth — `authMiddleware` em todas as rotas `/api/*`
4. Usar `claude-sonnet-4-6` para avaliações, `claude-haiku-4-5-20251001` para tarefas simples
5. Scraper só roda com proxy ativo quando `NODE_ENV=production`
