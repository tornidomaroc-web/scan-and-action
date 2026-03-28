SELECT id, "originalFileName", status, "documentType", "overallConfidence", "rawText", "uploadedAt"
FROM "Document"
ORDER BY "uploadedAt" DESC
LIMIT 10;
