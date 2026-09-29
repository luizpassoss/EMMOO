import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, fetch: 'readonly', structuredClone: 'readonly' },
    },
    rules: {
      // Parâmetros iniciados com "_" são intencionalmente não usados (ex.: _next no handler de erro).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
