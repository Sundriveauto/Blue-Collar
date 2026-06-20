// @ts-check
/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
const config = {
  packageManager: 'pnpm',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/services/payment.service.ts',
    'src/services/auth.service.ts',
    'src/services/worker.service.ts',
    'src/utils/AppError.ts',
    'src/utils/paginate.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  timeoutMS: 30000,
  concurrency: 2,
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json',
  },
};

export default config;
