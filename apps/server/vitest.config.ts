import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Socket integration tests run whole games (8 clients); CI runners are several times slower than a laptop.
    testTimeout: 20_000,
  },
});
