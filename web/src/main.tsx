import './ai/installGuard'; // first: Private mode's network guard wraps fetch before any other module runs
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './App';
import { AccessGate } from './components/AccessGate';


// Offline app shell: after the first online visit InkTally opens and reloads with no connection.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* app still works online */ }); });
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AccessGate>
        <App />
      </AccessGate>
    </BrowserRouter>
  </StrictMode>,
);
