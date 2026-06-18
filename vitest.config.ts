import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*-test.js'],

    // tests `process.chdir()` into temp dirs, which is unsupported in worker
    // threads. Use a single forked child process instead (replaces the old
    // `--no-threads` CLI flag, which was removed in vitest 4).
    pool: 'forks',
    maxWorkers: 1,
  },
});
