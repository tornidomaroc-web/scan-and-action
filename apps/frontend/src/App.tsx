import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SearchScreen } from './screens/SearchScreen';
import { DocumentDetailScreen } from './screens/DocumentDetailScreen';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AuthScreen } from './screens/AuthScreen';
import { Layout } from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { strings } from './i18n/strings';
import { ToastProvider } from './contexts/ToastContext';

function App() {
  const { user } = useAuth();
  const [language, setLanguage] = useState<'en' | 'fr' | 'ar'>('en');

  const t = strings[language];
  const isRTL = language === 'ar';

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className={isRTL ? 'rtl' : 'ltr'} dir={isRTL ? 'rtl' : 'ltr'}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardScreen t={t} />} />
              <Route path="search" element={<SearchScreen t={t} rtl={isRTL} currentLanguage={language} />} />
              <Route path="queue" element={<ReviewQueueScreen t={t} />} />
              <Route path="profile" element={<ProfileScreen />} />
              <Route path="documents/:id" element={<DocumentDetailScreen t={t} />} />
              <Route path="settings" element={<div className="p-8"><h1 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Settings</h1><p className="text-slate-500 dark:text-slate-400 font-bold text-lg">Organization and profile settings coming soon.</p></div>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;