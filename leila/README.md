# Leila

Plataforma para rastrear e avaliar imóveis de leilão de múltiplas fontes (Caixa Econômica Federal, Banco do Brasil, Santander, etc.). Aplica filtros configuráveis e usa IA (Claude) para avaliar automaticamente os imóveis que passam nos critérios.

## Stack

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + Vite + TypeScript + Tailwind + shadcn/ui |
| Backend | Node.js 20 + Express + TypeScript |
| Scraping | Python 3.11 + httpx + BeautifulSoup |
| Banco | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) + Google SSO |
| IA | Anthropic API (Claude Sonnet) |
| Deploy | Vercel (frontend) + Easypanel (backend/scraper) |

## Estrutura

```
leila/
├── frontend/        # React + Vite SPA (porta 8080)
├── backend/         # API REST Express (porta 3001)
├── scraper/         # Scraper Python com proxy rotation (porta 8000)
└── supabase/        # Migrations e config do banco
```

## Setup local

### Pré-requisitos

- Node.js 20+
- Python 3.11+
- Conta no Supabase

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

### Backend

```bash
cd backend
npm install
cp .env.example .env   # preencher SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
npm run dev
```

### Scraper

```bash
cd scraper
pip install -r requirements.txt
python main.py
```

> **Atenção:** a Caixa Econômica bloqueia IPs não brasileiros. O scraper usa proxy rotation com IPs BR — configure as variáveis de proxy no `.env` do scraper.

## Deploy

- **Frontend:** Vercel — `leila-lemon.vercel.app`
- **Backend e Scraper:** Easypanel (VPS)

## Variáveis de ambiente

Veja os arquivos `.env.example` em cada subprojeto para a lista completa de variáveis necessárias.
