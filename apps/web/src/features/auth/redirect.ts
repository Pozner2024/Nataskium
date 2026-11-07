// Куда вернуть после входа (?next=): только путь этого сайта. «//evil.example» и «/\evil.example» браузер
// понял бы как другой сайт — открытый редирект
const DEFAULT_AFTER_SIGN_IN = '/'
// Браузер выбрасывает \t, \n, \r из URL: '/\t/evil.example' стал бы '//evil.example'. Управляющие символы
// в пути не нужны — такой next отклоняем целиком
const LAST_C0_CONTROL_CODE = 0x1f
const DELETE_CODE = 0x7f

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= LAST_C0_CONTROL_CODE || code === DELETE_CODE) return true
  }
  return false
}

export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return DEFAULT_AFTER_SIGN_IN
  if (hasControlChars(next)) return DEFAULT_AFTER_SIGN_IN
  if (next.startsWith('//') || next.startsWith('/\\')) return DEFAULT_AFTER_SIGN_IN
  return next
}
