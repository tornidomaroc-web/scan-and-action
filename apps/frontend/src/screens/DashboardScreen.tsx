import React, { useEffect, useState } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { 
  FileText, 
  Clock, 
  Database, 
  Zap,
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

export const DashboardScreen = ({ t }: { t: any }) => {
  const navigate = useNavigate();
  const { refreshCount, onNewScan } = useOutletContext<{ refreshCount: number, onNewScan: () => void }>();
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalCount: 0, pendingCount: 0, averageConfidence: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const statsTask = documentService.getStats().catch(err => {
        console.error('[Dashboard] Stats fetch failed:', err);
        return null;
      });
      const activityTask = documentService.getRecentActivity().catch(err => {
        console.error('[Dashboard] Activity fetch failed:', err);
        return null; 
      });

      const [statsData, activityData] = await Promise.all([statsTask, activityTask]);

      if (statsData) setStats(statsData);
      if (activityData) setRecentActivity(activityData);

      if (!statsData && !activityData) {
        setError('We could not connect to the intelligence server. This might be a temporary connection issue.');
      } else if (!statsData) {
        setError('Intelligence metrics are temporarily unavailable. Your activity data is still visible.');
      } else {
        setError(null);
      }
    } catch (err: any) {
      setError('An unexpected error occurred while loading your dashboard.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [refreshCount]);

  const getConfidenceLevel = (score: number) => {
    const percent = score * 100;
    if (percent >= 90) return { label: 'Excellent', colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-400/10', icon: '✅' };
    if (percent >= 70) return { label: 'Needs Review', colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-400/10', icon: '⚠️' };
    return { label: 'At Risk', colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-400/10', icon: '🚩' };
  };

  const confidenceInfo = getConfidenceLevel(stats.averageConfidence);

  const DashboardSkeleton = () => (
    <div className="animate-in fade-in duration-500 max-w-[1200px] mx-auto">
      <div className="mb-10">
        <div className="h-10 w-64 skeleton rounded-lg mb-3 dark:bg-slate-800" />
        <div className="h-5 w-80 skeleton rounded-md dark:bg-slate-800" />
      </div>
      <div className="grid grid-cols-3 gap-6 mb-12">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-40 skeleton rounded-[32px] dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-5 mb-12">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 skeleton rounded-2xl dark:bg-slate-800" />
        ))}
      </div>
      <div className="grid grid-cols-[3fr_1fr] gap-8">
        <div className="h-96 skeleton rounded-[32px] dark:bg-slate-800" />
        <div className="space-y-6">
          <div className="h-48 skeleton rounded-[32px] dark:bg-slate-800" />
          <div className="h-32 skeleton rounded-[32px] dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );

  if (loading) return <DashboardSkeleton />;

  if (error && !stats.totalCount && recentActivity.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto py-12">
        <ErrorState 
          title="Connection Interrupted"
          message={error}
          onRetry={() => fetchData(true)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="mb-10">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white mb-2">
          Control Center
        </h1>
        <p className="text-lg font-bold text-slate-500 dark:text-slate-400">
          Welcome back. Here is your current data intelligence status.
        </p>
      </header>

      {/* Action Banner */}
      {stats.pendingCount > 0 && (
        <div className="bg-white dark:bg-slate-800 border-l-4 border-amber-500 rounded-2xl p-6 mb-10 flex items-center justify-between shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
          <div className="flex items-center gap-5">
            <div className="bg-amber-50 dark:bg-amber-900/30 p-3 rounded-2xl text-amber-600 dark:text-amber-400">
              <Activity size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white mb-0.5">
                {stats.pendingCount} documents are blocking full automation
              </h3>
              <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                Review these high-priority items now to reach 100% data precision.
              </p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/queue')}
            className="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 whitespace-nowrap"
          >
            Review Now
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {[
          { label: 'Documents Processed', value: stats.totalCount.toLocaleString(), icon: <FileText size={20} />, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
          { label: 'Pending Review', value: stats.pendingCount.toLocaleString(), icon: <Clock size={20} />, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
          { 
            label: 'Avg. Confidence', 
            value: `${(stats.averageConfidence * 100).toFixed(1)}%`, 
            icon: <Zap size={20} />, 
            color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
            badge: (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ml-auto ${confidenceInfo.colorClass}`}>
                <span>{confidenceInfo.icon}</span>
                {confidenceInfo.label}
              </span>
            )
          },
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-[32px] p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700 transition-all hover:translate-y-[-4px] hover:shadow-2xl duration-300">
            <div className="flex items-center gap-3 mb-5">
              <div className={`${stat.color} p-2.5 rounded-xl`}>{stat.icon}</div>
              <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{stat.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">{stat.value}</span>
              {stat.badge}
            </div>
          </div>
        ))}
      </div>

      {/* Workflow Actions */}
      <div className="mb-12">
         <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-5 ml-2 italic">Workflow Actions</h3>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <button onClick={onNewScan} className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all shadow-sm hover:shadow-xl active:scale-95 text-left flex items-center gap-4">
               <div className="bg-blue-600 p-3 rounded-2xl text-white group-hover:scale-110 transition-transform"><FileText size={20} strokeWidth={2.5} /></div>
               <div>
                  <span className="font-black text-slate-900 dark:text-white block">New Scan</span>
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tight">Upload Data</span>
               </div>
            </button>
            <button onClick={() => navigate('/search')} className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-blue-500 transition-all shadow-sm hover:shadow-xl active:scale-95 text-left flex items-center gap-4">
               <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-2xl text-slate-600 dark:text-slate-400 group-hover:bg-blue-500 group-hover:text-white transition-all"><Zap size={20} /></div>
               <div>
                  <span className="font-black text-slate-900 dark:text-white block">Search</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Query AI</span>
               </div>
            </button>
            <button onClick={() => navigate('/queue')} className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-amber-500 transition-all shadow-sm hover:shadow-xl active:scale-95 text-left flex items-center gap-4">
               <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-2xl text-slate-600 dark:text-slate-400 group-hover:bg-amber-500 group-hover:text-white transition-all"><Clock size={20} /></div>
               <div>
                  <span className="font-black text-slate-900 dark:text-white block">Review</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Validate</span>
               </div>
            </button>
            <button 
               onClick={async () => {
                 try {
                   await documentService.exportCsv();
                 } catch (err) {
                   console.error('Export failed:', err);
                   alert('Export failed. Please try again.');
                 }
               }} 
               className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-emerald-500 transition-all shadow-sm hover:shadow-xl active:scale-95 text-left flex items-center gap-4"
            >
               <div className="bg-slate-100 dark:bg-slate-700 p-3 rounded-2xl text-slate-600 dark:text-slate-400 group-hover:bg-emerald-500 group-hover:text-white transition-all"><Database size={20} /></div>
               <div>
                  <span className="font-black text-slate-900 dark:text-white block">Export CSV</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Download Data</span>
               </div>
            </button>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-8">
        {/* Recent Activity */}
        <div className="bg-white dark:bg-slate-800 rounded-[32px] p-8 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <Activity size={22} className="text-blue-500" strokeWidth={2.5} /> 
              Recent Intelligence
            </h2>
            {recentActivity.length > 4 && (
              <button 
                onClick={() => navigate('/activity')}
                className="text-sm font-black text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
              >
                View all activity
              </button>
            )}
          </div>
          
          <div className="space-y-1">
            {recentActivity.length === 0 ? (
              <div className="py-20 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900/50 text-slate-300 rounded-full flex items-center justify-center mb-4">
                  <FileText size={32} />
                </div>
                <p className="font-black text-slate-900 dark:text-white text-lg">Your workspace is quiet.</p>
                <p className="text-slate-500 font-bold mb-6">Upload your first document to begin extraction.</p>
                <button 
                  onClick={onNewScan}
                  className="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-blue-500/10"
                >
                  Start First Scan
                </button>
              </div>
            ) : (
              recentActivity.slice(0, isExpanded ? undefined : 4).map((item, i) => (
                <div key={item.id} 
                  onClick={() => navigate(`/documents/${item.id}`)}
                  className={`group flex items-center justify-between py-4 px-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer ${i !== (isExpanded ? recentActivity.length - 1 : (Math.min(recentActivity.length, 4) - 1)) ? 'border-b border-slate-50 dark:border-slate-700/30' : ''}`}
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

        {/* Intelligence Pulse Sidebar */}
        <div className="space-y-6">
           <div className="bg-white dark:bg-slate-800 rounded-[32px] p-8 border-l-4 border-blue-500 shadow-xl shadow-slate-200/40 dark:shadow-none border border-slate-100 dark:border-slate-700">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-4 opacity-70">Intelligence Pulse</h4>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                You have successfully processed <span className="text-slate-900 dark:text-white font-black">{stats.totalCount}</span> documents in this workspace.
              </p>
              {stats.pendingCount > 0 ? (
                <p className="text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed mb-0">
                   Resolving the remaining <span className="text-amber-500 font-black">{stats.pendingCount}</span> status items will stabilize your accuracy and move you closer to full automation.
                </p>
              ) : stats.totalCount > 0 ? (
                <p className="text-sm font-bold text-slate-600 dark:text-slate-400 leading-relaxed mb-0">
                   All systems are verified. Your workspace is operating at 100% manual review completion.
                </p>
              ) : null}
           </div>
           <div className="bg-slate-900 p-8 rounded-[32px] text-white shadow-2xl shadow-slate-900/20 border border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                 <Zap size={20} className="text-blue-400 fill-blue-400" />
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Power Tip</h4>
              </div>
              <p className="text-sm font-bold text-slate-300 leading-relaxed">
                Did you know? You can query your data in natural language. Try: <span className="text-blue-400 italic">"Show all invoices from last month"</span> in the search bar.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
};
