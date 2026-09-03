import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.vscode-test/**',
      '.vscode-test.js',
      'dist/**',
      'eslint.config.mjs',
      'node_modules/**',
      'out/**',
      'esbuild.mjs'
    ]
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  }
);
