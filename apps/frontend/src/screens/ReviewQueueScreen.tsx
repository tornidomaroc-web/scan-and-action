import React, { useEffect, useState } from 'react';
import { documentService } from '../services/documentService';
import { ResultTable } from '../components/ResultTable';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';

export const ReviewQueueScreen = ({ onOpenDoc, t }: { onOpenDoc: (id: string) => void, t: any }) => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    documentService.getReviewQueue()
      .then(setDocs)
      .catch(err => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="screen-container"><div className="loader">{t.loadingQueue}</div></div>;
  if (errorMsg) return <div className="screen-container"><ErrorState title={t.errorTitle} message={errorMsg} /></div>;

  return (
    <div className="screen-container">
      <h2 style={{ marginBottom: '1.5rem' }}>{t.reviewTitle}</h2>
      <p className="text-muted mb-4">
        {t.reviewDesc}
      </p>

      {docs.length === 0 ? (
         <EmptyState message={t.allCaughtUp} />
      ) : (
         <ResultTable 
           data={docs} 
           emptyStateComponent={<EmptyState message={t.queueEmpty} />}
           onRowClick={(row) => onOpenDoc(row.id)}
         />
      )}
    </div>
  );
};
