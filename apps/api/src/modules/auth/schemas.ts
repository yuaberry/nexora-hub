import { z } from 'zod';

/**
 * Validação (Zod) de todas as entradas externas do módulo de autenticação.
 *
 * As regras são **apertadas de propósito**: a senha tem um mínimo, o e-mail é
 * normalizado para minúsculas, e nenhum campo aceita silenciosamente um valor
 * que não corresponde ao contrato. Um pedido inválido sai como `400` com o
 * envelope do contrato e o caminho do campo.
 */

/** E-mail normalizado (minúsculas, sem espaços). */
const emailSchema = z
  .string()
  .trim()
  .min(3, 'E-mail demasiado curto.')
  .max(254, 'E-mail demasiado longo.')
  .email('E-mail inválido.')
  .transform((value) => value.toLowerCase());

/** Senha: mínimo de 10 caracteres (a política é declarada, não negociável). */
const passwordSchema = z
  .string()
  .min(10, 'A senha tem de ter pelo menos 10 caracteres.')
  .max(128, 'A senha é demasiado longa.');

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(2, 'Nome demasiado curto.').max(80, 'Nome demasiado longo.'),
});

export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Senha em falta.'),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Token de renovação em falta.'),
});

export type RefreshRequestInput = z.infer<typeof refreshRequestSchema>;

export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Token de renovação em falta.'),
});

export type LogoutRequestInput = z.infer<typeof logoutRequestSchema>;

export const mfaVerifyRequestSchema = z.object({
  challengeToken: z.string().min(1, 'Desafio em falta.'),
  code: z
    .string()
    .trim()
    .min(6, 'Código inválido.')
    .max(32, 'Código inválido.'),
});

export type MfaVerifyRequestInput = z.infer<typeof mfaVerifyRequestSchema>;

export const mfaConfirmRequestSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Código TOTP inválido.'),
});

export type MfaConfirmRequestInput = z.infer<typeof mfaConfirmRequestSchema>;

export const mfaDisableRequestSchema = z.object({
  code: z.string().trim().min(6, 'Código inválido.').max(32, 'Código inválido.'),
});

export type MfaDisableRequestInput = z.infer<typeof mfaDisableRequestSchema>;