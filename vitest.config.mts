import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Each database test file builds its own in-memory database from the migrations.
    hookTimeout: 120000,
  },
});
