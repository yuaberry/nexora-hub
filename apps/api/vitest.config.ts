import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Os testes de integração com PostgreSQL real só correm quando
    // DATABASE_URL está definido; sem ela, a suite corre contra o modo
    // degradado em memória (ver README e docs/ARCHITECTURE.md).
    testTimeout: 20_000,
  },
});