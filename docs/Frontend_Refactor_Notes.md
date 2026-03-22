# Component Refactoring

## Separation of Concerns
We have extracted the core reusable rendering components from `SharedComponents.tsx` into precise, dedicated files:
- `SearchBar.tsx`
- `AnswerCard.tsx`
- `ResultTable.tsx`
- `ClarificationCard.tsx`

## Architectural Benefits
1. **Clean Props**: Each component now receives explicit typed arguments without polluting the parent scope.
2. **Stateless Renderers**: The cards and tables are 100% "dumb" components. They do not know about LLMs, APIs, or routing states. If they are handed an array of objects, they render a table. If they are handed a string, they render a title card. 
3. **Screen Orchestration**: `SearchScreen.tsx` is now solely responsible for React lifecycle hooks (`useState`, `useEffect`), managing the `QueryResultDto` transitions, and orchestrating WHICH stateless component to mount based dynamically on the `outputFormat` (e.g. `short_answer` -> `AnswerCard`).

This maintains our highly deterministic execution limits on the frontend.
