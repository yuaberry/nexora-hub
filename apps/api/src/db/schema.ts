/**
 * Esquema completo da base de dados.
 *
 * As tabelas vivem em ficheiros por módulo (`users-schema`, `auth-schema`,
 * `mfa-schema`, `library-schema`, `sessions-schema`, `audit-schema`); este
 * ficheiro reúne todas as listas para que o Drizzle e o `drizzle-kit`
 * conheçam o esquema inteiro — é a mesma lista que o `drizzle.config.ts`
 * declara.
 */

export * from './users-schema.js';
export * from './auth-schema.js';
export * from './mfa-schema.js';
export * from './library-schema.js';
export * from './sessions-schema.js';
export * from './audit-schema.js';
export * from './community-schema.js';
export * from './forums-schema.js';
export * from './wishlist-schema.js';
export * from './family-schema.js';
export * from './friends-schema.js';
export * from './chat-schema.js';
export * from './achievements-schema.js';
export * from './types.js';