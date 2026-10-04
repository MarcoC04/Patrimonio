import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { registerUpdates } from './app/updates';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root non trovato.');

registerUpdates();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
