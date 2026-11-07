import { describe, expect, it } from 'vitest'
import { safeNextPath } from './redirect'

describe('safeNextPath', () => {
  it.each(['/', '/cabinet', '/cabinet/assignments?tab=drafts', '/assignments/42#results', '/a//b'])('внутренний путь %j — как есть', (next) => {
    expect(safeNextPath(next)).toBe(next)
  })

  // Открытый редирект: браузер понял бы это как другой сайт
  it.each([
    ['//evil.example', '//evil.example'],
    ['//evil.example/path', '//evil.example/path'],
    ['/\\evil.example', '/\\evil.example'],
    ['/\\\\evil.example', '/\\\\evil.example'],
    ['https://evil.example', 'https://evil.example'],
    ['http://localhost:3000/cabinet', 'http://localhost:3000/cabinet'],
    ['javascript:alert(1)', 'javascript:alert(1)'],
    ['относительный путь', 'cabinet'],
    ['пустая строка', ''],
  ])('%s → /', (_name, next) => {
    expect(safeNextPath(next)).toBe('/')
  })

  // Браузер вырезает из URL табуляцию и переводы строк: «/\t/evil.example» становится «//evil.example»
  it.each([
    ['табуляция', '/\t/evil.example'],
    ['перевод строки', '/\n/evil.example'],
    ['возврат каретки', '/\r/evil.example'],
    ['табуляция перед обратным слэшем', '/\t\\evil.example'],
  ])('управляющий символ, который браузер вырезает (%s) → /', (_name, next) => {
    expect(safeNextPath(next)).toBe('/')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['массив из query', ['/cabinet', '//evil.example']],
    ['число', 42],
  ])('не строка (%s) → /', (_name, next) => {
    expect(safeNextPath(next)).toBe('/')
  })
})
