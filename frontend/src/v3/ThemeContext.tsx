/**
 * V3ThemeProvider — Dark/light theme context for V3 components.
 * Persists theme choice in localStorage.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { V3_DARK, V3_LIGHT, type V3Theme } from './theme';

type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  theme: V3Theme;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: V3_DARK,
  mode: 'dark',
  toggleTheme: () => {},
});

export function V3ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('v3-theme') as ThemeMode) || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = useCallback(() => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('v3-theme', next); } catch { /* noop */ }
      return next;
    });
  }, []);

  const theme = mode === 'dark' ? V3_DARK : V3_LIGHT;

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useV3Theme() {
  return useContext(ThemeContext);
}
