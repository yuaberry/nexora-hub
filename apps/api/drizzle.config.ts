import { defineConfig } from 'drizzle-kit';

/**
 * Configuração das migrations Drizzle.
 *
 * O esquema está dividido por módulo (`db/*-schema.ts`); aqui são reunidos
 * para que o `drizzle-kit` conheça o esquema inteiro — sem isso a chave
 * estrangeira para `users` não resolve.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: [
    './src/db/schema.ts',
    './src/db/users-schema.ts',
    './src/db/auth-schema.ts',
    './src/db/mfa-schema.ts',
    './src/db/library-schema.ts',
    './src/db/sessions-schema.ts',
    './src/db/audit-schema.ts',
    './src/db/community-schema.ts',
    './src/db/wishlist-schema.ts',
    './src/db/family-schema.ts',
    './src/db/friends-schema.ts',
    './src/db/chat-schema.ts',
    './src/db/achievements-schema.ts',
  ],
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://nexora:nexora_dev@127.0.0.1:54340/nexora_hub',
  },
  strict: true,
  verbose: true,
});