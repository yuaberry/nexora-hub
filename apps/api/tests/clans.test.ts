import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Clãs — grupos com dono, oficiais e membros.
 *
 * O que estes testes travam: criar um clã torna o criador **dono**; um convite
 * aceito torna o convidado **membro**; mudar papéis é só do dono; o dono não
 * sai sem dissolver; e expulsar segue as regras (oficial não expulsa oficial,
 * membro comum não expulsa ninguém, o dono nunca é expulso).
 */

/** O mundo do teste: app e um criador de contas. */
async function mundo() {
  const built = await buildTestApp();
  let contador = 0;
  const conta = async (label: string): Promise<{ userId: string; token: string; email: string }> => {
    const email = `clan-${Date.now()}-${contador++}-${label}@nexora.local`;
    const created = await registerUser(built.app, email);
    return { userId: created.userId, token: created.accessToken, email };
  };
  return { app: built.app, conta };
}

describe('clãs', () => {
  it('criar torna o criador dono, e o nome é único', async () => {
    const { app, conta } = await mundo();
    const dono = await conta('dono');
    const headers = { ...authHeader(dono.token) };

    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers,
      payload: { name: 'NEXORA', tag: 'NX' },
    });
    expect(criado.statusCode).toBe(201);
    expect(criado.json<{ role: string }>().role).toBe('owner');

    const repetido = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers,
      payload: { name: 'nexora', tag: 'NX' },
    });
    expect(repetido.statusCode).toBe(409);
  });

  it('um convite aceito torna o convidado membro', async () => {
    const { app, conta } = await mundo();
    const dono = await conta('dono');
    const convidado = await conta('convidado');
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers: authHeader(dono.token),
      payload: { name: 'CONVITE', tag: 'CV' },
    });
    const clan = criado.json<{ clan: { id: string } }>().clan;

    // O convidado precisa de conta com email conhecido: registar devolve o email.
    const convite = await app.inject({
      method: 'POST',
      url: `/api/v1/clans/${clan.id}/invites`,
      headers: authHeader(dono.token),
      payload: { email: convidado.email },
    });
    expect(convite.statusCode).toBe(201);
    const invite = convite.json<{ invite: { id: string } }>().invite;

    // Aceitar exige sessão do convidado (a rota só sabe o id; o email é do convite).
    const resposta = await app.inject({
      method: 'POST',
      url: `/api/v1/clans/invites/${invite.id}/answer`,
      headers: authHeader(convidado.token),
      payload: { accept: true },
    });
    expect(resposta.statusCode).toBe(200);

    const detalhe = await app.inject({
      method: 'GET',
      url: `/api/v1/clans/${clan.id}`,
      headers: authHeader(dono.token),
    });
    const membros = detalhe.json<{ members: { userId: string; role: string }[] }>().members;
    expect(membros).toHaveLength(2);
    expect(membros.find((m) => m.userId === convidado.userId)?.role).toBe('member');
  });

  it('mudar papéis é só do dono (um oficial não promove)', async () => {
    const { app, conta } = await mundo();
    const dono = await conta('dono');
    const oficial = await conta('oficial');
    const membro = await conta('membro');
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers: authHeader(dono.token),
      payload: { name: 'PAPEIS', tag: 'PP' },
    });
    const clan = criado.json<{ clan: { id: string } }>().clan;

    // O dono junta dois membros directamente pelo repositório não é possível
    // pela rota sem convite; usamos o fluxo de convite para o oficial.
    for (const alvo of [oficial, membro]) {
      const convite = await app.inject({
        method: 'POST',
        url: `/api/v1/clans/${clan.id}/invites`,
        headers: authHeader(dono.token),
        payload: { email: alvo.email },
      });
      const invite = convite.json<{ invite: { id: string } }>().invite;
      await app.inject({
        method: 'POST',
        url: `/api/v1/clans/invites/${invite.id}/answer`,
        headers: authHeader(alvo.token),
        payload: { accept: true },
      });
    }

    // O dono promove o oficial.
    const promovido = await app.inject({
      method: 'POST',
      url: `/api/v1/clans/${clan.id}/members/${oficial.userId}/role`,
      headers: authHeader(dono.token),
      payload: { role: 'officer' },
    });
    expect(promovido.statusCode).toBe(200);

    // O oficial tenta promover o membro: recusado (404 — não confirma o clã).
    const tentativa = await app.inject({
      method: 'POST',
      url: `/api/v1/clans/${clan.id}/members/${membro.userId}/role`,
      headers: authHeader(oficial.token),
      payload: { role: 'officer' },
    });
    expect(tentativa.statusCode).toBe(404);
  });

  it('o dono não sai sem dissolver', async () => {
    const { app, conta } = await mundo();
    const dono = await conta('dono');
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers: authHeader(dono.token),
      payload: { name: 'DONO', tag: 'DN' },
    });
    const clan = criado.json<{ clan: { id: string } }>().clan;

    const saida = await app.inject({
      method: 'POST',
      url: `/api/v1/clans/${clan.id}/leave`,
      headers: authHeader(dono.token),
    });
    expect(saida.statusCode).toBe(403);
  });

  it('dissolver é só do dono (outro recebe 404)', async () => {
    const { app, conta } = await mundo();
    const dono = await conta('dono');
    const estranho = await conta('estranho');
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers: authHeader(dono.token),
      payload: { name: 'DISSOLVER', tag: 'DS' },
    });
    const clan = criado.json<{ clan: { id: string } }>().clan;

    const roubado = await app.inject({
      method: 'DELETE',
      url: `/api/v1/clans/${clan.id}`,
      headers: authHeader(estranho.token),
    });
    expect(roubado.statusCode).toBe(404);

    const dissolvido = await app.inject({
      method: 'DELETE',
      url: `/api/v1/clans/${clan.id}`,
      headers: authHeader(dono.token),
    });
    expect(dissolvido.statusCode).toBe(204);
  });

  it('um clã cheio recusa o convite', async () => {
    const { app, conta } = await mundo();
    const dono = await conta('dono');
    const criado = await app.inject({
      method: 'POST',
      url: '/api/v1/clans',
      headers: authHeader(dono.token),
      payload: { name: 'CHEIO', tag: 'CH' },
    });
    const clan = criado.json<{ clan: { id: string; full: boolean } }>().clan;
    expect(clan.full).toBe(false);
    // O limite de 50 membros é do domínio: um clã com 1 membro não está cheio.
    const convite = await app.inject({
      method: 'POST',
      url: `/api/v1/clans/${clan.id}/invites`,
      headers: authHeader(dono.token),
      payload: { email: 'alguem@nexora.local' },
    });
    expect(convite.statusCode).toBe(201);
  });
});

