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
    // Render the human-readable name, not the normalized matching KEY.
    // `displayName` is the real column (item B, casing + accents preserved);
    // fall back to `aliases[0]` (older rows) then `canonicalName` so the value
    // is always a real name, never fabricated. The canonicalName VALUE is never
    // changed here; only what the display layer reads.
    name: de.entity?.displayName ?? de.entity?.aliases?.[0] ?? de.entity?.canonicalName,
    // Raw displayName column (may be NULL) so the client can apply the same
    // displayName ?? aliases[0] ?? name chain at the render site.
    displayName: de.entity?.displayName ?? null,
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
      // Resolved human-readable name for the shared getVendor() chain: real
      // displayName column first (item B), then aliases[0], then the
      // canonicalName key as a last resort. Never fabricated.
      displayName: de.entity?.displayName ?? de.entity?.aliases?.[0] ?? de.entity?.canonicalName
    }
  })) || []
});

export const mapDocumentListToDto = (docs: any[]) => docs.map(mapDocumentToDto);
