# Scan & Action — AI-Powered Invoice Processing

> Automatically extract, classify, and act on invoice data using Gemini Vision AI.

[![Deploy with Vercel](https://vercel.com/button)](https://scan-and-action.vercel.app)
![TypeScript](https://img.shields.io/badge/TypeScript-91%25-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## What it does

Scan & Action reads invoice images and PDFs, extracts structured data via Gemini Vision, and automatically classifies each entry as **APPROVED**, **NEEDS REVIEW**, or **FLAGGED** — with a human-in-the-loop correction panel for edge cases.

## Key Features

- 📄 **AI Extraction** — Gemini Vision pulls line items, totals, vendors, and dates
- ✅ **Smart Classification** — Rule engine assigns APPROVED / NEEDS REVIEW / FLAGGED
- 🔧 **Fix Action Panel** — Users correct AI mistakes directly in the UI
- 🌐 **Multilingual** — Arabic & English support with full RTL layout
- 💳 **Freemium** — Free tier + $9/month Pro via Lemon Squeezy

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Database | PostgreSQL + Prisma |
| AI Engine | Google Gemini Vision |
| Payments | Lemon Squeezy |
| Deploy | Vercel + Render |

## Getting Started

```bash
git clone https://github.com/tornidomaroc-web/scan-and-action.git
cd scan-and-action
npm install
cp .env.example .env.local
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | Lemon Squeezy webhook secret |
| `NEXTAUTH_SECRET` | Auth secret key |

## Project Structure

```
apps/
  web/          # Next.js frontend + API routes
  backend/      # Express/Node processing service
packages/       # Shared types and utilities
docs/           # Documentation
```

## Contributing

PRs are welcome. Please open an issue first to discuss what you'd like to change.

## License

MIT © 2025 Scan & Action
