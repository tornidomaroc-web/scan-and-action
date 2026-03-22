import React, { useState, useRef } from 'react';
import { SearchScreen } from './screens/SearchScreen';
import { DocumentDetailScreen } from './screens/DocumentDetailScreen';
import { ReviewQueueScreen } from './screens/ReviewQueueScreen';
import { uploadDocument } from './services/uploadService';

function App() {
  const [language, setLanguage] = useState<'en' | 'fr' | 'ar'>('en');
  const [currentView, setCurrentView] = useState<'SEARCH' | 'REVIEW' | 'DOCUMENT'>('SEARCH');
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'success' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(null);

    try {
      await uploadDocument(file);
      setUploadStatus('success');
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setTimeout(() => setUploadStatus(null), 3000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const isRTL = language === 'ar';

  const strings = {
    en: {
      header: 'Scan & Action',
      search: 'Ask a question...',
      upload: 'Upload Receipt',
      uploading: 'Uploading...',
      uploadSuccess: 'Success!',
      uploadError: 'Error!',
      queue: 'Review Queue',
      reports: 'Smart Reports',
      examples: 'Try asking',
      ex1: 'Total expenses this month',
      ex2: 'List my receipts',
      ex3: 'Group expenses by category',
      ex4: 'Who paid for ?',
      loading: 'Querying Knowledge Base',
      clarifyFailed: 'Please clarify your filters.',
      rep1: 'Monthly Expenses',
      repDesc1: 'Grouped via category',
      rep2: 'Recent Business Cards',
      repDesc2: 'Contacts processed this week',
      rep3: 'Upcoming Appointments',
      repDesc3: 'Scheduled entries',
      back: 'Back to Search',
      resultsFound: 'results retrieved',
      msSpeed: 'ms',
      chartRendered: 'Chart mapped in',
      noData: 'Zero entries mapped to this query.',
      errorTitle: 'Data Retrieval Error',
      loadingDoc: 'Loading Document...',
      docNotFound: 'Document not found.',
      backToSearch: '← Back',
      status: 'Status',
      type: 'Type',
      date: 'Date',
      docLanguage: 'Language',
      extractedFacts: 'Extracted Facts',
      noFacts: 'No facts extracted.',
      relatedEntities: 'Related Entities',
      noEntities: 'No entities detected.',
      loadingQueue: 'Loading Queue...',
      reviewTitle: 'Review Queue',
      reviewDesc:
        'Documents scored below 80% confidence or forcibly marked "NEEDS_REVIEW" by the parsing engine.',
      queueEmpty: 'Queue is empty.',
      allCaughtUp: 'All caught up! No documents pending review.',
    },
    fr: {
      header: 'Scanner et Agir',
      search: 'Posez une question...',
      upload: 'Télécharger le Reçu',
      uploading: 'Téléchargement...',
      uploadSuccess: 'Succès !',
      uploadError: 'Erreur !',
      queue: "File d'Attente",
      reports: 'Rapports Intelligents',
      examples: 'Essayez',
      ex1: 'Dépenses totales ce mois',
      ex2: 'Liste de mes reçus',
      ex3: 'Grouper les dépenses',
      ex4: 'Qui a payé ?',
      loading: 'Requête en cours',
      clarifyFailed: 'Veuillez clarifier vos filtres.',
      rep1: 'Dépenses Mensuelles',
      repDesc1: 'Groupées par catégorie',
      rep2: 'Cartes Visite',
      repDesc2: 'Contacts traités cette semaine',
      rep3: 'Rendez-vous à venir',
      repDesc3: 'Horaires enregistrés',
      back: 'Retour',
      resultsFound: 'résultats récupérés',
      msSpeed: 'ms',
      chartRendered: 'Graphique généré en',
      noData: 'Zéro entrée trouvée.',
      errorTitle: 'Erreur de Récupération',
      loadingDoc: 'Chargement du document...',
      docNotFound: 'Document introuvable.',
      backToSearch: '← Retour',
      status: 'Statut',
      type: 'Type',
      date: 'Date',
      docLanguage: 'Langue',
      extractedFacts: 'Faits Extraits',
      noFacts: 'Aucun fait extrait.',
      relatedEntities: 'Entités Reliées',
      noEntities: 'Aucune entité détectée.',
      loadingQueue: "Chargement de la file...",
      reviewTitle: "File d'Attente",
      reviewDesc: 'Documents avec une confiance < 80% ou marqués "NEEDS_REVIEW".',
      queueEmpty: "La file d'attente est vide.",
      allCaughtUp: 'Tout est à jour ! Aucun document en attente.',
    },
    ar: {
      header: 'المسح والإجراء',
      search: 'اسأل سؤالاً...',
      upload: 'رفع إيصال',
      uploading: 'جارٍ الرفع...',
      uploadSuccess: 'تم بنجاح!',
      uploadError: 'حدث خطأ!',
      queue: 'قائمة المراجعة',
      reports: 'التقارير الذكية',
      examples: 'جرب أن تسأل',
      ex1: 'إجمالي النفقات هذا الشهر',
      ex2: 'سرد إيصالاتي',
      ex3: 'تجميع النفقات حسب الفئة',
      ex4: 'من دفع لـ ؟',
      loading: 'جاري الاستعلام',
      clarifyFailed: 'يرجى توضيح عوامل التصفية الخاصة بك.',
      rep1: 'المصاريف الشهرية',
      repDesc1: 'مجمعة حسب الفئة',
      rep2: 'بطاقات العمل',
      repDesc2: 'جهات الاتصال التي تمت معالجتها',
      rep3: 'المواعيد القادمة',
      repDesc3: 'إدخالات مجدولة',
      back: 'عودة للبحث',
      resultsFound: 'نتائج تم استردادها',
      msSpeed: 'ملي ثانية',
      chartRendered: 'تم إنشاء الرسم البياني في',
      noData: 'لا توجد إدخالات تطابق هذا الاستعلام.',
      errorTitle: 'خطأ في استرجاع البيانات',
      loadingDoc: 'جاري تحميل المستند...',
      docNotFound: 'المستند غير موجود.',
      backToSearch: '← عودة',
      status: 'الحالة',
      type: 'النوع',
      date: 'التاريخ',
      docLanguage: 'اللغة',
      extractedFacts: 'الحقائق المستخرجة',
      noFacts: 'لم يتم استخراج حقائق.',
      relatedEntities: 'الكيانات ذات الصلة',
      noEntities: 'لم يتم اكتشاف كيانات.',
      loadingQueue: 'جاري تحميل قائمة المراجعة...',
      reviewTitle: 'قائمة المراجعة',
      reviewDesc: 'المستندات التي يقل مستوى الثقة فيها عن 80٪ أو تتطلب المراجعة اليدوية.',
      queueEmpty: 'القائمة فارغة.',
      allCaughtUp: 'كل شيء جاهز! لا توجد مستندات معلقة للمراجعة.',
    },
  };

  const t = strings[language];

  const navigateToDoc = (id: string) => {
    setActiveDocId(id);
    setCurrentView('DOCUMENT');
  };

  return (
    <div className={`app-container ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      <header className="app-header">
        <div className="logo cursor-pointer" onClick={() => setCurrentView('SEARCH')}>
          {t.header}
        </div>

        <nav className="header-nav">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            style={{ display: 'none' }}
            accept=".pdf,.png,.jpg,.jpeg"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={
              uploadStatus === 'success'
                ? { backgroundColor: '#10b981', color: 'white' }
                : uploadStatus === 'error'
                  ? { backgroundColor: '#ef4444', color: 'white' }
                  : {}
            }
          >
            {isUploading
              ? t.uploading
              : uploadStatus === 'success'
                ? t.uploadSuccess
                : uploadStatus === 'error'
                  ? t.uploadError
                  : t.upload}
          </button>

          <button
            onClick={() => setCurrentView('REVIEW')}
            className={currentView === 'REVIEW' ? 'active' : ''}
          >
            {t.queue}
          </button>

          <button
            onClick={() => setCurrentView('SEARCH')}
            className={currentView === 'SEARCH' ? 'active' : ''}
          >
            {t.reports}
          </button>
        </nav>

        <div className="lang-selector">
          <select value={language} onChange={(e) => setLanguage(e.target.value as 'en' | 'fr' | 'ar')}>
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </header>

      <main className="main-content">
        {currentView === 'SEARCH' && (
          <SearchScreen t={t} rtl={isRTL} currentLanguage={language} />
        )}

        {currentView === 'DOCUMENT' && activeDocId && (
          <DocumentDetailScreen
            t={t}
            documentId={activeDocId}
            onBack={() => setCurrentView('SEARCH')}
          />
        )}

        {currentView === 'REVIEW' && (
          <ReviewQueueScreen t={t} onOpenDoc={navigateToDoc} />
        )}
      </main>
    </div>
  );
}

export default App;