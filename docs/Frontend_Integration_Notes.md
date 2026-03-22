# Frontend Integration Notes

## Separation of Concerns (Frontend vs Backend)
This frontend was specifically constructed to consume `QueryResultDto` responses deterministically.
- `apps/frontend/src/screens/SearchScreen.tsx`: Acts purely as a renderer map. It reads `result.outputFormat` (`table`, `short_answer`, `chart_ready_data`) and conditionally mounts the correct generic component.
- The UI **does not** query Gemini. The backend holds all safety checks.

## Mock Replacements
To connect to the live PostgreSQL / Prisma backend:
1. In `SearchScreen.tsx` inside `handleSearch`, replace the `setTimeout()` mock fetch with a real `fetch('/api/search', { body: { query, language } })`.
2. Delete `apps/frontend/src/mocks/apiMocks.ts`.

## RTL Engine
The `App.tsx` container injects `dir="rtl"` into the top-level `div` and appends an `.rtl` CSS class.
The CSS relies purely on standard Flexbox row distributions overlaid with specific `[dir="rtl"]` targets for visual offsets:
```css
.search-input { border-radius: 24px 0 0 24px; }
[dir="rtl"] .search-input { border-radius: 0 24px 24px 0; }
```
This guarantees UI structure remains fluid across language switching.
