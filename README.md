# God Game — Backend

Servidor de simulação em tempo real do **God Game**.

## Stack

- Node.js + TypeScript + Express
- Socket.io (broadcast a ~4 FPS)
- PostgreSQL
- Groq (LLM para decisões sociais e de agentes)

## Como rodar

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL e GROQ_API_KEY
npm run dev            # sobe server + loop
```

O loop de simulação (`src/loop.ts`) é importado automaticamente pelo `server.ts`.

## Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/world` | Estado do mundo |
| GET | `/api/agents` | Lista de agentes |
| POST | `/api/world/reset` | Gera nova ilha |
| POST | `/api/world/god-action` | Raio ou Milagre |
| POST | `/api/world/social-brain` | Processa encontro social (usado internamente) |
| POST | `/api/world/weather` | Altera clima |

## Socket.io

Evento `gameState` emitido a cada 250ms com:

```ts
{
  world, agents, structures, entities, events
}
```

## Estrutura

```
src/
  server.ts   # Express + Socket.io + rotas
  loop.ts     # Motor físico + social + clima
  ai.ts       # Integração com Groq
  db.ts       # Pool Postgres
```

## Frontend

Repositório irmão: [god-game-frontend](https://github.com/vinisena21/god-game-frontend).
