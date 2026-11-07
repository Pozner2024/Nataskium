import { describe, expect, it } from 'vitest'
import { takeTokenFromHash } from './tokenFromHash'

const TOKEN = 'qa-Token_0123456789abcdefghijklmnopqrstuvwx'

// Адрес и история подменяются: replaceState записывает новый адрес, а state сохраняется как есть
function browser(href: string) {
  const url = new URL(href, 'https://nataskium.example')
  const state = { from: 'router' }
  const calls: { state: unknown; url: string }[] = []
  const location = { hash: url.hash, pathname: url.pathname, search: url.search }
  const history = {
    state,
    replaceState(nextState: unknown, _unused: string, nextUrl?: string | URL | null) {
      calls.push({ state: nextState, url: String(nextUrl) })
    },
  }
  return { location, history, calls, state }
}

describe('takeTokenFromHash', () => {
  it('читает #token= и убирает фрагмент из адреса, сохраняя путь, query и state', () => {
    const page = browser(`/auth/verify-email?next=%2Fcabinet#token=${TOKEN}`)

    expect(takeTokenFromHash(page.location, page.history)).toBe(TOKEN)
    expect(page.calls).toEqual([{ state: page.state, url: '/auth/verify-email?next=%2Fcabinet' }])
  })

  it('в новом адресе токена нет', () => {
    const page = browser(`/auth/link-google#token=${TOKEN}`)

    takeTokenFromHash(page.location, page.history)

    expect(page.calls[0]?.url).not.toContain(TOKEN)
    expect(page.calls[0]?.url).not.toContain('#')
  })

  it('токен в процентной кодировке раскодируется', () => {
    const page = browser('/auth/reset-password#token=abc%2Bdef')

    expect(takeTokenFromHash(page.location, page.history)).toBe('abc+def')
  })

  it('другие параметры фрагмента не мешают', () => {
    const page = browser(`/auth/verify-email#utm=1&token=${TOKEN}`)

    expect(takeTokenFromHash(page.location, page.history)).toBe(TOKEN)
  })

  it.each([
    ['пустой token', '/auth/verify-email#token='],
    ['фрагмент без token', '/auth/verify-email#other=1'],
  ])('%s — null, но фрагмент всё равно убирается', (_name, href) => {
    const page = browser(href)

    expect(takeTokenFromHash(page.location, page.history)).toBeNull()
    expect(page.calls).toHaveLength(1)
  })

  it('без фрагмента — null, адрес не трогается', () => {
    const page = browser('/auth/verify-email')

    expect(takeTokenFromHash(page.location, page.history)).toBeNull()
    expect(page.calls).toEqual([])
  })

  it('токен из query не читается: он должен приходить только во фрагменте', () => {
    const page = browser(`/auth/verify-email?token=${TOKEN}`)

    expect(takeTokenFromHash(page.location, page.history)).toBeNull()
  })
})
