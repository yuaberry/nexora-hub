import { describe, expect, it } from 'vitest';
import { CLOUD_SAVES_UNAVAILABLE_REASON, createNexoraCloudClient, nexoraCloudClient } from '../src/index.js';

describe('cliente de saves na nuvem', () => {
  const client = createNexoraCloudClient();

  it('declara-se indisponível — disponível é sempre false', () => {
    expect(client.status.available).toBe(false);
    expect(client.status.reasonKey).toBe('cloud-saves');
    expect(client.status.reason).toBe(CLOUD_SAVES_UNAVAILABLE_REASON);
  });

  it('não devolve slots', async () => {
    expect(await client.listSlots('minecraft')).toEqual([]);
  });

  it('recusa upload e download com o motivo', async () => {
    const upload = await client.upload('minecraft', 'slot-1', '/tmp/save');
    expect(upload.ok).toBe(false);
    expect(upload.ok === false && upload.reason).toBe(CLOUD_SAVES_UNAVAILABLE_REASON);

    const download = await client.download('minecraft', 'slot-1', '/tmp/save');
    expect(download.ok).toBe(false);
  });

  it('o cliente exportado é o mesmo stub', () => {
    expect(nexoraCloudClient.status.available).toBe(false);
  });
});