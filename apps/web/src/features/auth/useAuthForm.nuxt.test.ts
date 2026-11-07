import { loginSchema, registerSchema } from '@nataskium/shared/schemas'
import { describe, expect, it } from 'vitest'
import { ApiError } from '@/shared'
import { useAuthForm } from '@/features/auth'

const VALID_LOGIN = { email: 'qa-anna@example.test', password: 'qa-correct-horse' }

// Действие, которое завершится, только когда тест разрешит
function deferredAction() {
  const state = { calls: [] as unknown[], resolve: () => {}, reject: (_error: unknown) => {} }
  const action = (input: unknown) => {
    state.calls.push(input)
    return new Promise<void>((resolve, reject) => {
      state.resolve = resolve
      state.reject = reject
    })
  }
  return { action, state }
}

describe('useAuthForm: проверка до запроса', () => {
  it('пустые поля — «Введите…» без запроса и без разбора схемой', async () => {
    const form = useAuthForm('login')
    const { action, state } = deferredAction()

    await form.submit(loginSchema, { email: ' ', password: '' }, { email: ' ', password: '' }, action)

    expect(state.calls).toEqual([])
    expect(form.fieldErrors.value).toEqual({ email: 'Введите почту', password: 'Введите пароль' })
    expect(form.formError.value).toBeUndefined()
    expect(form.isLoading.value).toBe(false)
  })

  it('не проходит схему — ошибки полей по-русски, запроса нет', async () => {
    const form = useAuthForm('register')
    const { action, state } = deferredAction()
    const payload = { email: 'not-an-email', password: 'qwerty' }

    await form.submit(registerSchema, payload, payload, action)

    expect(state.calls).toEqual([])
    expect(form.fieldErrors.value).toEqual({
      email: 'Проверьте адрес почты: например, name@school.ru',
      password: 'Этот пароль слишком простой — придумайте другой',
    })
  })

  it('в действие уходят данные после разбора схемой (нормализованный email)', async () => {
    const form = useAuthForm('login')
    const { action, state } = deferredAction()
    const payload = { email: ' QA-Anna@Example.TEST ', password: 'x' }

    const done = form.submit(loginSchema, payload, payload, action)
    state.resolve()
    await done

    expect(state.calls).toEqual([{ email: 'qa-anna@example.test', password: 'x' }])
  })
})

describe('useAuthForm: отправка', () => {
  it('во время запроса isLoading, ошибки сброшены; после — isLoading false', async () => {
    const form = useAuthForm('login')
    form.showFormError('старая ошибка')
    const { action, state } = deferredAction()

    const done = form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)

    expect(form.isLoading.value).toBe(true)
    expect(form.formError.value).toBeUndefined()
    state.resolve()
    await done
    expect(form.isLoading.value).toBe(false)
  })

  it('повторная отправка во время запроса игнорируется: действие одно', async () => {
    const form = useAuthForm('login')
    const { action, state } = deferredAction()

    const first = form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)
    await form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)
    await form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)
    state.resolve()
    await first

    expect(state.calls).toHaveLength(1)
  })

  it('после завершения можно отправить снова', async () => {
    const form = useAuthForm('login')
    const { action, state } = deferredAction()

    const first = form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)
    state.resolve()
    await first
    const second = form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)
    state.resolve()
    await second

    expect(state.calls).toHaveLength(2)
  })

  it('ошибка API — текст формы по статусу, isLoading снят', async () => {
    const form = useAuthForm('login')
    const { action, state } = deferredAction()

    const done = form.submit(loginSchema, VALID_LOGIN, VALID_LOGIN, action)
    state.reject(new ApiError(401))
    await done

    expect(form.formError.value).toBe('Неверная почта или пароль')
    expect(form.isLoading.value).toBe(false)
  })

  it('400 с issues от сервера — ошибки у полей', async () => {
    const form = useAuthForm('register')
    const { action, state } = deferredAction()
    const payload = { email: 'qa-anna@example.test', password: 'qa-strong-pass-77' }

    const done = form.submit(registerSchema, payload, payload, action)
    state.reject(new ApiError(400, [{ path: ['password'], message: 'Password is too common' }]))
    await done

    expect(form.fieldErrors.value).toEqual({ password: 'Этот пароль слишком простой — придумайте другой' })
  })
})

describe('useAuthForm: fieldErrors — каждый раз новый объект', () => {
  // AuthCard по смене объекта переводит фокус на первое поле с ошибкой
  it('одинаковые ошибки при повторной отправке — новый объект', async () => {
    const form = useAuthForm('login')
    const empty = { email: '', password: '' }

    await form.submit(loginSchema, empty, empty, deferredAction().action)
    const first = form.fieldErrors.value
    await form.submit(loginSchema, empty, empty, deferredAction().action)

    expect(form.fieldErrors.value).toEqual(first)
    expect(form.fieldErrors.value).not.toBe(first)
  })

  it('showFormError — ошибка формы, поля очищены новым объектом', () => {
    const form = useAuthForm('verifyEmail')
    const before = form.fieldErrors.value

    form.showFormError('Ссылка не найдена')

    expect(form.formError.value).toBe('Ссылка не найдена')
    expect(form.fieldErrors.value).toEqual({})
    expect(form.fieldErrors.value).not.toBe(before)
  })
})
