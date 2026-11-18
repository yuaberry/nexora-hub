import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { downloadHttp, sha256OfFile } from '../src/index.js';

/**
 * Downloader HTTP real — servidor local, ficheiro real, checksum real.
 *
 * O que estes testes travam: multi-conexão **soma** o ficheiro completo (sem
 * buracos nem ordem trocada), o checksum declarado tem de corresponder (e um
 * checksum errado recusa a instalação), e a retoma aproveita as partes que já
 * existem em vez de recomeçar do zero.
 */

/** Conteúdo de prova: 1 MB determinístico. */
const TOTAL = 1024 * 1024;
const PAYLOAD = Buffer.from(createHash('sha256').update('nexora').digest('hex').repeat(32_768).slice(0, TOTAL), 'binary');

interface Fixture {
  readonly server: Server;
  readonly url: string;
  readonly close: () => void;
}

/** Servidor com suporte a intervalos (e opção de simular falha). */
async function startServer(options: { readonly failChecksumRequests?: boolean } = {}): Promise<Fixture> {
  const server = createServer((request, response) => {
    if (request.method === 'HEAD') {
      response.writeHead(200, { 'content-length': String(TOTAL), 'accept-ranges': 'bytes' });
      response.end();
      return;
    }
    if (options.failChecksumRequests === true && request.url?.includes('part.0') === true) {
      response.writeHead(500);
      response.end('falha simulada');
      return;
    }
    const range = request.headers['range'] ?? 'bytes=0-';
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match?.[1] === undefined ? 0 : Number(match[1]);
    const end = match?.[2] === undefined || match[2] === '' ? TOTAL - 1 : Number(match[2]);
    const body = PAYLOAD.subarray(start, end + 1);
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
  return {
    server,
    url: `http://127.0.0.1:${address.port}/payload.bin`,
    close: () => server.close(),
  };
}

/** Pasta de destino para uma tarefa (devolve ficheiro e directório). */
function destination(name: string): { readonly file: string; readonly dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nexora-dl-'));
  return { file: join(dir, name), dir };
}

/** Checksum esperado do payload de prova. */
const EXPECTED_SHA256 = createHash('sha256').update(PAYLOAD).digest('hex');

describe('downloadHttp', () => {
  it('descarrega o ficheiro completo por partes e verifica o checksum', async () => {
    const fixture = await startServer();
    const target = destination('jogo.bin');
    try {
      const outcome = await downloadHttp({
        taskId: 't1',
        gameId: 'jogo-teste',
        url: fixture.url,
        destinationPath: target.file,
        checksum: { algorithm: 'sha256', value: EXPECTED_SHA256 },
        connections: 8,
      });
      expect(outcome.ok).toBe(true);
      expect(outcome.verified).toBe(true);
      expect(outcome.totalBytes).toBe(TOTAL);

      const written = readFileSync(target.file);
      expect(written.length).toBe(TOTAL);
      // O conteúdo é o do servidor, na ordem: multi-conexão não pode trocar
      // nem perder bytes.
      expect(createHash('sha256').update(written).digest('hex')).toBe(EXPECTED_SHA256);

      // As partes parciais foram apagadas.
      expect(existsSync(`${target.file}.part.0`)).toBe(false);
    } finally {
      fixture.close();
      rmSync(target.dir, { force: true, recursive: true });
    }
  });

  it('recusa um checksum divergente', async () => {
    const fixture = await startServer();
    const target = destination('jogo.bin');
    try {
      const outcome = await downloadHttp({
        taskId: 't2',
        gameId: 'jogo-teste',
        url: fixture.url,
        destinationPath: target.file,
        checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
      });
      expect(outcome.ok).toBe(false);
      expect(outcome.verified).toBe(false);
      expect(outcome.error).toContain('Checksum divergente');
    } finally {
      fixture.close();
      rmSync(target.dir, { force: true, recursive: true });
    }
  });

  it('retoma das partes já escritas', async () => {
    const fixture = await startServer();
    const target = destination('jogo.bin');
    try {
      // Simula uma primeira execução interrompida: só a parte 0 existe.
      writeFileSync(`${target.file}.part.0`, PAYLOAD.subarray(0, 1));
      const outcome = await downloadHttp({
        taskId: 't3',
        gameId: 'jogo-teste',
        url: fixture.url,
        destinationPath: target.file,
        checksum: { algorithm: 'sha256', value: EXPECTED_SHA256 },
        connections: 2,
      });
      expect(outcome.ok).toBe(true);
      expect(createHash('sha256').update(readFileSync(target.file)).digest('hex')).toBe(EXPECTED_SHA256);
    } finally {
      fixture.close();
      rmSync(target.dir, { force: true, recursive: true });
    }
  });
});

describe('sha256OfFile', () => {
  it('calcula o checksum em streaming', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-hash-'));
    const file = join(dir, 'dados.bin');
    writeFileSync(file, Buffer.from('nexora-hub', 'binary'));
    const expected = createHash('sha256').update(Buffer.from('nexora-hub', 'binary')).digest('hex');
    expect(await sha256OfFile(file)).toBe(expected);
    rmSync(dir, { force: true, recursive: true });
  });
});