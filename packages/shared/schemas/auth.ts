import { z } from 'zod'
import { isCommonPassword } from './passwordBlocklist'

const MAX_EMAIL_LENGTH = 254
// RFC 5321: имя ящика до 64 октетов; оно только из ASCII, поэтому символы = октеты
const MAX_LOCAL_PART_LENGTH = 64
const MIN_PASSWORD_LENGTH = 4
const MAX_PASSWORD_LENGTH = 128
const INVALID_EMAIL_MESSAGE = 'Invalid email'
// С флагом u пара суррогатов — один code point, поэтому диапазон совпадает только с одиночными.
// Не isWellFormed(): его нет в Safari до 16.4, а схемы работают и в браузере
const LONE_SURROGATE = /[\uD800-\uDFFF]/u

// Имя ящика как у z.email(); домен — буквенная зона или punycode-зона xn--, поэтому IP-адрес не пройдёт
const ASCII_EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)[a-z0-9_'+\-.]*[a-z0-9_+-]@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/
const NON_ASCII = /[^\x00-\x7f]/
// URL молча удалил бы \t и \n, раскодировал бы %, а : / ? # @ \ [ ] прочитал бы как порт, путь или IPv6
const NON_DOMAIN_CHARS = /[\s\x00-\x1f\x7f/\\?#@:%[\]]/
// URL молча удалил бы невидимые символы (U+00AD, U+200B, U+2060, U+FE00–U+FE0F, BOM и др.)
// и заменил бы точками 。．｡ — адрес выглядел бы иначе, чем сохранён
const INVISIBLE_OR_ALT_DOT_CHARS = /[\p{Default_Ignorable_Code_Point}\u3002\uff0e\uff61]/u

// new URL, а не node:url: схема работает и в браузере
function toAsciiDomain(domain: string): string | null {
  if (domain === '' || NON_DOMAIN_CHARS.test(domain) || INVISIBLE_OR_ALT_DOT_CHARS.test(domain)) return null

  try {
    return new URL(`http://${domain}`).hostname
  } catch {
    return null
  }
}

// Единственная нормализация email в проекте: и при регистрации, и при входе.
// Результат в ASCII (домен в punycode): так адрес хранится в базе
export const emailSchema = z
  .string({ error: 'Email must be a string' })
  .trim()
  .normalize('NFC')
  .toLowerCase()
  .transform((email, ctx) => {
    const atIndex = email.lastIndexOf('@')
    const localPart = email.slice(0, atIndex)
    if (atIndex !== -1 && NON_ASCII.test(localPart)) {
      ctx.addIssue({ code: 'custom', message: 'Email must use only Latin letters, digits and symbols before @' })
      return z.NEVER
    }

    const asciiDomain = atIndex === -1 ? null : toAsciiDomain(email.slice(atIndex + 1))
    if (asciiDomain === null) {
      ctx.addIssue({ code: 'custom', message: INVALID_EMAIL_MESSAGE })
      return z.NEVER
    }

    return `${localPart}@${asciiDomain}`
  })
  .pipe(
    z
      .string()
      .max(MAX_EMAIL_LENGTH, { error: `Email must be at most ${MAX_EMAIL_LENGTH} characters`, abort: true })
      .refine((email) => email.lastIndexOf('@') <= MAX_LOCAL_PART_LENGTH, {
        error: `Email must have at most ${MAX_LOCAL_PART_LENGTH} characters before @`,
        abort: true,
      })
      .regex(ASCII_EMAIL_PATTERN, { error: INVALID_EMAIL_MESSAGE }),
  )

// Пробелы и регистр — часть пароля, их не трогаем. NFC — чтобы один пароль с разных ОС дал один хэш;
// normalize оставляет одиночные суррогаты как есть, поэтому проверка ниже их по-прежнему ловит
export const passwordSchema = z
  .string({ error: 'Password must be a string' })
  .normalize('NFC')
  .min(MIN_PASSWORD_LENGTH, { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
  .max(MAX_PASSWORD_LENGTH, { error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` })
  // Одиночный суррогат в UTF-8 становится U+FFFD, и разные пароли дали бы один хэш
  .refine((password) => !LONE_SURROGATE.test(password), { error: 'Password contains invalid characters' })
  // Только для пароля без других ошибок: «xxx» — это «слишком короткий», а не «слишком простой»
  .refine((password) => !isCommonPassword(password), {
    error: 'Password is too common',
    when: (payload) => payload.issues.length === 0,
  })
