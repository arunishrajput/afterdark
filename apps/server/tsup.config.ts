import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Shared is consumed as TypeScript source, so bundle it into the server output.
  noExternal: ['@afterdark/shared'],
});
