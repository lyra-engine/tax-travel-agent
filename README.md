# Fidelis

> Tax AI for the advisor's chair.

Fidelis is an opinionated tax copilot built for licensed financial advisors.
Every number is produced by a deterministic tool. Every claim is tied to a
source. When it doesn't know, it says so.

It ships as a base agent you can drop into an advisor platform, plus a set
of advisor-facing surfaces (scenarios, document intake, PDF memos, audit log)
built on the same tools.

**Monolith, not micro-frontends:** landing, agent, residency tracker, scenarios,
and APIs all live in this single Astro app. You get **one Git repository** and
**one deployable unit** (one Vercel project or one Node process). The tracker
and agent share the same trip data via *Journal → client* on `/agent` or the
tracker’s *Agent workspace* card.

---

## Product surfaces

| Route            | What it is                                                                             |
| ---------------- | -------------------------------------------------------------------------------------- |
| `/`              | Scroll-driven editorial landing (Chapters 00 – 05).                                    |
| `/agent`         | The AI workspace: per-client chat, tool calls, citations, usage, drafts.               |
| `/scenarios`     | Side-by-side tax scenarios (Roth vs. no-Roth, NY vs. FL, S-corp vs. Sole-prop).        |
| `/intake`        | Document intake — W-2 / 1099 / 1040 vision parse, diff, and merge into client profile. |
| `/tracker`       | Residency day-tracker: 183-rule, US SPT, state domicile.                               |
| `/memo/[id]`     | Branded, print-ready PDF memo of any conversation.                                     |
| `/audit`         | Firm-scoped compliance log: every turn, tokens, tool latency, cost.                    |
| `/login`, `/signup`, `/team` | Multi-tenant auth (opt-in via `FIDELIS_AUTH=1`).                           |

### Under the hood

- **Agent** — Groq (`llama-3.3-70b-versatile`) or OpenAI (`gpt-4o-mini`) with
  streaming NDJSON, up to five tool rounds per turn, `include_usage` token
  accounting. Provider picked automatically: `GROQ_API_KEY` wins if set,
  otherwise falls back to `OPENAI_API_KEY`.
- **Tools** — Ten deterministic TypeScript calculators (federal brackets,
  state tax, AMT, NIIT, QBI, SE, residency/SPT, LTCG, Roth ladder, entity
  comparison). Zod-validated args.
- **RAG** — `text-embedding-3-small` over an in-repo knowledge base of
  IRS/state-tax snippets (OpenAI only). Groq has no embeddings endpoint,
  so the knowledge base auto-falls-back to keyword search when running on
  Groq — the agent still cites sources.
- **Vision intake** — Groq (`llama-4-scout-17b`) or OpenAI (`gpt-4o-mini`)
  structured extraction on uploaded forms.
- **Persistence** — `localStorage` for advisor clients & conversations
  (server-light MVP); SQLite + scrypt for auth.
- **Stack** — Astro 6 (SSR) · React 19 · Tailwind 4 · TypeScript · Zod.

---

## Local dev

```sh
npm install
cp .env.example .env
# edit .env and set GROQ_API_KEY (preferred) or OPENAI_API_KEY
npm run dev
```

Open <http://localhost:4321>.

Without an API key, everything still renders — `/api/chat` and `/api/intake`
return 503 with a clear message, and the knowledge base falls back to
keyword search.

### Optional: enable auth

```sh
FIDELIS_AUTH=1 npm run dev
```

Then visit `/signup` to create the first firm + admin user. User/session data
goes to `./data/fidelis.sqlite`.

---

## Deploy

### GitHub + Vercel (one production site)

1. Push this repo to GitHub (you already have a single codebase; no merging of
   separate repos required).
2. In [Vercel](https://vercel.com/new), **Import** that repository. Vercel
   detects Astro; leave the default build command (`astro build`) and output.
3. Add environment variables (see below), then deploy. Every route (`/`,
   `/agent`, `/tracker`, `/api/*`, …) is served from **one** project URL.

CLI alternative (link the local folder to a Vercel project, then deploy):

```sh
vercel link
vercel --prod
```

### Vercel (recommended for showcase)

The Astro config auto-detects Vercel via `process.env.VERCEL` and uses
`@astrojs/vercel` (serverless mode). No extra `vercel.json` needed.

```sh
vercel --prod
```

Required environment variables on Vercel (set exactly one key):

- `GROQ_API_KEY` — preferred. Enables chat, tool calling, vision intake.
  RAG falls back to keyword search (Groq has no embeddings endpoint).
- `OPENAI_API_KEY` — fallback. Enables the above **plus** true semantic RAG
  over the knowledge base.

Optional:

- `LLM_MODEL` — override chat/tool model. Defaults: Groq →
  `llama-3.3-70b-versatile`, OpenAI → `gpt-4o-mini`.
- `LLM_VISION_MODEL` — override vision model for intake.
- `FIDELIS_AUTH` — leave unset (or `0`) on Vercel; SQLite is not persisted
  across serverless invocations.

### Self-hosted Node

```sh
npm run build
npm start    # node ./dist/server/entry.mjs
```

A standalone Node server binds to `HOST:PORT` (default `0.0.0.0:4321`).
Point your reverse proxy / container orchestrator at it.

---

## Repo layout

```
src/
├── components/        React + Astro UI (agent, intake, scenarios, memo, landing)
├── layouts/           Shared Astro layout (Dashboard)
├── lib/
│   ├── advisor/       Tools, RAG, audit, tax planning, embeddings
│   └── auth/          SQLite + session + password scaffolding
├── pages/             Routes: /, /agent, /scenarios, /intake, /tracker, /memo/[id], /audit, /login, /signup, /team
│   └── api/           /api/chat, /api/compute, /api/intake, /api/auth/*
├── middleware.ts      Optional auth gate (opt-in via FIDELIS_AUTH=1)
└── styles/global.css  Design tokens, Tailwind base, motion system
```

---

## Scripts

| Command         | Action                                       |
| --------------- | -------------------------------------------- |
| `npm run dev`   | Dev server on <http://localhost:4321>        |
| `npm run build` | Production build to `./dist/`                |
| `npm start`     | Run built server (Node standalone)           |
| `npm run preview` | Preview the build (uses the active adapter) |

---

## Disclaimer

Fidelis is an educational / analytical tool built to run under advisor
supervision. Outputs are not tax, legal, or investment advice. Every number
must be verified against current IRS and state guidance before acting on it.
