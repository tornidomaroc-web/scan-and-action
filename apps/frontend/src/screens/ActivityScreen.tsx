import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ArrowLeft,
  Activity,
  Loader2
} from 'lucide-react';
import { documentService } from '../services/documentService';
import { ErrorState } from '../components/ErrorState';

const formatDate = (dateString: string) => {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  }).format(date);
};

export const ActivityScreen = ({ t }: { t: any }) => {
  const navigate = useNavigate();
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const data = await documentService.getAllActivity();
      setActivity(data);
      setError(null);
    } catch (err: any) {
      console.error('[Activity] Fetch failed:', err);
      setError('Failed to load activity history. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={40} />
        <p className="text-slate-500 font-bold">Loading activity history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1200px] mx-auto py-12">
        <ErrorState 
          title="Intelligence Error"
          message={error}
          onRetry={fetchActivity}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <button 
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-500 hover:text-blue-500 font-bold mb-4 transition-colors group"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
            Back to Control Center
          </button>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
            Activity History
          </h1>
          <p className="text-lg font-bold text-slate-500 dark:text-slate-400">
            Comprehensive audit of your document extractions (v1: Top 100).
          </p>
        </div>
      </header>

      <div className="bg-white dark:bg-slate-800 rounded-[32px] p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-50 dark:border-slate-700/30">
          <Activity size={22} className="text-blue-500" strokeWidth={2.5} /> 
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            Historical Intelligence
          </h2>
          <span className="ml-auto px-3 py-1 bg-slate-100 dark:bg-slate-700 rounded-full text-[10px] font-black uppercase text-slate-500 tracking-wider">
            {activity.length} Records
          </span>
        </div>
        
        <div className="space-y-1">
          {activity.length === 0 ? (
            <div className="py-20 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 text-slate-300 rounded-full flex items-center justify-center mb-4">
                <FileText size={32} />
              </div>
              <p className="font-black text-slate-900 dark:text-white text-lg">No activity recorded yet.</p>
              <p className="text-slate-500 font-bold">Your processed documents will appear here.</p>
            </div>
          ) : (
            activity.map((item, i) => (
              <div key={item.id} 
                onClick={() => navigate(`/documents/${item.id}`)}
                className={`group flex items-center justify-between py-4 px-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer ${i !== activity.length - 1 ? 'border-b border-slate-50 dark:border-slate-700/30' : ''}`}
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 text-slate-400 group-hover:bg-white dark:group-hover:bg-slate-800 rounded-xl flex items-center justify-center border border-slate-100 dark:border-slate-800 group-hover:scale-110 transition-all duration-300">
                    <FileText size={20} strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 dark:text-slate-100 text-base mb-0.5 group-hover:text-blue-600 transition-colors uppercase tracking-tight">{item.originalFileName || 'Unnamed Document'}</p>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest italic leading-none">
                      {formatDate(item.uploadedAt)}
                    </p>
                  </div>
                </div>
                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border ${
                  item.status === 'COMPLETED' 
                    ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800' 
                    : item.status === 'NEEDS_REVIEW' 
                    ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800' 
                    : 'text-slate-400 bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800'
                }`}>
                  {item.status.replace('_', ' ')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
