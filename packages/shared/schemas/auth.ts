import { z } from 'zod'
import { isCommonPassword } from './passwordBlocklist'

export const MAX_EMAIL_LENGTH = 254
// RFC 5321: имя ящика до 64 октетов; оно только из ASCII, поэтому символы = октеты
const MAX_LOCAL_PART_LENGTH = 64
export const MIN_PASSWORD_LENGTH = 4
export const MAX_PASSWORD_LENGTH = 128
// Длина в code points, как char_length в CHECK teachers_display_name_length_check
export const DISPLAY_NAME_MAX_LENGTH = 100
// Случайные байты одноразовых токенов (подтверждение email, refresh, сброс пароля); API генерирует их по этой константе
export const AUTH_TOKEN_BYTES = 32
const BITS_PER_BYTE = 8
const BITS_PER_BASE64_CHAR = 6
// base64url без '=': 32 байта → 43 символа
export const AUTH_TOKEN_LENGTH = Math.ceil((AUTH_TOKEN_BYTES * BITS_PER_BYTE) / BITS_PER_BASE64_CHAR)
const INVALID_EMAIL_MESSAGE = 'Invalid email'
// С флагом u пара суррогатов — один code point, поэтому диапазон совпадает только с одиночными.
// Не isWellFormed(): его нет в Safari до 16.4, а схемы работают и в браузере
const LONE_SURROGATE = /[\uD800-\uDFFF]/u
// Категория Cc, как в CHECK teachers_display_name_no_control_chars_check (там без U+0000: в text его не бывает)
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/
// U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069: переворачивают текст вокруг имени в письмах и кабинете.
// Не весь \p{Cf}: ZWJ (U+200D) нужен в составных эмодзи
const BIDI_CONTROL_CHARS = /\p{Bidi_Control}/u
const VISIBLE_CHAR = /[\p{L}\p{N}\p{S}\p{P}]/u
// Невидимые, хотя часть из них формально буквы: ZWSP, Hangul Filler U+3164 и др., пустой знак Брайля U+2800
const INVISIBLE_CHARS = /[\p{Default_Ignorable_Code_Point}\u2800]/gu
const AUTH_TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${AUTH_TOKEN_LENGTH}}$`)

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

// Для входа и подтверждения: тот же NFC, что при регистрации, но без минимума и блок-листа —
// иначе учитель со старым паролем не войдёт, если список популярных паролей расширится
export const loginPasswordSchema = z
  .string({ error: 'Password must be a string' })
  .normalize('NFC')
  .min(1, { error: 'Password is required' })
  .max(MAX_PASSWORD_LENGTH, { error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters` })
  // В UTF-8 одиночный суррогат совпал бы с U+FFFD в сохранённом пароле
  .refine((password) => !LONE_SURROGATE.test(password), { error: 'Password contains invalid characters' })

function hasOnlyAllowedChars(name: string): boolean {
  const hasForbidden = CONTROL_CHARS.test(name) || BIDI_CONTROL_CHARS.test(name) || LONE_SURROGATE.test(name)
  return !hasForbidden && VISIBLE_CHAR.test(name.replace(INVISIBLE_CHARS, ''))
}

// Обрезка как String.prototype.trim (все \s, включая NBSP и BOM); NFC до проверки длины
export const displayNameSchema = z
  .string({ error: 'Display name must be a string' })
  .trim()
  .normalize('NFC')
  .min(1, { error: 'Display name must not be empty' })
  .max(DISPLAY_NAME_MAX_LENGTH, { error: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters` })
  // Только для имени без других ошибок: пустое — это «пустое», а не «без видимых символов»
  .refine(hasOnlyAllowedChars, {
    error: 'Display name contains invalid characters',
    when: (payload) => payload.issues.length === 0,
  })

export const authTokenSchema = z
  .string({ error: 'Token must be a string' })
  .regex(AUTH_TOKEN_PATTERN, { error: 'Invalid token' })

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
})

// Пароль обязателен: иначе посторонний регистрирует чужой email своим паролем, владелец почты жмёт ссылку — и аккаунт с паролем постороннего
export const verifyEmailSchema = z.object({
  token: authTokenSchema,
  password: loginPasswordSchema,
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

// Новый пароль — по правилам регистрации: NFC, минимум, блок-лист
export const resetPasswordSchema = z.object({
  token: authTokenSchema,
  password: passwordSchema,
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
