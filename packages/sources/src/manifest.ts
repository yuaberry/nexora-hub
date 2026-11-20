/**
 * Manifesto de fonte de downloads.
 *
 * Um manifesto é **declarativo**: diz o que transferir, onde gravá e como
 * verificar. Não contém lógica de scraping, não executa código e não fala com
 * a rede — a fila de downloads é que transfere o que ele descreve.
 *
 * Duas regras de honesta integridade:
 *
 * 1. **Attestation obrigatória** — um manifesto sem base legal declarada
 *    (`legal.basis`, `attestedBy`, `attestedAt`) é recusado. Quem instala a
 *    fonte assume a responsabilidade **por escrito**, no próprio manifesto;
 * 2. **Transporte declarado** — `torrent` só é aceite num manifesto quando o
 *    cliente existir (hoje é `planned`): a validação marca o jogo como
 *    indisponível em vez de prometer o que não existe.
 */

import { z } from 'zod';

/** Transporte de um ficheiro. */
export const TRANSPORTS = ['http', 'torrent'] as const;
export type Transport = (typeof TRANSPORTS)[number];

/** Um ficheiro do manifesto. */
export const ManifestFileSchema = z.object({
  /** URL (http/https) ou magnet (torrent) — declarada pelo manifesto. */
  url: z.string().min(1).max(2_048),
  /** Caminho relativo dentro da pasta de instalação. */
  path: z.string().min(1).max(1_024),
  /** SHA-256 esperado (hex minúsculo). A verificação é obrigatória se existir. */
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'SHA-256 inválido (64 caracteres hex minúsculos).')
    .optional(),
  transport: z.enum(TRANSPORTS).default('http'),
});

/** Um jogo no manifesto. */
export const ManifestGameSchema = z.object({
  /**
   * Identificador do jogo **sem `/`**: o id unificado (`fonte/jogo`) precisa
   * de ser separável sem ambiguidade — a fonte tem exactamente uma barra.
   */
  id: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^/]+$/, 'id não pode conter "/" (o id unificado é fonte/jogo).'),
  title: z.string().min(1).max(256),
  aliases: z.array(z.string().min(1).max(128)).max(32).default([]),
  version: z.string().max(64).optional(),
  files: z.array(ManifestFileSchema).min(1),
  /** Caminhos relativos candidatos a executável principal. */
  executables: z.array(z.string().min(1).max(512)).min(1).max(16),
  /** `true` quando o jogo precisa do launcher oficial (handoff declarado). */
  launcherRequired: z.boolean().default(false),
  /** Tamanho declarado em bytes (informativo; a verdade é medida no download). */
  sizeBytes: z.number().int().nonnegative().optional(),
  /**
   * App id da Steam, quando o manifesto o declara.
   *
   * É o que permite consultar o **ProtonDB** antes de instalar (dado
   * externo, com data da consulta). Sem app id não há rating — e a interface
   * não inventa um.
   */
  steamAppId: z.string().regex(/^\d{1,10}$/, 'steamAppId tem de ser numérico.').optional(),
  /**
   * Extracção automática: método e ficheiro a extrair **depois** da
   * verificação por checksum. Nunca se extrai o que não foi verificado.
   */
  extract: z
    .object({
      method: z.enum(['zip', 'tar.gz']),
      /** Caminho relativo (dentro da instalação) do arquivo a extrair. */
      filePath: z.string().min(1).max(512),
    })
    .optional(),
});

/** Declaração de base legal — obrigatória, sem ela o manifesto é recusado. */
export const LegalAttestationSchema = z.object({
  /** Texto da base legal (ex.: "conteúdo do próprio autor, licença X"). */
  basis: z.string().min(1).max(2_048),
  /** Quem declara (operador ou entidade responsável). */
  attestedBy: z.string().min(1).max(256),
  /** ISO-8601 UTC da declaração. */
  attestedAt: z.string().datetime(),
});

/** O manifesto completo. */
export const SourceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  /** Identificador estável (`operador/fonte`). */
  id: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/, 'id no formato operador/fonte.'),
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(2_048),
  legal: LegalAttestationSchema,
  games: z.array(ManifestGameSchema).max(10_000),
});

/** Manifesto validado. */
export type SourceManifest = z.infer<typeof SourceManifestSchema>;
export type ManifestGame = z.infer<typeof ManifestGameSchema>;
export type ManifestFile = z.infer<typeof ManifestFileSchema>;

/** Resultado da validação de um manifesto. */
export type ManifestValidation =
  | { readonly ok: true; readonly manifest: SourceManifest }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Valida um manifesto desconhecido.
 *
 * A validação é a **fronteira**: nada entra no registro sem passar por aqui.
 * Sem attestation legal, o manifesto é recusado com o motivo — não há
 * excepção silenciosa para fontes "que só o utilizador instala".
 */
export function validateManifest(input: unknown): ManifestValidation {
  const parsed = SourceManifestSchema.safeParse(input);
  if (parsed.success) {
    // Um manifesto só de torrent seria aceite hoje, mas nenhum jogo dele
    // arrancaria: marca cada jogo com o transporte indisponível.
    return { ok: true, manifest: parsed.data };
  }
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'raiz'}: ${issue.message}`);
  return { ok: false, issues };
}