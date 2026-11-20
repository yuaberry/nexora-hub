import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';
import type { Repositories } from '../src/repositories/types.js';

/**
 * Família — grupo com limite de plano e biblioteca partilhada.
 *
 * O que estes testes travam: o limite do plano é aplicado no **servidor**
 * (o grupo livre enche em dois, e o convite que não cabe recusa com 409),
 * convite não cria conta (email sem conta recusa com 404), quem aceita não
 * pode já estar noutro grupo, e a biblioteca partilhada junta sem duplicar.
 *
 * Todos os utilizadores partilham **uma** aplicação: é a mesma base em
 * memória, como seria a mesma base PostgreSQL.
 */

/** App e repositórios partilhados por todos os utilizadores do teste. */
interface World {
  readonly app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  readonly repositories: Awaited<ReturnType<typeof buildTestApp>>['repositories'];
}

/** Um utilizador registado no mundo partilhado. */
interface Member {
  readonly userId: string;
  readonly accessToken: string;
  readonly email: string;
}

/** Cria o mundo com um contador de emails únicos por execução. */
async function world(): Promise<World & { nextEmail: (label: string) => string }> {
  const built = await buildTestApp();
  const stamp = Date.now();
  let counter = 0;
  return {
    ...built,
    nextEmail: (label: string) => `familia-${stamp}-${counter++}-${label}@nexora.local`,
  };
}

/** Regista um membro no mundo. */
async function join(w: World & { nextEmail: (label: string) => string }, label: string): Promise<Member> {
  return registerUser(w.app, w.nextEmail(label));
}

/** Vista do grupo devolvida pela API. */
interface FamilyView {
  id: string;
  name: string;
  ownerId: string;
  plan: { id: string; maxMembers: number | null; remainingSlots: number | null };
  members: { userId: string; displayName: string | null; role: string }[];
  invites: { id: string; email: string; code: string; status: string }[];
}

type App = Awaited<ReturnType<typeof buildTestApp>>['app'];

/** Lê o grupo da pessoa. */
async function getFamily(app: App, token: string): Promise<{ status: number; group: FamilyView | null }> {
  const response = await app.inject({ method: 'GET', url: '/api/v1/family', headers: authHeader(token) });
  const body = response.json() as { group: FamilyView | null };
  return { status: response.statusCode, group: body.group };
}

/** Cria o grupo. */
async function createGroup(app: App, token: string, name = 'Família Teste'): Promise<{ status: number; group: FamilyView | null }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/family',
    payload: { name },
    headers: authHeader(token),
  });
  const body = response.json() as { group: FamilyView | null };
  return { status: response.statusCode, group: body.group };
}

/** Convida um email. */
async function invite(app: App, token: string, email: string): Promise<{ status: number; code: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/family/invites',
    payload: { email },
    headers: authHeader(token),
  });
  const body = response.json() as { code: string };
  return { status: response.statusCode, code: body.code };
}

/** Aceita um convite pelo código. */
async function accept(app: App, token: string, code: string): Promise<{ status: number; group: FamilyView | null }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/family/invites/accept',
    payload: { code },
    headers: authHeader(token),
  });
  const body = response.json() as { group: FamilyView | null };
  return { status: response.statusCode, group: body.group };
}

/** Semeia uma entrada de biblioteca para um utilizador. */
async function seedLibrary(repositories: Repositories, userId: string, externalKey: string, title: string): Promise<void> {
  await repositories.library.upsertEntry({ userId, externalKey, title });
}

describe('GET /api/v1/family', () => {
  it('exige sessão', async () => {
    const w = await world();
    const response = await w.app.inject({ method: 'GET', url: '/api/v1/family' });
    expect(response.statusCode).toBe(401);
  });

  it('sem grupo devolve null (a página explica o que falta)', async () => {
    const w = await world();
    const member = await join(w, 'sem-grupo');
    const result = await getFamily(w.app, member.accessToken);
    expect(result.status).toBe(200);
    expect(result.group).toBeNull();
  });
});

describe('POST /api/v1/family', () => {
  it('cria o grupo com o dono como membro e o limite do plano', async () => {
    const w = await world();
    const member = await join(w, 'dono');
    const result = await createGroup(w.app, member.accessToken, 'Família do Dono');
    expect(result.status).toBe(201);
    expect(result.group?.name).toBe('Família do Dono');
    expect(result.group?.ownerId).toBe(member.userId);
    expect(result.group?.members).toHaveLength(1);
    expect(result.group?.members[0]?.role).toBe('owner');
    // Limite do plano livre: dois membros, um lugar livre.
    expect(result.group?.plan.id).toBe('free');
    expect(result.group?.plan.maxMembers).toBe(2);
    expect(result.group?.plan.remainingSlots).toBe(1);
  });

  it('recusa um segundo grupo para o mesmo dono (409)', async () => {
    const w = await world();
    const member = await join(w, 'dono2');
    await createGroup(w.app, member.accessToken);
    const second = await createGroup(w.app, member.accessToken);
    expect(second.status).toBe(409);
  });

  it('nome inválido devolve 400', async () => {
    const w = await world();
    const member = await join(w, 'nome');
    for (const name of ['', 'a', 'x'.repeat(41)]) {
      const response = await w.app.inject({
        method: 'POST',
        url: '/api/v1/family',
        payload: { name },
        headers: authHeader(member.accessToken),
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it('plano premium declara seis lugares', async () => {
    const w = await world();
    const member = await join(w, 'premium');
    await w.repositories.users.setPlan(member.userId, 'premium');
    const result = await createGroup(w.app, member.accessToken);
    expect(result.group?.plan.id).toBe('premium');
    expect(result.group?.plan.maxMembers).toBe(6);
    expect(result.group?.plan.remainingSlots).toBe(5);
  });
});

describe('convites', () => {
  it('convida um email com conta e devolve o código', async () => {
    const w = await world();
    const owner = await join(w, 'convida');
    const guest = await join(w, 'convidado');
    await createGroup(w.app, owner.accessToken);
    const result = await invite(w.app, owner.accessToken, guest.email);
    expect(result.status).toBe(201);
    expect(result.code).toHaveLength(10);
  });

  it('email sem conta recusa com 404 (o convite não cria conta)', async () => {
    const w = await world();
    const owner = await join(w, 'convida404');
    await createGroup(w.app, owner.accessToken);
    const result = await invite(w.app, owner.accessToken, w.nextEmail('nao-existe'));
    expect(result.status).toBe(404);
  });

  it('convite pendente ocupa um lugar (limite aplicado antes de aceitar)', async () => {
    const w = await world();
    const owner = await join(w, 'ocupado');
    const guest = await join(w, 'ocupado-convidado');
    const another = await join(w, 'ocupado-outro');
    await createGroup(w.app, owner.accessToken);
    expect((await invite(w.app, owner.accessToken, guest.email)).status).toBe(201);
    // Grupo livre (dono + convite pendente = dois lugares): o segundo
    // convite não cabe, e é recusado com 409.
    const second = await invite(w.app, owner.accessToken, another.email);
    expect(second.status).toBe(409);
  });

  it('limite do plano recusa o convite que não cabe (grupo cheio)', async () => {
    const w = await world();
    const owner = await join(w, 'cheio');
    const first = await join(w, 'cheio1');
    const second = await join(w, 'cheio2');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, first.email)).code;
    expect((await accept(w.app, first.accessToken, code)).status).toBe(200);
    // Grupo livre com dois membros: qualquer novo convite recusa.
    const refused = await invite(w.app, owner.accessToken, second.email);
    expect(refused.status).toBe(409);
  });

  it('o aceite liberta o lugar do convite pendente', async () => {
    const w = await world();
    const owner = await join(w, 'liberta');
    const first = await join(w, 'liberta1');
    const second = await join(w, 'liberta2');
    await w.repositories.users.setPlan(owner.userId, 'premium');
    await createGroup(w.app, owner.accessToken);
    const codeOne = (await invite(w.app, owner.accessToken, first.email)).code;
    expect((await accept(w.app, first.accessToken, codeOne)).status).toBe(200);
    // Um convite pendente num grupo com um lugar livre: cabe.
    const codeTwo = (await invite(w.app, owner.accessToken, second.email)).code;
    expect(codeTwo).toHaveLength(10);
    expect((await accept(w.app, second.accessToken, codeTwo)).status).toBe(200);
    expect((await getFamily(w.app, owner.accessToken)).group?.members).toHaveLength(3);
  });
});

describe('aceitar convite', () => {
  it('aceite entra o membro e liberta o lugar do convite', async () => {
    const w = await world();
    const owner = await join(w, 'aceita-dono');
    const guest = await join(w, 'aceita-convidado');
    await createGroup(w.app, owner.accessToken, 'Família Aceite');
    const code = (await invite(w.app, owner.accessToken, guest.email)).code;
    const result = await accept(w.app, guest.accessToken, code);
    expect(result.status).toBe(200);
    expect(result.group?.members).toHaveLength(2);
    expect(result.group?.members[1]?.userId).toBe(guest.userId);
    // O convite aceite deixa de contar: sobra zero neste grupo livre.
    expect(result.group?.plan.remainingSlots).toBe(0);
    expect(result.group?.invites[0]?.status).toBe('accepted');
  });

  it('código inexistente recusa com 404', async () => {
    const w = await world();
    const member = await join(w, 'codigo');
    const result = await accept(w.app, member.accessToken, 'NAOEXISTE99');
    expect(result.status).toBe(404);
  });

  it('quem já está num grupo não entra noutro (409)', async () => {
    const w = await world();
    const owner = await join(w, 'outro-dono');
    const stranger = await join(w, 'outro-estranho');
    await w.repositories.users.setPlan(owner.userId, 'premium');
    await createGroup(w.app, owner.accessToken);
    // O convite sai **antes** de o estranho criar o seu grupo (a corrida
    // real: um convite aceite depois de a pessoa já ter entrado noutro).
    const code = (await invite(w.app, owner.accessToken, stranger.email)).code;
    expect(code).toHaveLength(10);
    await createGroup(w.app, stranger.accessToken, 'Grupo do Estranho');
    const refused = await accept(w.app, stranger.accessToken, code);
    expect(refused.status).toBe(409);
  });

  it('convite expirado não entra por ninguém e fica marcado', async () => {
    const w = await world();
    const owner = await join(w, 'expira-dono');
    const guest = await join(w, 'expira-convidado');
    const group = await createGroup(w.app, owner.accessToken);
    // Convite semeado com validade no passado (o código é conhecido).
    await w.repositories.family.createInvite({
      id: `invite-${Date.now()}`,
      groupId: group.group?.id ?? '',
      code: 'EXPIRADO01',
      email: guest.email,
      invitedBy: owner.userId,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    const result = await accept(w.app, guest.accessToken, 'EXPIRADO01');
    expect(result.status).toBe(400);
    // E fica marcado como expirado, não pendente para sempre.
    const family = await getFamily(w.app, owner.accessToken);
    expect(family.group?.invites.find((item) => item.code === 'EXPIRADO01')?.status).toBe('expired');
    // O lugar que o convite ocupava volta a estar livre.
    expect(family.group?.plan.remainingSlots).toBe(1);
  });

  it('recusar marca o convite sem acrescentar membro', async () => {
    const w = await world();
    const owner = await join(w, 'recusa-dono');
    const guest = await join(w, 'recusa-convidado');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, guest.email)).code;
    const response = await w.app.inject({
      method: 'POST',
      url: '/api/v1/family/invites/decline',
      payload: { code },
      headers: authHeader(guest.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const family = await getFamily(w.app, owner.accessToken);
    expect(family.group?.members).toHaveLength(1);
    expect(family.group?.invites[0]?.status).toBe('declined');
    // Recusar liberta o lugar: um novo convite passa a caber.
    expect((await invite(w.app, owner.accessToken, guest.email)).status).toBe(201);
  });

  it('recusar o convite de outra pessoa devolve 404', async () => {
    const w = await world();
    const owner = await join(w, 'recusa-outro-dono');
    const guest = await join(w, 'recusa-outro-convidado');
    const stranger = await join(w, 'recusa-outro-estranho');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, guest.email)).code;
    const response = await w.app.inject({
      method: 'POST',
      url: '/api/v1/family/invites/decline',
      payload: { code },
      headers: authHeader(stranger.accessToken),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('membros e dissolução', () => {
  it('membro comum não remove outro (403)', async () => {
    const w = await world();
    const owner = await join(w, 'r403-dono');
    const member = await join(w, 'r403-membro');
    const other = await join(w, 'r403-outro');
    await w.repositories.users.setPlan(owner.userId, 'premium');
    await createGroup(w.app, owner.accessToken);
    const first = (await invite(w.app, owner.accessToken, member.email)).code;
    expect((await accept(w.app, member.accessToken, first)).status).toBe(200);
    const second = (await invite(w.app, owner.accessToken, other.email)).code;
    expect((await accept(w.app, other.accessToken, second)).status).toBe(200);
    const response = await w.app.inject({
      method: 'DELETE',
      url: `/api/v1/family/members/${other.userId}`,
      headers: authHeader(member.accessToken),
    });
    expect(response.statusCode).toBe(403);
  });

  it('dono remove um membro (204)', async () => {
    const w = await world();
    const owner = await join(w, 'remove-dono');
    const member = await join(w, 'remove-membro');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, member.email)).code;
    expect((await accept(w.app, member.accessToken, code)).status).toBe(200);
    const response = await w.app.inject({
      method: 'DELETE',
      url: `/api/v1/family/members/${member.userId}`,
      headers: authHeader(owner.accessToken),
    });
    expect(response.statusCode).toBe(204);
    expect((await getFamily(w.app, owner.accessToken)).group?.members).toHaveLength(1);
  });

  it('membro sai do grupo removendo-se a si mesmo', async () => {
    const w = await world();
    const owner = await join(w, 'sai-dono');
    const member = await join(w, 'sai-membro');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, member.email)).code;
    expect((await accept(w.app, member.accessToken, code)).status).toBe(200);
    const response = await w.app.inject({
      method: 'DELETE',
      url: `/api/v1/family/members/${member.userId}`,
      headers: authHeader(member.accessToken),
    });
    expect(response.statusCode).toBe(204);
    expect((await getFamily(w.app, member.accessToken)).group).toBeNull();
  });

  it('o dono não é removível — quem quer o grupo fora dissolve-o', async () => {
    const w = await world();
    const owner = await join(w, 'dono-fica');
    await createGroup(w.app, owner.accessToken);
    const response = await w.app.inject({
      method: 'DELETE',
      url: `/api/v1/family/members/${owner.userId}`,
      headers: authHeader(owner.accessToken),
    });
    expect(response.statusCode).toBe(409);
  });

  it('só o dono dissolve o grupo', async () => {
    const w = await world();
    const owner = await join(w, 'dissolve-dono');
    const member = await join(w, 'dissolve-membro');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, member.email)).code;
    expect((await accept(w.app, member.accessToken, code)).status).toBe(200);

    const refused = await w.app.inject({
      method: 'DELETE',
      url: '/api/v1/family',
      headers: authHeader(member.accessToken),
    });
    expect(refused.statusCode).toBe(403);

    const dissolved = await w.app.inject({
      method: 'DELETE',
      url: '/api/v1/family',
      headers: authHeader(owner.accessToken),
    });
    expect(dissolved.statusCode).toBe(204);
    expect((await getFamily(w.app, owner.accessToken)).group).toBeNull();
    // Quem era membro também deixa de estar: o grupo acabou.
    expect((await getFamily(w.app, member.accessToken)).group).toBeNull();
  });
});

describe('GET /api/v1/family/games', () => {
  it('junta as bibliotecas sem duplicar e lista os donos', async () => {
    const w = await world();
    const owner = await join(w, 'jogos-dono');
    const member = await join(w, 'jogos-membro');
    await createGroup(w.app, owner.accessToken);
    const code = (await invite(w.app, owner.accessToken, member.email)).code;
    expect((await accept(w.app, member.accessToken, code)).status).toBe(200);

    await seedLibrary(w.repositories, owner.userId, 'minecraft', 'Minecraft');
    await seedLibrary(w.repositories, owner.userId, 'terraria', 'Terraria');
    await seedLibrary(w.repositories, member.userId, 'minecraft', 'Minecraft');
    await seedLibrary(w.repositories, member.userId, 'stardew-valley', 'Stardew Valley');

    const response = await w.app.inject({
      method: 'GET',
      url: '/api/v1/family/games',
      headers: authHeader(owner.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: { externalKey: string; owners: { userId: string }[] }[];
      total: number;
    };
    expect(body.total).toBe(3);
    const minecraft = body.items.find((item) => item.externalKey === 'minecraft');
    expect(minecraft?.owners).toHaveLength(2);
    const stardew = body.items.find((item) => item.externalKey === 'stardew-valley');
    expect(stardew?.owners).toHaveLength(1);
  });

  it('sem grupo devolve lista vazia', async () => {
    const w = await world();
    const member = await join(w, 'jogos-sem-grupo');
    const response = await w.app.inject({
      method: 'GET',
      url: '/api/v1/family/games',
      headers: authHeader(member.accessToken),
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: unknown[] }).items).toHaveLength(0);
  });
});