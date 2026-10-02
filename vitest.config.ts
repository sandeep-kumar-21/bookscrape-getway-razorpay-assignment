import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'dist/**',
        'test/**',
        '**/*.d.ts',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
        'src/main.ts',
        'src/sync-cli.ts',
      ],
      thresholds: {
        lines: 80,
        'src/modules/**/parsers/**': {
          lines: 90,
        },
        'src/modules/catalogue/**': {
          lines: 90,
        },
      },
    },
  },
});
