import { DEFAULT_LOCALE } from '@nataskium/shared/locales'

const RUSSIAN_FEW_MAX = 4
const RUSSIAN_TEENS_START = 11
const RUSSIAN_TEENS_END = 14

// «один | несколько | много» для ru: 1 ответ, 2 ответа, 5 ответов, 11 ответов, 21 ответ.
// У остальных языков — стандартное правило vue-i18n «один | много»
function russianPlural(choice: number): number {
  const lastDigit = choice % 10
  const lastTwo = choice % 100
  if (lastTwo >= RUSSIAN_TEENS_START && lastTwo <= RUSSIAN_TEENS_END) return 2
  if (lastDigit === 1) return 0
  return lastDigit >= 2 && lastDigit <= RUSSIAN_FEW_MAX ? 1 : 2
}

export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: DEFAULT_LOCALE,
  pluralRules: { ru: russianPlural },
}))
