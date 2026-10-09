import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false, // alle Tests teilen sich eine Test-Datenbank
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
