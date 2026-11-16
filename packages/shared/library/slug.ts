import { MAX_LIBRARY_NUMBER } from '../schemas/library'

const MAX_SLUG_LENGTH = 60
const FALLBACK_SLUG = 'quiz'

// Адрес задания: /library/quiz/<номер>-<slug>. Главный в адресе номер, slug нужен людям и поисковикам и строится
// из названия при каждом запросе, а не хранится: после смены названия сохранённый устарел бы
export function slugifyTitle(title: string): string {
  const slug = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '')
  return slug === '' ? FALLBACK_SLUG : slug
}

export interface ParsedQuizSlug {
  number: number
  slug: string
}

// '12-stolitsy' → { number: 12, slug: 'stolitsy' }; без части после номера slug пустой
export function parseQuizSlug(value: string): ParsedQuizSlug | null {
  const match = /^([1-9]\d{0,9})(?:-(.*))?$/.exec(value)
  if (match === null) return null
  const number = Number(match[1])
  if (number > MAX_LIBRARY_NUMBER) return null
  return { number, slug: match[2] ?? '' }
}
