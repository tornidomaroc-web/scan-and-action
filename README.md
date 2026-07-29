<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&amp;color=0:0a1628,50:1e3a5f,100:0ea5e9&amp;height=160&amp;section=header&amp;text=Scan%20%2526%20Action&amp;fontSize=52&amp;fontColor=ffffff&amp;fontAlignY=40&amp;desc=Receipt%20%26%20Invoice%20Intelligence&amp;descAlignY=62&amp;descColor=7dd3fc&amp;animation=fadeIn" width="100%"/>

<br/>

[![Live](https://img.shields.io/badge/●_LIVE-1D9E75?style=for-the-badge)](https://scan-and-action.vercel.app)
[![Launch App](https://img.shields.io/badge/scan--and--action.vercel.app-Launch%20Now-0ea5e9?style=for-the-badge&logo=vercel&logoColor=white)](https://scan-and-action.vercel.app)
[![Gemini Vision](https://img.shields.io/badge/Gemini%20Vision-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![React](https://img.shields.io/badge/React%2018%20+%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![License](https://img.shields.io/badge/MIT-1D9E75?style=for-the-badge)](LICENSE)

> **Upload a receipt or invoice. Get structured data and a decision in seconds.**

</div>

## What it does

1. **Upload** a receipt or invoice (JPEG/PNG/WebP/PDF, ≤10 MB).
2. **Extract** — Gemini Vision pulls merchant, total, date, and currency, in Arabic, French, or English.
3. **Decide** — built-in business rules return one of three verdicts:

| Status | Meaning |
|--------|---------|
| ✅ `APPROVED` | Data complete, rules passed |
| ⚠️ `NEEDS_REVIEW` | Partial data or ambiguous fields |
| 🚫 `FLAGGED` | Rule violation (high amount, food expense over limit, possible duplicate) |

4. **Act** — review queue with a fix panel (correct amount, justify, re-evaluate), natural-language search (EN/FR/AR keywords), CSV export.

The UI is localized in English, French, and Arabic with automatic RTL switching.

**Pricing:** free tier (10 scans) · PRO at $9/month or $59/year via Paddle.

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 · Vite · Tailwind CSS · react-router |
| Backend | Express 5 · Prisma · PostgreSQL |
| Auth & storage | Supabase (JWT auth, private file bucket) |
| Extraction | Gemini Flash (vision, JSON mode) |
| Billing | Paddle (webhook-driven plan upgrades) |
| Hosting | Vercel (frontend) · Railway (backend) |

## Structure

```
apps/
  backend/    Express API — auth, upload pipeline, rule engine, search, webhook
  frontend/   React SPA — dashboard, review queue, document detail, settings
```

## Run locally

```bash
# Backend (apps/backend)
npm install
cp ../../.env.example .env   # fill in real values
npx prisma migrate deploy
npm run dev                  # http://localhost:3001

# Frontend (apps/frontend)
npm install                  # set VITE_ vars in .env
npm run dev                  # http://localhost:5173
```

See `.env.example` for every required variable.

## Deployment — database migrations

There is exactly one reachable database: **production** (Supabase). There is no
staging or throwaway database in this project. Every rule below follows from that.

**How migrations are applied.** Migrations are applied by `prisma migrate deploy`,
configured as the **pre-deploy command on the Railway backend service**. Railway runs
the pre-deploy command to completion before the new container starts serving traffic,
so schema application strictly precedes the code that depends on it. If the pre-deploy
command fails, the new container is not promoted.

> **Status:** the Railway pre-deploy setting is not configured yet. Until it is, this
> section describes the intended and required mechanism, not the current live state,
> and migrations still reach production only when someone runs `prisma migrate deploy`
> manually. Do not assume a merged migration has been applied.

**CI does not apply migrations, and must not.** `.github/workflows/ci.yml` only
typechecks, tests, and builds. It has no database credentials and must never be given
any. Applying schema changes is the deploy path's job, not CI's.

**Never run against production:**

- `prisma db push` — applies the schema with no migration history and will drop
  columns or tables it considers drift. The `db:push` npm script was removed for this
  reason.
- `prisma migrate reset` — drops and recreates the database. It destroys all
  production data.

**Before merging any migration.** Run `prisma migrate diff` read-only and confirm it
comes back **empty** — an empty diff means the committed migrations fully describe the
schema and nothing will be silently applied or skipped at deploy time. A non-empty diff
means the migration set and the schema disagree; resolve that before merging, never at
deploy time.

## Built by

[AboJad](https://github.com/tornidomaroc-web) — Full Stack AI Engineer, Marrakesh 🇲🇦

<img src="https://capsule-render.vercel.app/api?type=waving&amp;color=0:0a1628,50:1e3a5f,100:0ea5e9&amp;height=100&amp;section=footer" width="100%"/>
