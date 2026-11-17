import type { FastifyInstance } from 'fastify';
import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { GatewayEvent } from '@nexora/protocol';

/**
 * Gateway de tempo real (Socket.IO) — **esqueleto**.
 *
 * O servidor sobe e o envelope de eventos existe (`gatewayEvent`), para que a
 * web e o desktop os usem sem divergir. Nenhum evento de jogo é emitido:
 * presença por heartbeat é tipo, não implementação (ver
 * `packages/protocol/src/planned.ts`).
 */
export interface GatewayHandle {
  readonly io: SocketServer;
  close: () => Promise<void>;
}

/** Sobe o gateway sobre o servidor HTTP existente. */
export function attachGateway(httpServer: HttpServer, corsOrigin: string | undefined): GatewayHandle {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigin ?? true,
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  io.on('connection', (socket) => {
    const event: GatewayEvent<{ socketId: string }> = {
      type: 'connected',
      payload: { socketId: socket.id },
      at: new Date().toISOString(),
      userId: null,
    };
    socket.emit('gateway', event);
  });

  return {
    io,
    close: async () => {
      await io.close();
    },
  };
}

/** Rota de diagnóstico do gateway (o contrato existe; os eventos, não). */
export function registerGatewayRoutes(app: FastifyInstance): void {
  app.get('/api/v1/realtime/status', async (_request, reply) => {
    return reply.code(200).send({
      realtime: {
        status: 'planned',
        reasonKey: 'presence',
        reason: 'Presença por heartbeat: só os tipos existem nesta fase.',
      },
    });
  });
}