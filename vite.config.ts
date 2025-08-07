/// <reference types="vitest" />
import { resolve } from 'path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  test: {
    globals: true, 
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['html', 'text-summary'],
    },
  },
  plugins: [
    (dts as any)({
      tsconfigPath: './tsconfig.build.json',
      insertTypesEntry: true,
      // rollupTypes: true, // if you want one .d.ts file
      // skipDiagnostics: true, // enable if you want to skip type checking during dts generation
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
