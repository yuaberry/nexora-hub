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
  },
});