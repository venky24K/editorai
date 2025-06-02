// @ts-check
import js from '@eslint/js';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-undef': 'error',
      'no-extra-semi': 'error',
      'semi': ['error', 'always']
    }
  }
];
