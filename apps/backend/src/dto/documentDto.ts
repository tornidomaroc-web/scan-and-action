export const mapDocumentToDto = (doc: any) => ({
  id: doc.id,
  originalFileName: doc.originalFileName,
  fileUrl: doc.fileUrl,
  documentType: doc.documentType,
  detectedLanguage: doc.detectedLanguage,
  summary: doc.summary,
  overallConfidence: doc.overallConfidence,
  status: doc.status,
  uploadedAt: doc.uploadedAt,
  facts: doc.facts?.map((f: any) => ({
    key: f.key,
    // Additive: expose factType exactly as the raw Prisma row does, so the
    // shared getAmount() helper (which keys off factType === 'AMOUNT') resolves a
    // real amount on queue rows too. Existing consumers (File Detail reads
    // fact.key) are unaffected.
    factType: f.factType,
    valueString: f.valueString,
    valueNumber: f.valueNumber,
    valueDate: f.valueDate,
    currency: f.currency,
    confidence: f.confidence
  })) || [],
  entities: doc.documentEntities?.map((de: any) => ({
    // Display-only (fix A): render the human-readable name, not the normalized
    // matching KEY. `canonicalName` is uppercased + ASCII-folded (accents/
    // punctuation stripped) at write time for dedup/matching; the original
    // spelling (casing + accents) is preserved in `aliases[0]`. Prefer that,
    // falling back to `canonicalName` when there is no alias. The canonicalName
    // VALUE is never changed here; only what the display layer reads.
    name: de.entity?.aliases?.[0] ?? de.entity?.canonicalName,
    role: de.role,
    aliases: de.entity?.aliases || []
  })) || [],
  // Additive: the raw-shaped relation the shared getVendor() helper reads
  // (nested under `entity`). Surfacing it here lets Search, Queue and Detail
  // share ONE vendor/amount extraction path. `canonicalName` is kept intact
  // (matching/dedup and the rule engine still rely on it); `displayName` is an
  // additive human-readable field derived from aliases[0] (canonicalName
  // fallback) so getVendor can prefer a real name over the matching key.
  documentEntities: doc.documentEntities?.map((de: any) => ({
    role: de.role,
    entity: {
      canonicalName: de.entity?.canonicalName,
      name: de.entity?.name,
      displayName: de.entity?.aliases?.[0] ?? de.entity?.canonicalName
    }
  })) || []
});

export const mapDocumentListToDto = (docs: any[]) => docs.map(mapDocumentToDto);
