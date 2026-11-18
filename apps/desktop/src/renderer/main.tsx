import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './index.css';

/**
 * Ponto de entrada do renderer.
 *
 * O renderer é uma aplicação React servida pelo esquema interno `nexora://`.
 * Não importa nada do Electron: a fronteira é o `window.nexora` exposto pelo
 * preload, tipado em `shared/preload-api.ts`.
 */
const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);