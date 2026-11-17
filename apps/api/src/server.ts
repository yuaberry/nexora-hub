import { DEFAULT_HOST, DEFAULT_PORT, loadEnv } from './config/env.js';
import { buildApp } from './app.js';
import { attachGateway } from './gateway/socket.js';

/**
 * Servidor HTTP.
 *
 * O gateway de tempo real (Socket.IO) sobe sobre o **mesmo** servidor HTTP —
 * não há um segundo processo nem um segundo certificado. O caminho `/ws` é o
 * único ponto de entrada do *socket*.
 */
export async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const env = loadEnv();
  const app = await buildApp({ env });

  const host = env.HOST ?? DEFAULT_HOST;
  const port = env.PORT ?? DEFAULT_PORT;

  await app.listen({ host, port });
  const server = app.server;
  const gateway = attachGateway(server, env.CORS_ORIGIN);

  const url = `http://${host}:${port}`;
  app.log.info(`API do NEXORA HUB em ${url}`);

  return {
    url,
    close: async () => {
      await gateway.close();
      await app.close();
    },
  };
}

/**
 * Ponto de entrada directo (`node dist/server.js`).
 *
 * O ponto de entrada do pacote é o `index.ts`, que chama `startServer()`;
 * este guardServe para correr o servidor a partir do ficheiro compilado.
 */
if (process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error: unknown) => {
    console.error('[nexora-hub] falha ao arrancar a API', error);
    process.exit(1);
  });
}