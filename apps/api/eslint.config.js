import baseConfig from '@subscriber.dev/eslint-config/base.js';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**'],
  },
];

