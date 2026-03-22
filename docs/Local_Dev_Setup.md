# Local Development Set Up

The environment is strictly split between deterministic Express pipelines and the Vite UI layout. Run them via parallel terminals inside `scan-and-action/`.

## 1. Run the Express Backend
From `scan-and-action/apps/backend`:
```bash
# Verify environment points to SQLite/Postgres cleanly
npx prisma generate
npx prisma db push

# Start the dev server on port 3000
npm run dev
```

## 2. Run the Vite Frontend
From `scan-and-action/apps/frontend`:
```bash
# Verify env injection if pointing to a remote backend; defaults to localhost:3000
npm run dev
```
*Frontend opens at `http://localhost:5173`.*

## Modifying Endpoints
The frontend explicitly funnels all backend requests into `apps/frontend/src/services/apiConfig.ts`:
```typescript
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
```
If you deploy the Express app to Heroku/Render, inject `.env` via `VITE_API_URL`.
