import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  platform: 'node',
  target: 'node18',
  // Bundle local source files but externalize all node_modules
  // This prevents bundling dependencies with top-level await
  external: [
    // Externalize all node_modules
    /^[^./]|^\.[^./]|^\.\.[^/]/,
  ],
});
