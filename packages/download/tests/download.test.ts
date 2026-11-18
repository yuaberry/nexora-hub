import { describe, expect, it } from 'vitest';
import { TRANSPORT_AVAILABILITY, planChunks, probe } from '../src/index.js';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';

/**
 * Disponibilidade declarada por transporte.
 *
 * O que estes testes travam: **http está implementado** (motor real, provado
 * pelos testes de download) e **torrent continua planeado** — a interface
 * não pode anunciar torrent como disponível antes de existir cliente.
 */
describe('disponibilidade de transportes', () => {
  it('http está disponível e torrent está planeado', () => {
    expect(TRANSPORT_AVAILABILITY.http).toBe('available');
    expect(TRANSPORT_AVAILABILITY.torrent).toBe('planned');
    expect(TRANSPORT_AVAILABILITY.torrentReasonKey).toBe('downloads');
  });
});

describe('planChunks', () => {
  it('divide um total em intervalos contíguos', () => {
    const chunks = planChunks(1000, 4);
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual({ index: 0, start: 0, end: 249 });
    expect(chunks[3]?.end).toBe(999);
    // Contíguos: o fim de um é o início do outro menos um.
    for (let index = 1; index < chunks.length; index += 1) {
      expect(chunks[index]!.start).toBe(chunks[index - 1]!.end + 1);
    }
  });

  it('limita o número de conexões', () => {
    expect(planChunks(1000, 999).length).toBeLessThanOrEqual(16);
    expect(planChunks(1000, 0)).toHaveLength(1);
  });
});

describe('probe', () => {
  let server: Server;
  let url: string;

  const startServer = async (): Promise<void> => {
    server = createServer((request, response) => {
      if (request.method === 'HEAD') {
        response.writeHead(200, {
          'content-length': '300',
          'accept-ranges': 'bytes',
        });
        response.end();
        return;
      }
      const range = request.headers['range'] ?? 'bytes=0-';
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match?.[1] === undefined ? 0 : Number(match[1]);
      const end = match?.[2] === undefined || match[2] === '' ? 299 : Number(match[2]);
      const body = Buffer.alloc(end - start + 1, start);
      response.writeHead(206, {
        'content-range': `bytes ${start}-${end}/300`,
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
    url = `http://127.0.0.1:${address.port}/ficheiro.bin`;
  };

  it('declara tamanho e suporte a intervalos', async () => {
    await startServer();
    const result = await probe(url);
    expect(result.totalBytes).toBe(300);
    expect(result.resumable).toBe(true);
    server.close();
  });
});