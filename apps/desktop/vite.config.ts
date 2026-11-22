import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build do renderer do desktop.
 *
 * O renderer é uma aplicação React servida pelo esquema interno `nexora://`.
 * O código do processo principal e do preload é compilado pelo `tsc`
 * (`tsconfig.build.json`); este build cuida apenas da interface.
 */
export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
    // Duas entradas: a aplicação principal e o overlay (a janela por cima do
    // jogo, servida pelo mesmo esquema interno).
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        overlay: resolve(__dirname, 'src/renderer/overlay.html'),
      },
    },
  },
});