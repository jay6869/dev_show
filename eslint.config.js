import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['vite.config.ts', 'eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      // Disposers are written as `() => fn()` shorthands everywhere by design; the rule fights that idiom.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Typed query helpers mirror querySelector<T>'s own signature: the parameter exists to type the result.
    files: ['src/utils/dom.ts'],
    rules: { '@typescript-eslint/no-unnecessary-type-parameters': 'off' },
  },
  { files: ['*.js'], ...tseslint.configs.disableTypeChecked },
);
