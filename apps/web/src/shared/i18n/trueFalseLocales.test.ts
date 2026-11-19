import { describe, expect, it } from 'vitest'
import de from './locales/de'
import en from './locales/en'
import fr from './locales/fr'
import ru from './locales/ru'

const WORD_JOINER = '\u{2060}'
const LOCALES = { ru, en, de, fr }

describe('локали «да/нет»', () => {
  it.each(Object.entries(LOCALES))('%s: заголовки не рвутся посреди пары вокруг «/»', (_, locale) => {
    for (const heading of [locale.teacher.trueFalseEditor.headingNew, locale.teacher.trueFalseEditor.headingEdit]) {
      expect(heading).toContain(`${WORD_JOINER}/${WORD_JOINER}`)
    }
  })

  it.each(Object.entries(LOCALES))('%s: есть текст ошибки «ответ не выбран»', (_, locale) => {
    expect(locale.teacher.trueFalseEditor.errors.answerRequired.trim()).not.toBe('')
  })
})
