import { describe, it, expect } from 'vitest';
import { EntityResolutionService } from './entityResolution';

// In-memory fake Prisma that honestly emulates the two branches of the
// resolution lookup (canonicalName match OR exact alias match) and records
// creates, so lookup/write agreement can be proven without a database. (item B)
function makeFakePrisma() {
  const store: any[] = [];
  let seq = 0;
  return {
    store,
    entity: {
      findFirst: async ({ where }: any) => {
        const or = where.OR || [];
        const canon = or.find((c: any) => 'canonicalName' in c)?.canonicalName;
        const aliasHas = or.find((c: any) => 'aliases' in c)?.aliases?.has;
        return (
          store.find(
            (e) =>
              e.organizationId === where.organizationId &&
              (e.canonicalName === canon ||
                (Array.isArray(e.aliases) && e.aliases.includes(aliasHas)))
          ) || null
        );
      },
      create: async ({ data }: any) => {
        const row = { id: `ent-${++seq}`, ...data };
        store.push(row);
        return row;
      },
    },
  } as any;
}

const raw = (name: string, entityType = 'VENDOR') =>
  ({ name, entityType, role: 'Issuer', sourceSpan: 's', confidence: 1 }) as any;

describe('EntityResolutionService.resolveOrGenerateEntity (item B)', () => {
  it('writes displayName = trimmed raw name (casing + accents preserved) on create', async () => {
    const prisma = makeFakePrisma();
    const e = await new EntityResolutionService(prisma).resolveOrGenerateEntity('org', raw('  Café Central  '));
    expect(e.displayName).toBe('Café Central');
    expect(e.canonicalName).toBe('CAF CENTRAL'); // stripped matching key, format unchanged
    expect(e.aliases).toEqual(['Café Central']);
  });

  it('leaves displayName NULL for an empty/whitespace-only name (never an empty string)', async () => {
    const prisma = makeFakePrisma();
    const e = await new EntityResolutionService(prisma).resolveOrGenerateEntity('org', raw('   '));
    expect(e.displayName).toBeNull();
  });

  it('never launders the mangled canonicalName into displayName', async () => {
    const prisma = makeFakePrisma();
    const e = await new EntityResolutionService(prisma).resolveOrGenerateEntity('org', raw("McDonald's"));
    expect(e.canonicalName).toBe('MCDONALDS');
    expect(e.displayName).toBe("McDonald's");
    expect(e.displayName).not.toBe(e.canonicalName);
  });

  it('resolves a re-sighting with different casing/accents to the SAME row (no duplicate)', async () => {
    const prisma = makeFakePrisma();
    const svc = new EntityResolutionService(prisma);
    const first = await svc.resolveOrGenerateEntity('org', raw('Café Central'));
    // Different string, SAME canonical key. Before the lookup/write fix this
    // created a duplicate (the lookup used toUpperCase WITHOUT the strip).
    const second = await svc.resolveOrGenerateEntity('org', raw('CAFÉ CENTRAL'));
    expect(second.id).toBe(first.id);
    expect(prisma.store.length).toBe(1);
  });

  it('still resolves an exact re-sighting via the alias branch', async () => {
    const prisma = makeFakePrisma();
    const svc = new EntityResolutionService(prisma);
    const first = await svc.resolveOrGenerateEntity('org', raw('Épicerie Léa'));
    const second = await svc.resolveOrGenerateEntity('org', raw('Épicerie Léa'));
    expect(second.id).toBe(first.id);
    expect(prisma.store.length).toBe(1);
  });

  it('scopes resolution per organization (same name in another org is a new row)', async () => {
    const prisma = makeFakePrisma();
    const svc = new EntityResolutionService(prisma);
    await svc.resolveOrGenerateEntity('org-a', raw('Walmart'));
    await svc.resolveOrGenerateEntity('org-b', raw('Walmart'));
    expect(prisma.store.length).toBe(2);
  });
});
