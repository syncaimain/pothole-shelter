// One lint config for the whole workspace. Deliberately plain: the recommended rules from
// ESLint, typescript-eslint and React's hooks rules, no style opinions (formatting is not
// what lint is for here).
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.sanity/**',
      'web/public/**',
      'web/next-env.d.ts',
      'ingest/data/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {globals: {...globals.node, ...globals.browser}},
    rules: {
      // Unused args prefixed with _ are intentional (e.g. `_prev` in a server action signature).
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    },
  },
  {
    files: ['web/**/*.tsx', 'app/**/*.tsx'],
    plugins: {'react-hooks': reactHooks},
    rules: reactHooks.configs.recommended.rules,
  },
)
