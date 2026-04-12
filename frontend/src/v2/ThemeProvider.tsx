import { useState, useCallback, type ReactNode } from 'react';
import { ThemeContext, themes, type ThemeName } from './theme';

export function V2ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    try {
      return (localStorage.getItem('v2-theme') as ThemeName) || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = useCallback(() => {
    setThemeName(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('v2-theme', next);
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: themes[themeName], themeName, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
