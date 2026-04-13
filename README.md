<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&amp;color=0:0a1628,50:1e3a5f,100:0ea5e9&amp;height=160&amp;section=header&amp;text=Scan%20%2526%20Action&amp;fontSize=52&amp;fontColor=ffffff&amp;fontAlignY=40&amp;desc=AI-Powered%20Invoice%20Processing&amp;descAlignY=62&amp;descColor=7dd3fc&amp;animation=fadeIn" width="100%"/>

<br/>

[![Live](https://img.shields.io/badge/●_LIVE-1D9E75?style=for-the-badge)](https://scan-and-action.vercel.app)
[![Launch App](https://img.shields.io/badge/scan--and--action.vercel.app-Launch%20Now-0ea5e9?style=for-the-badge&logo=vercel&logoColor=white)](https://scan-and-action.vercel.app)
[![Gemini Vision](https://img.shields.io/badge/Gemini%20Vision-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Next.js 14](https://img.shields.io/badge/Next.js%2014-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![License](https://img.shields.io/badge/MIT-1D9E75?style=for-the-badge)](LICENSE)

> **Automatically extract, classify, and act on invoice data using Gemini Vision AI.**

</div>

---

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

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0a1628,50:1e3a5f,100:0ea5e9&height=100&section=footer&animation=fadeIn" width="100%"/>
</div>
