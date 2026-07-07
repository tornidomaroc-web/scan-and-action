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
});
