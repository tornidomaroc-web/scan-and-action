import { describe, it, expect } from 'vitest';
import { mapDocumentToDto } from './documentDto';

// ============================================================================
// Entity display name (fix A, display-only)
// ============================================================================
// canonicalName is a normalized MATCHING KEY (uppercased, accents/punctuation
// stripped at write time). The human-readable original spelling lives in
// aliases[0]. The display layer must render the human name, while canonicalName
// stays intact for matching / dedup / the rule engine. These guards assert the
// DTO derives a display name from aliases[0] (canonicalName fallback) WITHOUT
// changing the canonicalName value.

const docWith = (entity: any) => ({ documentEntities: [{ role: 'VENDOR', entity }] });

describe('mapDocumentToDto - entity display name', () => {
  it('entities[].name prefers aliases[0] (human-readable) over canonicalName', () => {
    const dto = mapDocumentToDto(
      docWith({ canonicalName: 'SOCIT RGIONALE', aliases: ['Societe Regionale Multiservices Marrakech-Safi SA'] })
    );
    expect(dto.entities[0].name).toBe('Societe Regionale Multiservices Marrakech-Safi SA');
  });

  it('exposes documentEntities.entity.displayName (aliases[0]) while keeping canonicalName intact', () => {
    const dto = mapDocumentToDto(
      docWith({ canonicalName: 'SOCIT RGIONALE', aliases: ['Societe Regionale'] })
    );
    expect(dto.documentEntities[0].entity.displayName).toBe('Societe Regionale');
    // canonicalName value is untouched (matching/dedup + rule engine rely on it).
    expect(dto.documentEntities[0].entity.canonicalName).toBe('SOCIT RGIONALE');
  });

  it('falls back to canonicalName when there is no alias (never fabricates a name)', () => {
    const dto = mapDocumentToDto(docWith({ canonicalName: 'TARGET', aliases: [] }));
    expect(dto.entities[0].name).toBe('TARGET');
    expect(dto.documentEntities[0].entity.displayName).toBe('TARGET');
  });

  it('still exposes aliases and role on the flattened entities row', () => {
    const dto = mapDocumentToDto(docWith({ canonicalName: 'CAF DE PARIS', aliases: ['Cafe de Paris'] }));
    expect(dto.entities[0].role).toBe('VENDOR');
    expect(dto.entities[0].aliases).toEqual(['Cafe de Paris']);
  });

  // item B (Phase 3): the real displayName column is now the source of truth,
  // preferred over aliases[0] and canonicalName on BOTH name-shapes.
  it('prefers the real displayName column over aliases[0] and canonicalName', () => {
    const dto = mapDocumentToDto(
      docWith({ displayName: 'Société Régionale', canonicalName: 'SOCIT RGIONALE', aliases: ['stale alias'] })
    );
    expect(dto.entities[0].name).toBe('Société Régionale');
    expect(dto.entities[0].displayName).toBe('Société Régionale');
    expect(dto.documentEntities[0].entity.displayName).toBe('Société Régionale');
    // canonicalName value is still untouched (matching/dedup + rule engine).
    expect(dto.documentEntities[0].entity.canonicalName).toBe('SOCIT RGIONALE');
  });

  it('exposes displayName: null on the flattened row when the column is null (older rows)', () => {
    const dto = mapDocumentToDto(docWith({ displayName: null, canonicalName: 'TARGET', aliases: ['Target'] }));
    expect(dto.entities[0].displayName).toBeNull();
    // name still resolves to a real value via the aliases[0] fallback.
    expect(dto.entities[0].name).toBe('Target');
  });
});
