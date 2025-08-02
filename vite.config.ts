/// <reference types="vitest" />
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  test: {
    globals: true, 
    environment: 'node', 
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      // rollupTypes: true, // if you wont one .d.ts file
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'quiver', 
      formats: ['es', 'cjs'],
      fileName: (format) => `${format}/index.js`,
    },
    rollupOptions: {
      output: {
        preserveModules: false,
      },
      external: [
        'node:fs',
        'node:path',
        'node:http'
      ],
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});