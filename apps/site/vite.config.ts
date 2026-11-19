import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build do site.
 *
 * Site estático (sem SSR): build em `dist/`, publicável em Cloudflare Pages ou
 * GitHub Pages. O esquema interno `nexora://` do desktop não se aplica aqui —
 * o site é web pura.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
