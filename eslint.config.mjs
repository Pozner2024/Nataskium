// Только для apps/api и packages/shared: у apps/web свой конфиг
import tsParser from '@typescript-eslint/parser'

export default [
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: { parser: tsParser },
    rules: {
      'eqeqeq': 'error',
      'no-debugger': 'error',
      // args: 'none' — ядровое правило принимает параметры в типах функций за неиспользуемые
      'no-unused-vars': ['error', { args: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-restricted-syntax': ['error', {
        selector: 'TSAnyKeyword',
        message: 'any запрещён: используйте конкретный тип или unknown с валидацией Zod',
      }],
    },
  },
]
