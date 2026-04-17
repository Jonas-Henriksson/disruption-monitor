import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { V3App } from './v3/V3App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './auth'

function Root() {
  return (
    <StrictMode>
      <AuthProvider>
        <ErrorBoundary>
          <V3App version="v3" onVersionChange={() => {}} />
        </ErrorBoundary>
      </AuthProvider>
    </StrictMode>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
