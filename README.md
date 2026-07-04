# Central de Agentes IA

Dashboard premium (dark mode) para gestão de agentes de IA de atendimento (SAC).
Lê os dados direto do Postgres (Neon), um schema por cliente.

Stack: Next.js 15 (App Router, Server Components) · TypeScript strict · Tailwind CSS v4 ·
Recharts · Lucide · lib `postgres`.

## Páginas

- `/` Portal: cards dos 3 agentes com KPIs (conversas, mensagens, custo US$, última atividade).
- `/[slug]` Dashboard do agente, com sidebar (desktop) e topbar (mobile):
  - **Visão geral**: KPIs + gráficos (conversas/dia, custo/dia, distribuição por canal) com skeleton no loading.
  - **Conversas** (`/[slug]/conversas`): lista de atendimentos + chat em bolhas (usuário à esquerda, assistente à direita).
  - **Pipeline** (`/[slug]/pipeline`): kanban de leads por etapa (Novo, Em conversa, Agendado, Perdido), etapa inferida pelo assunto.

Agentes fixados em `lib/agents.ts`: `agente24horas` (Nina), `casaldotrafego` (Amanda), `drlucas` (Dr. Lucas).

## Rodar local

```bash
npm install
# .env.local já contém DATABASE_URL do Neon (e DASHBOARD_PASSWORD opcional)
npm run dev        # http://localhost:3000
```

## Build / Deploy (Vercel)

```bash
npm run build
```

Na Vercel, configure as variáveis de ambiente:

- `DATABASE_URL` (obrigatória): connection string do Neon.
- `DASHBOARD_PASSWORD` (opcional): se definida, ativa um gate de senha simples
  (login em `/login`, cookie httpOnly). Vazia ou ausente = dashboard aberto.
- `PAINEL_API_TOKEN` (obrigatória para os controles da aba Conversas): Bearer token
  da Control API do Hermes. Usado só server-side (Server Actions), nunca exposto ao client.
- `HERMES_PANEL_URL` (opcional): base da Control API do Hermes.
  Default `https://hermes.casaldotrafego.com/agente`.

Na aba **Conversas** dá para pausar/retomar o bot por conversa (handoff humano) e
responder o lead manualmente. Essas ações chamam a Control API do Hermes via Server
Actions (`lib/actions.ts`). Sem `PAINEL_API_TOKEN` as ações retornam erro amigável no UI
e o build/render seguem normais.

As páginas de dados são `force-dynamic` (renderizadas a cada request), então o
build **não** depende do banco.

## Estrutura

```
app/            rotas (portal, [slug], conversas, pipeline, login, api/auth)
components/     ui, sidebar, charts, kpi, chat-view, kanban helpers
lib/            db (conexão postgres), agents (config + allowlist), queries, utils
middleware.ts   gate de senha opcional
```

## Segurança

Os nomes de schema nunca vêm do request: são resolvidos por allowlist em
`lib/agents.ts` (`safeSchema`). Filtros de valor usam parâmetros (`$1`).
