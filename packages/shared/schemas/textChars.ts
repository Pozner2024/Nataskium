// С флагом u пара суррогатов — один code point, поэтому диапазон совпадает только с одиночными.
// Не isWellFormed(): его нет в Safari до 16.4, а схемы работают и в браузере
export const LONE_SURROGATE = /[\uD800-\uDFFF]/u
// Категория Cc, как в CHECK teachers_display_name_no_control_chars_check (там без U+0000: в text его не бывает)
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/
// Cc без перевода строки: в тексте вопроса (textarea) он законен
export const CONTROL_CHARS_EXCEPT_NEWLINE = /[\x00-\x09\x0b-\x1f\x7f-\x9f]/
// U+061C, U+200E, U+200F, U+202A–U+202E, U+2066–U+2069: переворачивают текст вокруг. Не весь \p{Cf}: ZWJ (U+200D) нужен в составных эмодзи
const BIDI_CONTROL_CHARS = /\p{Bidi_Control}/u

export function hasNoUnsafeChars(text: string, controlChars: RegExp = CONTROL_CHARS): boolean {
  return !controlChars.test(text) && !BIDI_CONTROL_CHARS.test(text) && !LONE_SURROGATE.test(text)
}
