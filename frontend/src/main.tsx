import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { V2App } from './v2/V2App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './auth'

function Root() {
  const [version, setVersion] = useState<'v1' | 'v2'>(() => {
    try { return (localStorage.getItem('ui-version') as 'v1' | 'v2') || 'v1'; } catch { return 'v1'; }
  });
  const handleVersionChange = (v: 'v1' | 'v2') => {
    try { localStorage.setItem('ui-version', v); } catch {}
    setVersion(v);
  };
  return (
    <StrictMode>
      <AuthProvider>
        <ErrorBoundary>
          {version === 'v2' ? <V2App version={version} onVersionChange={handleVersionChange} /> : <App />}
        </ErrorBoundary>
      </AuthProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
