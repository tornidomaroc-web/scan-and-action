import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { documentService } from '../services/documentService';
import { useToast } from './ToastContext';

export type JobStatus = 'PROCESSING' | 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED';

export interface ProcessingJob {
  documentId: string;
  fileName: string;
  status: JobStatus;
  startedAt: number;
}

interface ProcessingContextType {
  jobs: ProcessingJob[];
  processingCount: number;
  trackUpload: (documentId: string, fileName: string) => void;
  clearSettled: () => void;
}

const ProcessingContext = createContext<ProcessingContextType | undefined>(undefined);

const LS_KEY = 'sa_processing_jobs';
// Same cadence the old in-modal poller used. The timeout is per polling
// session (not since upload), so a job resumed after backgrounding gets a
// fresh window instead of being declared FAILED on arrival.
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;
// Docs still PROCESSING in storage resume polling on mount if the upload
// started within this window; older entries are stale and dropped.
const RESUME_WINDOW_MS = 2 * 60 * 60 * 1000;

function readStoredJobs(): ProcessingJob[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ProcessingProvider: React.FC<{
  children: React.ReactNode;
  onJobSettled?: () => void;
}> = ({ children, onJobSettled }) => {
  // Initial state IS the resume set: read storage before the persist effect
  // below ever runs, otherwise it would wipe the stored jobs on mount.
  const [jobs, setJobs] = useState<ProcessingJob[]>(() => {
    const now = Date.now();
    return readStoredJobs().filter(
      (j) => j.status === 'PROCESSING' && now - j.startedAt < RESUME_WINDOW_MS
    );
  });
  const timersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const jobsRef = useRef<ProcessingJob[]>([]);
  const settledRef = useRef(onJobSettled);
  settledRef.current = onJobSettled;
  const { showToast } = useToast();

  jobsRef.current = jobs;

  // Only PROCESSING jobs persist — that's the resume set. Terminal jobs
  // live in memory for the tray until cleared or the app reloads.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(jobs.filter((j) => j.status === 'PROCESSING')));
    } catch {
      /* storage full/unavailable — polling still works for this session */
    }
  }, [jobs]);

  const updateJob = (documentId: string, status: JobStatus) => {
    setJobs((prev) => prev.map((j) => (j.documentId === documentId ? { ...j, status } : j)));
  };

  const stopPolling = (documentId: string) => {
    const t = timersRef.current[documentId];
    if (t) {
      clearInterval(t);
      delete timersRef.current[documentId];
    }
  };

  const settle = (documentId: string, status: JobStatus) => {
    stopPolling(documentId);
    updateJob(documentId, status);
    const job = jobsRef.current.find((j) => j.documentId === documentId);
    const name = job?.fileName || 'Document';
    if (status === 'COMPLETED') {
      showToast(`${name} processed successfully.`, 'success');
    } else if (status === 'NEEDS_REVIEW') {
      showToast(`${name} needs review.`, 'info');
    } else if (status === 'FAILED') {
      showToast(`${name} could not be processed.`, 'error');
    }
    // Bumps Layout's refresh counter -> stats refetch -> queue badge.
    settledRef.current?.();
  };

  const startPolling = (documentId: string) => {
    stopPolling(documentId);
    let pollStart = Date.now();
    let lastTick = Date.now();

    const check = async () => {
      const now = Date.now();
      // Native background / web tab-throttling suspends JS timers. On resume the
      // pending tick fires with a stale clock — without this the elapsed time
      // would blow past POLL_TIMEOUT_MS and wrongly settle a still-running job as
      // FAILED. A large gap between ticks means we were suspended, so we grant a
      // fresh window instead of counting the gap. (Fixes warm-resume on Android.)
      if (now - lastTick > POLL_INTERVAL_MS * 3) {
        pollStart = now;
      }
      lastTick = now;

      try {
        const doc = await documentService.getDocumentDetail(documentId);
        const status: string = doc?.status ?? 'PROCESSING';
        if (status !== 'PROCESSING') {
          settle(documentId, status as JobStatus);
        } else if (Date.now() - pollStart > POLL_TIMEOUT_MS) {
          settle(documentId, 'FAILED');
        }
      } catch {
        settle(documentId, 'FAILED');
      }
    };

    timersRef.current[documentId] = setInterval(check, POLL_INTERVAL_MS);
    // Immediate first check: a resumed doc may already be done.
    check();
  };

  const trackUpload = (documentId: string, fileName: string) => {
    setJobs((prev) => [
      ...prev.filter((j) => j.documentId !== documentId),
      { documentId, fileName, status: 'PROCESSING', startedAt: Date.now() },
    ]);
    startPolling(documentId);
  };

  const clearSettled = () => {
    setJobs((prev) => prev.filter((j) => j.status === 'PROCESSING'));
  };

  // Resume-on-mount: anything that survived the storage filter above picks
  // its poll back up — this is what survives a cold app start.
  useEffect(() => {
    jobsRef.current.forEach((j) => startPolling(j.documentId));
    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
      timersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warm resume on native: backgrounding the Android app does NOT remount this
  // provider (so the mount effect above won't re-run), yet timers are suspended
  // while backgrounded. When the app returns to the foreground, restart polling
  // for in-flight jobs so the tray shows fresh status immediately and the
  // timeout window is reset. No-op on web (guarded by isNativePlatform).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      jobsRef.current
        .filter((j) => j.status === 'PROCESSING')
        .forEach((j) => startPolling(j.documentId));
    }).then((h) => {
      remove = h.remove;
    });
    return () => {
      remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processingCount = jobs.filter((j) => j.status === 'PROCESSING').length;

  return (
    <ProcessingContext.Provider value={{ jobs, processingCount, trackUpload, clearSettled }}>
      {children}
    </ProcessingContext.Provider>
  );
};

export const useProcessing = () => {
  const ctx = useContext(ProcessingContext);
  if (!ctx) throw new Error('useProcessing must be used within ProcessingProvider');
  return ctx;
};
