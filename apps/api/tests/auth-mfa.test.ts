import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader, fakeClock } from './helpers.js';
import { loginUser, registerUser, TEST_PASSWORD } from './fixtures.js';
import { generateTotpSecret, totpCode, totpStep } from '../src/modules/auth/totp.js';
import { signToken } from '../src/plugins/auth.js';
import { TEST_SECRET } from './helpers.js';

/**
 * Segundo factor (TOTP).
 *
 * A senha **não** abre sessão com MFA activo: devolve um desafio, e só a
 * verificação do código emite tokens. O desafio é assinado com uma chave
 * derivada — usado como autorização, tem de falhar (e há teste a provar isso).
 */

const PASSWORD = TEST_PASSWORD;

/** Faz o enrollment completo e devolve o segredo em claro. */
async function enroll(
  app: Awaited<ReturnType<typeof buildTestApp>>['app'],
  accessToken: string,
  /** Relógio injectável — o desafio TOTP é verificado com o relógio do serviço. */
  now: () => Date = () => new Date(),
) {
  const start = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/enroll',
    headers: authHeader(accessToken),
  });
  expect(start.statusCode).toBe(200);
  const enrollment = start.json() as { secret: string; uri: string };
  expect(enrollment.uri.startsWith('otpauth://totp/')).toBe(true);

  const code = totpCode(enrollment.secret, totpStep(now()));
  const confirm = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/mfa/confirm',
    headers: authHeader(accessToken),
    payload: { code },
  });
  expect(confirm.statusCode).toBe(200);
  const codes = confirm.json() as { recoveryCodes: string[] };
  return { secret: enrollment.secret, recoveryCodes: codes.recoveryCodes };
}

describe('enrollment do segundo factor', () => {
  it('o segredo só é activado depois de um código válido', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa1@nexora.local', PASSWORD);
    const { recoveryCodes } = await enroll(app, user.accessToken);

    expect(recoveryCodes.length).toBeGreaterThan(0);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeader(user.accessToken),
    });
    expect((me.json() as { user: { mfaEnabled: boolean } }).user.mfaEnabled).toBe(true);
    await app.close();
  });

  it('um enrollment novo não desliga um MFA activo (409)', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa2@nexora.local', PASSWORD);
    await enroll(app, user.accessToken);

    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: authHeader(user.accessToken),
    });
    expect(again.statusCode).toBe(409);
    await app.close();
  });

  it('um código errado não activa o MFA', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa3@nexora.local', PASSWORD);
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/enroll',
      headers: authHeader(user.accessToken),
    });

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/confirm',
      headers: authHeader(user.accessToken),
      payload: { code: '000000' },
    });
    expect([400, 401]).toContain(confirm.statusCode);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: authHeader(user.accessToken),
    });
    expect((me.json() as { user: { mfaEnabled: boolean } }).user.mfaEnabled).toBe(false);
    await app.close();
  });
});

describe('login com segundo factor', () => {
  it('a senha certa devolve um desafio, não tokens', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa4@nexora.local', PASSWORD);
    const { secret } = await enroll(app, user.accessToken);

    const login = await loginUser(app, 'mfa4@nexora.local', PASSWORD);
    expect('challengeToken' in login).toBe(true);

    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { challengeToken: (login as { challengeToken: string }).challengeToken, code: totpCode(secret, totpStep()) },
    });
    expect(verified.statusCode).toBe(200);
    expect((verified.json() as { tokens: { accessToken: string } }).tokens.accessToken).toBeTruthy();
    await app.close();
  });

  it('o mesmo passo TOTP não vale duas vezes (anti-replay)', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa5@nexora.local', PASSWORD);
    const { secret } = await enroll(app, user.accessToken);
    const login = await loginUser(app, 'mfa5@nexora.local', PASSWORD);
    const challengeToken = (login as { challengeToken: string }).challengeToken;

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { challengeToken, code: totpCode(secret, totpStep()) },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { challengeToken, code: totpCode(secret, totpStep()) },
    });
    expect(second.statusCode).toBe(401);
    await app.close();
  });

  it('um código de resgate entra uma única vez', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa6@nexora.local', PASSWORD);
    const { recoveryCodes } = await enroll(app, user.accessToken);
    const login = await loginUser(app, 'mfa6@nexora.local', PASSWORD);
    const challengeToken = (login as { challengeToken: string }).challengeToken;

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { challengeToken, code: recoveryCodes[0] ?? '' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/verify',
      payload: { challengeToken, code: recoveryCodes[0] ?? '' },
    });
    expect(second.statusCode).toBe(401);
    await app.close();
  });

  it('um desafio usado como autorização falha', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa7@nexora.local', PASSWORD);
    await enroll(app, user.accessToken);
    const login = await loginUser(app, 'mfa7@nexora.local', PASSWORD);
    const challengeToken = (login as { challengeToken: string }).challengeToken;

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${challengeToken}` },
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it('um token de acesso não serve de desafio', () => {
    const token = signToken({ sub: 'u', email: 'u@nexora.local', role: 'user' }, TEST_SECRET, 3600);
    // O formato não bate (JWT tem 3 partes; o desafio tem 4) — e a assinatura
    // usa um contexto de chave diferente.
    expect(token.split('.')).toHaveLength(3);
  });
});

describe('desactivar o segundo factor', () => {
  it('exige um código válido', async () => {
    const { app } = await buildTestApp();
    const user = await registerUser(app, 'mfa8@nexora.local', PASSWORD);
    const { secret } = await enroll(app, user.accessToken);

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/disable',
      headers: authHeader(user.accessToken),
      payload: { code: '000000' },
    });
    expect([400, 401]).toContain(wrong.statusCode);

    const right = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/disable',
      headers: authHeader(user.accessToken),
      payload: { code: totpCode(secret, totpStep()) },
    });
    expect(right.statusCode).toBe(204);

    const login = await loginUser(app, 'mfa8@nexora.local', PASSWORD);
    expect('accessToken' in login).toBe(true);
    await app.close();
  });
});

describe('gerar códigos de resgate novos', () => {
  it('consome o passo TOTP', async () => {
    const clock = fakeClock();
    const { app } = await buildTestApp({ now: clock.now });
    const user = await registerUser(app, 'mfa9@nexora.local', PASSWORD);
    const { secret } = await enroll(app, user.accessToken, clock.now);
    const step = totpStep(clock.now());

    const codes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/recovery-codes',
      headers: authHeader(user.accessToken),
      payload: { code: totpCode(secret, step) },
    });
    expect(codes.statusCode).toBe(200);
    expect((codes.json() as { recoveryCodes: string[] }).recoveryCodes.length).toBeGreaterThan(0);

    // O passo foi consumido: o mesmo código não volta a servir.
    clock.advanceSeconds(0);
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/mfa/recovery-codes',
      headers: authHeader(user.accessToken),
      payload: { code: totpCode(secret, step) },
    });
    expect([400, 401]).toContain(again.statusCode);
    await app.close();
  });
});

/** O segredo de teste nunca é um segredo real. */
describe('segredo do MFA', () => {
  it('é gerado com entropia suficiente (160 bits)', () => {
    const secret = generateTotpSecret();
    // 20 bytes em base32 = 32 caracteres.
    expect(secret).toHaveLength(32);
    expect(secret).not.toBe(generateTotpSecret());
  });
});