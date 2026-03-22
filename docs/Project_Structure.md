# Scan & Action - Project Structure

The project uses a monorepo structure (e.g., Turborepo or npm workspaces) for full-stack TypeScript development to easily share types and database schemas across the frontend and backend.

## Directory Tree

```
scan-and-action/
├── apps/
│   ├── frontend/             # Next.js or Vite React application (User interface)
│   └── backend/              # Node.js Express/FastAPI equivalent (API Services)
├── packages/
│   ├── shared/               # Shared TypeScript types, interfaces, and validation schemas (Zod)
│   │   └── src/types.ts
│   └── database/             # Prisma schema, migrations, and generated client
│       └── prisma/schema.prisma
├── docs/                     # Architecture and planning documentation
└── package.json              # Root workspace configuration
```

## Modules Mapping

- **Document Ingestion**: Located in `apps/backend/src/services/ingestion`
- **Multilingual Normalization**: Located in `apps/backend/src/services/normalization`
- **Fact/Entity Extraction**: Located in `apps/backend/src/services/extraction`
- **Search/Query Engine**: Located in `apps/backend/src/services/query`
- **Smart Reports**: Located in `apps/backend/src/services/reports`
- **Review Queue**: Located in `apps/backend/src/services/review` (Frontend: `apps/frontend/src/features/review`)
- **Query Logs**: Located in `apps/backend/src/services/logs` (Database layer logic)
