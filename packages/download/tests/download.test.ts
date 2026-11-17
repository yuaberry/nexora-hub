import { describe, expect, it } from 'vitest';
import { createDownloadEngine } from '../src/index.js';

describe('motor de downloads', () => {
  const engine = createDownloadEngine();

  it('declara-se planeado, nunca disponível', () => {
    expect(engine.availability.status).toBe('planned');
    expect(engine.availability.reason).toContain('só a interface');
  });

  it('recusa iniciar uma tarefa', async () => {
    const result = await engine.start({ gameId: 'minecraft', destinationPath: '/jogos' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reasonKey).toBe('downloads');
  });

  it('cancelar não devolve sucesso quando não há tarefa', async () => {
    expect(await engine.cancel('tarefa-inexistente')).toBe(false);
  });
});