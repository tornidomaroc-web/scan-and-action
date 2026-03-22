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
  })) || []
});

export const mapDocumentListToDto = (docs: any[]) => docs.map(mapDocumentToDto);
