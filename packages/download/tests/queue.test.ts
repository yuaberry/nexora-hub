import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { DownloadQueue } from '../src/index.js';
import type { DownloadTask } from '../src/index.js';

/**
 * Fila de downloads com servidor real.
 *
 * O que estes testes travam: **prioridade** decide a ordem de início, **pausa**
 * interrompe sem falhar (as partes ficam para retomar), **cancelar** apaga as
 * partes, e uma tarefa concluída fica `completed` **verificada**.
 */

/** Atraso por resposta, para dar tempo de pausar a meio (determinista). */
const DELAY_MS = 200;

/** Tamanho com várias conexões — download que dura o suficiente para pausar. */
const TOTAL = 512 * 1024;

async function startSlowServer(): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createServer(async (request, response) => {
    const range = request.headers['range'] ?? 'bytes=0-';
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match?.[1] === undefined ? 0 : Number(match[1]);
    const end = match?.[2] === undefined || match[2] === '' ? TOTAL - 1 : Number(match[2]);
    const body = Buffer.alloc(end - start + 1, start & 0xff);
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'content-length': String(TOTAL), 'accept-ranges': 'bytes' });
      response.end();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    response.writeHead(206, {
      'content-range': `bytes ${start}-${end}/${TOTAL}`,
      'content-length': String(body.length),
      'accept-ranges': 'bytes',
    });
    response.end(body);
  });
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('servidor sem porta');
  }
  return { server, url: `http://127.0.0.1:${address.port}/lento.bin` };
}

/** Pasta de destino. */
function destDir(): string {
  return mkdtempSync(join(tmpdir(), 'nexora-fila-'));
}

describe('DownloadQueue', () => {
  it('com dois lugares, os dois mais prioritários começam e o terceiro espera', async () => {
    const { server, url } = await startSlowServer();
    const queue = new DownloadQueue();
    const dir = destDir();

    queue.add({ taskId: 'baixa', gameId: 'g', url, destinationPath: join(dir, 'baixa.bin'), priority: 0 });
    queue.add({ taskId: 'media', gameId: 'g', url, destinationPath: join(dir, 'media.bin'), priority: 5 });
    queue.add({ taskId: 'alta', gameId: 'g', url, destinationPath: join(dir, 'alta.bin'), priority: 10 });

    // A fila tem dois lugares: entram as duas mais prioritárias; a terceira fica
    // na fila. A observação é **cedo** (80 ms): o bastante para a bomba
    // arrancar as duas, pouco demais para uma delas terminar (cada resposta
    // do servidor leva 200 ms) — o teste não depende da velocidade da rede.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(queue.get('alta')?.state).not.toBe('queued');
    expect(queue.get('media')?.state).not.toBe('queued');
    expect(queue.get('baixa')?.state).toBe('queued');

    queue.dispose();
    server.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it('conclui e verifica uma tarefa sem deixar partes', async () => {
    const { server, url } = await startSlowServer();
    const queue = new DownloadQueue();
    const dir = destDir();
    const file = join(dir, 'completo.bin');

    queue.add({ taskId: 'completa', gameId: 'g', url, destinationPath: file, priority: 1 });
    const final = await new Promise<DownloadTask | null>((resolve) => {
      queue.on((event) => {
        if (event.task.taskId === 'completa' && event.task.state === 'completed') {
          resolve(event.task);
        }
      });
    });

    expect(final?.state).toBe('completed');
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.part.0`)).toBe(false);
    queue.dispose();
    server.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it('pausa sem falhar e retoma até concluir', async () => {
    const { server, url } = await startSlowServer();
    const queue = new DownloadQueue();
    const dir = destDir();
    const file = join(dir, 'pausa.bin');

    queue.add({ taskId: 'pausavel', gameId: 'g', url, destinationPath: file, priority: 1 });

    // Pausa a meio do download.
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await queue.pause('pausavel')).toBe(true);
    const paused = queue.get('pausavel');
    expect(paused?.state).toBe('paused');
    expect(paused?.error).toBeNull();

    // Retoma e espera o fim.
    expect(await queue.resume('pausavel')).toBe(true);
    const final = await new Promise<DownloadTask | null>((resolve) => {
      queue.on((event) => {
        if (event.task.taskId === 'pausavel' && event.task.state === 'completed') {
          resolve(event.task);
        }
      });
    });
    expect(final?.state).toBe('completed');
    queue.dispose();
    server.close();
    rmSync(dir, { force: true, recursive: true });
  });

  it('cancelar apaga as partes e remove a tarefa', async () => {
    const { server, url } = await startSlowServer();
    const queue = new DownloadQueue();
    const dir = destDir();
    const file = join(dir, 'cancelada.bin');

    queue.add({ taskId: 'cancelavel', gameId: 'g', url, destinationPath: file, priority: 1 });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await queue.cancel('cancelavel')).toBe(true);
    expect(queue.get('cancelavel')).toBeNull();
    expect(existsSync(`${file}.part.0`)).toBe(false);

    queue.dispose();
    server.close();
    rmSync(dir, { force: true, recursive: true });
  });
});