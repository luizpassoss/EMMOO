import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: '18.3' } },
    rules: {
      // Componente usado só no JSX conta como usado; com o JSX automático, não é preciso importar o React.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      // Regras dos hooks: chamá-los fora de ordem quebra o estado; dependências faltando deixam dados velhos na tela.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Variáveis iniciadas com "_" ficam de fora de propósito (ex.: { codigo: _anterior, ...resto }).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Testes e configuração rodam no Node (Vitest), com os globais dele.
    files: ['**/*.test.{js,jsx}', 'src/setupTests.js', 'src/apoioTestes.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
