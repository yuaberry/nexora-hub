import { z } from 'zod';
import type { GameProvider } from '@nexora/protocol';

/**
 * Validação (Zod) das entradas do módulo de biblioteca.
 *
 * Tudo o que vem de fora é validado aqui — inclusive os caminhos de ficheiro,
 * que são **metadados** (a API nunca lê o disco do utilizador). Um caminho
 * inválido é um pedido inválido (`400`), não uma excepção.
 */

/** Caminho local: absoluto, sem travessia de caminho. */
const pathSchema = z
  .string()
  .trim()
  .min(1, 'Caminho vazio.')
  .max(1024, 'Caminho demasiado longo.')
  .refine((value) => !value.includes('..'), 'Travessia de caminho não permitida.');

/** Sincronização de uma entrada local (o desktop envia o que importou). */
export const libraryEntrySyncSchema = z.object({
  externalKey: z.string().trim().min(1, 'Chave externa em falta.').max(120, 'Chave externa demasiado longa.'),
  title: z.string().trim().min(1, 'Título em falta.').max(200, 'Título demasiado longo.'),
  cover: z.union([pathSchema, z.null()]).optional(),
  provider: z
    .enum(['local', 'user-import', 'official-import'])
    .optional()
    .transform((value) => value as GameProvider | undefined),
  installPath: z.union([pathSchema, z.null()]).optional(),
  executablePath: z.union([pathSchema, z.null()]).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  adult: z.boolean().optional(),
});

export type LibraryEntrySyncInput = z.infer<typeof libraryEntrySyncSchema>;

export const favoriteSchema = z.object({
  favorite: z.boolean({ message: 'Valor booleano inválido.' }),
});

export const collectionSchema = z.object({
  name: z.string().trim().min(1, 'Nome da colecção em falta.').max(60, 'Nome demasiado longo.'),
});