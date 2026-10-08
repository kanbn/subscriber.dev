import baseConfig from '@subscriber.dev/eslint-config/base';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**'],
  },
];

