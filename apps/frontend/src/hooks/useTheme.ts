import { useState } from 'react';

// Same persistence contract as the index.html bootstrap script and the
// desktop sidebar toggle: 'dark' class on <html> + localStorage 'theme'.
export const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
  );

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('theme', next);
  };

  return { theme, toggleTheme };
};
