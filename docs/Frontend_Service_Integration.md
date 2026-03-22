# Service Implementation Overlays

## Decoupled Architecture
The React components no longer depend on specific internal execution files or direct mock states for state validation.
- `types.ts`: We centralized the `QueryResultDto` allowing all Search and Results screens to read deterministic definitions without cyclical mockup dependencies.
- `searchService.ts` and `reportsService.ts`: Wrap `setTimeout()` blocks that return Promise representations of the exact JSON models defined in `QueryResultDto`.

## Preparing For Production
To swap the UI to the actual backend Postgres / Gemini pipeline created during execution modeling:
Simply modify the files inside `apps/frontend/src/services/`.

Example `searchService.ts` update:
```typescript
async executeQuery(query: string, language: string): Promise<QueryResultDto> {
   const res = await fetch('/api/search', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ query, language })
   });
   
   if (!res.ok) throw new Error('Data Engine Server Error');
   return res.json();
}
```

The underlying orchestrator (`SearchScreen.tsx`) inherently traps this into the `try/catch` block, immediately displaying the visual `ErrorState` cleanly overriding the layout graph natively without any further UI edits required.
