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
    name: de.entity?.canonicalName,
    role: de.role,
    aliases: de.entity?.aliases || []
  })) || [],
  // Additive: the raw-shaped relation the shared getVendor() helper reads
  // (canonicalName nested under `entity`). Surfacing it here lets Search, Queue
  // and Detail share ONE vendor/amount extraction path. The flattened `entities`
  // field above is left exactly as-is, so File Detail output is unchanged.
  documentEntities: doc.documentEntities?.map((de: any) => ({
    role: de.role,
    entity: { canonicalName: de.entity?.canonicalName, name: de.entity?.name }
  })) || []
});

export const mapDocumentListToDto = (docs: any[]) => docs.map(mapDocumentToDto);
