import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { V2App } from './v2/V2App.tsx'
import { V3App } from './v3/V3App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './auth'

type UIVersion = 'v1' | 'v2' | 'v3';

function Root() {
  const [version, setVersion] = useState<UIVersion>(() => {
    try { return (localStorage.getItem('ui-version') as UIVersion) || 'v1'; } catch { return 'v1'; }
  });
  const handleVersionChange = (v: UIVersion) => {
    try { localStorage.setItem('ui-version', v); } catch {}
    setVersion(v);
  };
  return (
    <StrictMode>
      <AuthProvider>
        <ErrorBoundary>
          {version === 'v3' ? <V3App version={version} onVersionChange={handleVersionChange} /> : version === 'v2' ? <V2App version={version} onVersionChange={handleVersionChange} /> : <App />}
        </ErrorBoundary>
      </AuthProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
