import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Configuração do build da web.
 *
 * A interface consome a **mesma** API que o desktop: `/api` é reencaminhado
 * para a API local (omissão `http://127.0.0.1:3100`), que é o mesmo endereço
 * que o esquema `nexora://` usa no desktop — não há uma rota "de web".
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: process.env['NEXORA_API_URL'] ?? 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env['NEXORA_API_URL'] ?? 'http://127.0.0.1:3100',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});