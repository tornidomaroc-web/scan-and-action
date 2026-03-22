import React, { useEffect, useState } from 'react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';
import { ReviewBadge } from '../components/SharedComponents';

export const DocumentDetailScreen = ({
  documentId,
  onBack,
  t,
}: {
  documentId: string;
  onBack: () => void;
  t: any;
}) => {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    documentService
      .getDocumentDetail(documentId)
      .then(setDoc)
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }, [documentId]);

  if (loading) {
    return (
      <div className="screen-container">
        <div className="loader">{t.loadingDoc}</div>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="screen-container">
        <ErrorState title={t.errorTitle} message={errorMsg} />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="screen-container">
        <ErrorState title={t.errorTitle} message={t.docNotFound} />
      </div>
    );
  }

  const isImageFile =
    typeof doc.signedFileUrl === 'string' &&
    /\.(jpg|jpeg|png|webp|gif)$/i.test(doc.originalFileName || '');

  const isPdfFile =
    typeof doc.signedFileUrl === 'string' &&
    /\.pdf$/i.test(doc.originalFileName || '');

  return (
    <div className="screen-container">
      <button onClick={onBack} className="back-btn mb-4">
        {t.backToSearch}
      </button>

      <div className="card">
        <div className="flex-between">
          <h2>{doc.originalFileName || `Document ${doc.id}`}</h2>
          <ReviewBadge confidence={doc.overallConfidence} />
        </div>

        <div
          className="grid col-2 mt-4"
          style={{ gap: '1rem', marginBottom: '1.5rem' }}
        >
          <div className="meta-box">
            <b>{t.status}:</b> {doc.status}
          </div>
          <div className="meta-box">
            <b>{t.type}:</b> {doc.documentType}
          </div>
          <div className="meta-box">
            <b>{t.date}:</b> {new Date(doc.uploadedAt).toLocaleDateString()}
          </div>
          <div className="meta-box">
            <b>{t.docLanguage}:</b> {doc.detectedLanguage?.toUpperCase()}
          </div>
        </div>

        {doc.signedFileUrl && (
          <div className="mt-4 mb-4">
            <h3 className="mb-2">Document Preview</h3>

            {isImageFile ? (
              <img
                src={doc.signedFileUrl}
                alt={doc.originalFileName || 'Document preview'}
                style={{
                  maxWidth: '100%',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                }}
              />
            ) : isPdfFile ? (
              <iframe
                src={doc.signedFileUrl}
                title={doc.originalFileName || 'PDF preview'}
                style={{
                  width: '100%',
                  height: '600px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  borderRadius: '8px',
                }}
              />
            ) : (
              <a
                href={doc.signedFileUrl}
                target="_blank"
                rel="noreferrer"
                className="tag"
              >
                Open file
              </a>
            )}
          </div>
        )}

        <p
          className="summary-block"
          style={{
            padding: '1rem',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: '8px',
          }}
        >
          {doc.summary}
        </p>

        <h3 className="mt-4 mb-2">{t.extractedFacts}</h3>
        {doc.facts && doc.facts.length > 0 ? (
          <table className="results-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {doc.facts.map((fact: any, i: number) => (
                <tr key={i}>
                  <td>{fact.key}</td>
                  <td>
                    {fact.valueString ||
                      fact.valueNumber ||
                      String(fact.valueDate)}{' '}
                    {fact.currency || ''}
                  </td>
                  <td>{Math.round(fact.confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">{t.noFacts}</p>
        )}

        <h3 className="mt-4 mb-2">{t.relatedEntities}</h3>
        {doc.entities && doc.entities.length > 0 ? (
          <div
            className="entities-flex"
            style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
          >
            {doc.entities.map((ent: any, i: number) => (
              <span key={i} className="tag">
                {ent.role}: {ent.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted">{t.noEntities}</p>
        )}
      </div>
    </div>
  );
};