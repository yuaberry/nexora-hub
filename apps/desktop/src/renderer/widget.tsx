import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WidgetApp } from './WidgetApp.js';
import './index.css';
import './widget.css';

/** Ponto de entrada do widget (a janela sempre ao topo). */
const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(container).render(
  <StrictMode>
    <WidgetApp />
  </StrictMode>,
);
