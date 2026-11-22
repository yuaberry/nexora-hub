import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayApp } from './OverlayApp.js';
import './index.css';

/**
 * Ponto de entrada do overlay.
 *
 * O overlay é uma segunda aplicação React, servida pelo mesmo esquema
 * interno, que mostra as **medidas reais** do sistema enquanto o jogo corre.
 * Não importa nada do Electron: os dados chegam por `overlay:data`, empurrados
 * pelo processo principal.
 */
const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(container).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>,
);