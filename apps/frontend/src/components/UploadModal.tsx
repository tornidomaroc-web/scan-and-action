import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, File, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadDocument } from '../services/uploadService';
import { useToast } from '../contexts/ToastContext';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  console.log('DEBUG: UploadModal rendered. isOpen:', isOpen);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'success' | 'error' | 'partial'>('idle');
  const [results, setResults] = useState<{ success: number; total: number }>({ success: 0, total: 0 });
  
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setUploading(false);
      setProgress(0);
      setStatus('idle');
      setResults({ success: 0, total: 0 });
    }
  }, [isOpen]);

  const addFiles = (newFiles: FileList | File[]) => {
    const validFiles = Array.from(newFiles).filter(newFile => {
      return !files.some(f => f.name === newFile.name && f.size === newFile.size && f.lastModified === newFile.lastModified);
    });
    
    if (validFiles.length < Array.from(newFiles).length) {
      showToast('Duplicate files ignored', 'info');
    }
    
    setFiles(prev => [...prev, ...validFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    // Reset input so the same file can be picked again if removed
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startUpload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setUploading(true);
    setStatus('idle');
    setProgress(0);

    let successCount = 0;
    const totalCount = files.length;

    try {
      for (let i = 0; i < totalCount; i++) {
        try {
          await uploadDocument(files[i]);
          successCount++;
        } catch (err) {
          console.error(`Failed to upload ${files[i].name}:`, err);
        }
        setProgress(Math.round(((i + 1) / totalCount) * 100));
      }

      setResults({ success: successCount, total: totalCount });
      
      if (successCount === totalCount) {
        setStatus('success');
        showToast(`Successfully uploaded ${totalCount} documents`, 'success');
        if (onSuccess) onSuccess();
        // ONLY auto-close if 100% success
        setTimeout(() => {
          onClose();
        }, 2000);
      } else if (successCount > 0) {
        setStatus('partial');
        showToast(`Uploaded ${successCount}/${totalCount} documents. Some failed.`, 'info');
        if (onSuccess) onSuccess();
      } else {
        setStatus('error');
        showToast('All uploads failed. Please check your files.', 'error');
      }
    } catch (error) {
      setStatus('error');
      showToast('Batch processing interrupted.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const resetToIdle = () => {
    setStatus('idle');
    setProgress(0);
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[10000] flex justify-center items-center bg-gray-900/80 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      
      <div 
        className="w-full max-w-[560px] bg-white dark:bg-slate-900 rounded-2xl shadow-modal overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        
        <div className="px-8 py-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">Upload Documents</h2>
            <p className="text-sm font-medium text-gray-500 dark:text-slate-400 mt-1">Select one or more files for AI extraction.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-slate-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-transparent"
          >
            <X size={24} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-8">
          
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all mb-6 ${
              isDragging 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]' 
                : 'border-gray-300 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-gray-400 dark:hover:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              accept=".pdf,.png,.jpg,.jpeg"
              title="Click to select documents"
            />
            
            <div className="relative z-0 pointer-events-none flex flex-col items-center">
              <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center mb-4 shadow-sm border border-gray-200 dark:border-slate-700">
                <Upload size={24} className="text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Drop files or <span className="text-blue-600 dark:text-blue-400 underline pointer-events-auto">browse</span>
              </h3>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                Supports PDF, PNG, JPG up to 10MB per file
              </p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="space-y-4">
              <div className="max-h-[240px] overflow-y-auto pr-2 space-y-2">
                {files.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-white dark:bg-slate-700 rounded-lg flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-600 flex-shrink-0">
                        <File size={20} className="text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{f.name}</p>
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">
                          {(f.size / 1024 / 1024).toFixed(2)} MB • {f.type.split('/')[1]?.toUpperCase() || 'FILE'}
                        </p>
                      </div>
                    </div>
                    {!uploading && status === 'idle' && (
                      <button 
                        onClick={() => removeFile(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors border border-transparent"
                        aria-label="Remove file"
                      >
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {uploading || status !== 'idle' ? (
                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-white">
                    <span className="flex items-center gap-2">
                      {status === 'success' ? (
                        <><CheckCircle size={18} className="text-emerald-600"/> All Documents Processed</>
                      ) : status === 'partial' ? (
                        <><AlertCircle size={18} className="text-amber-600"/> {results.success}/{results.total} Succeeded</>
                      ) : status === 'error' ? (
                        <><AlertCircle size={18} className="text-red-600"/> Processing Failed</>
                      ) : (
                        <><Loader2 size={18} className="animate-spin text-blue-600"/> Indexing documents...</>
                      )}
                    </span>
                    <span className="text-gray-500 dark:text-slate-400 font-black">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                       className={`h-full transition-all duration-300 ${
                         status === 'success' ? 'bg-emerald-500' : 
                         status === 'partial' ? 'bg-amber-500' : 
                         status === 'error' ? 'bg-red-500' : 'bg-blue-600'
                       }`}
                       style={{ width: `${progress}%` }}
                    />
                  </div>

                  {(status === 'partial' || status === 'error') && !uploading && (
                    <div className="pt-4 flex flex-col gap-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 italic">
                        {status === 'partial' 
                          ? "Files that failed to upload are still in your list. You can retry or remove them."
                          : "Upload interrupted. Check your network or file compatibility and try again."}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={onClose}
                          className="btn-secondary py-3 text-sm font-black dark:bg-slate-800"
                        >
                          Close Modal
                        </button>
                        <button
                          onClick={resetToIdle}
                          className="btn-primary py-3 text-sm font-black bg-slate-900 dark:bg-blue-600"
                        >
                          Manage Files
                        </button>
                      </div>
                    </div>
                  )}

                  {status === 'success' && (
                    <p className="text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 pt-2 animate-pulse">
                      Closing workspace automatically...
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                  <button
                    onClick={onClose}
                    className="w-full btn-secondary py-3 text-base font-black dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startUpload}
                    className="w-full btn-primary py-3 text-base font-black shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                  >
                    Start Extraction ({files.length})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
