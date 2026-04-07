import { strings } from './strings';
import { useLanguage } from './LanguageContext';

export const useStrings = () => {
  const { language } = useLanguage();
  return strings[language as keyof typeof strings];
};

export default useStrings;
