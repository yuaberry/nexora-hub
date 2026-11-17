import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import './index.css';

/**
 * Ponto de entrada da web.
 *
 * `StrictMode` duplica os efeitos em desenvolvimento — é assim que se apanham
 * os efeitos que não são idempotentes.
 */
const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);