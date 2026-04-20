# Scan & Action

> Receipt and document intelligence — extract, classify, and flag in seconds.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Gemini Vision](https://img.shields.io/badge/Gemini-Vision-yellow)](https://deepmind.google/technologies/gemini/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-green)](https://fastapi.tiangolo.com/)

Upload a receipt, invoice, or prescription.  
Scan & Action extracts structured data and applies business rules automatically.

## Decision Engine

Every document gets one of three verdicts:

| Status | Meaning |
|--------|---------|
| ✅ `APPROVED` | Data complete, rules passed |
| ⚠️ `NEEDS_REVIEW` | Partial data or ambiguous fields |
| 🚫 `FLAGGED` | Rule violation or missing critical field |

## Features

- OCR via Gemini Vision — Arabic, French, English
- RTL/LTR auto-switching per document language
- Configurable rule engine per document type
- Fix Action Panel — correct and reprocess in one click
- Freemium model — Pro tier at $9/month

## Stack

`Next.js` · `FastAPI` · `Gemini Vision` · `Supabase` · `PostgreSQL` · `Docker`

## Architecture

```
User → Next.js (frontend)
         └→ FastAPI (rule engine + OCR pipeline)
               └→ Gemini Vision (extraction)
               └→ Supabase (storage + auth)
```

## Run locally

```bash
# Frontend
npm install && npm run dev

# Backend
pip install -r requirements.txt
uvicorn main:app --reload
```

```env
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

## Built by

[AboJad](https://github.com/tornidomaroc-web) — Full Stack AI Engineer, Marrakesh 🇲🇦
