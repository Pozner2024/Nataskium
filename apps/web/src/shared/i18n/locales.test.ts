import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@nataskium/shared/locales'
import { describe, expect, it } from 'vitest'
import { SITE_LINKS } from '../config'
import de from './locales/de'
import en from './locales/en'
import fr from './locales/fr'
import ru from './locales/ru'

type Tree = { [key: string]: string | Tree }

const PLACEHOLDER = /\{(\w+)\}/g

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return typeof value === 'string' ? { ...flat, [path]: value } : { ...flat, ...flatten(value, path) }
  }, {})
}

const russian = flatten(ru)
const english = flatten(en)
const german = flatten(de)
const french = flatten(fr)

describe('файлы переводов', () => {
  it('файлы переводов есть для каждого языка из @nataskium/shared и только для них', () => {
    const codes = Object.keys(import.meta.glob('./locales/*.ts'))
      .map((path) => path.replace('./locales/', '').replace('.ts', ''))
      .filter((code) => !code.endsWith('.test'))

    expect(codes.sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  it('русский — язык по умолчанию, источник типов остальных', () => {
    expect(DEFAULT_LOCALE).toBe('ru')
  })

  it('в английском те же ключи, что в русском', () => {
    expect(Object.keys(english).sort()).toEqual(Object.keys(russian).sort())
  })

  it('нет пустых переводов', () => {
    for (const [key, text] of [...Object.entries(russian), ...Object.entries(english)]) {
      expect(text.trim(), key).not.toBe('')
    }
  })

  it('параметры вида {name} совпадают в обоих языках', () => {
    const params = (text: string) => [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort()
    for (const [key, text] of Object.entries(russian)) {
      expect(params(english[key] ?? ''), key).toEqual(params(text))
    }
  })

  it('каждая подпись из SITE_LINKS переведена', () => {
    for (const { labelKey } of Object.values(SITE_LINKS)) {
      expect(russian[labelKey], labelKey).toBeDefined()
      expect(english[labelKey], labelKey).toBeDefined()
    }
  })

  it.each([['немецкий', german], ['французский', french]])('в %s те же ключи, что в русском', (_name, translation) => {
    expect(Object.keys(translation).sort()).toEqual(Object.keys(russian).sort())
  })

  it.each([['немецкий', german], ['французский', french]])('в %s параметры вида {name} совпадают с русским', (_name, translation) => {
    const params = (text: string) => [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort()
    for (const [key, text] of Object.entries(russian)) {
      expect(params(translation[key] ?? ''), key).toEqual(params(text))
    }
  })

  it.each([['немецкий', german], ['французский', french]])('в %s нет пустых переводов', (_name, translation) => {
    for (const [key, text] of Object.entries(translation)) {
      expect(text.trim(), key).not.toBe('')
    }
  })
})
