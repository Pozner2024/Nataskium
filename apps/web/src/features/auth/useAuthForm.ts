import { ref } from 'vue'
import { useNuxtApp } from '#imports'
import { type AuthFieldName, type AuthFormContext, type AuthFormErrors, type Translate, authErrorMessages, emptyFieldErrors, issuesToFormErrors } from './authErrors'

// Схемы из @nataskium/shared: та же проверка, что на сервере, — подсказки до запроса. Сервер проверяет снова
type InputSchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } }
}

export function useAuthForm(context: AuthFormContext) {
  // Переводчик берётся при создании формы, внутри setup: обработчики отправки вызываются уже после await
  const t: Translate = useNuxtApp().$i18n.t
  const isLoading = ref(false)
  const formError = ref<string | undefined>()
  // Каждый раз новый объект: AuthCard по смене объекта переводит фокус на первое поле с ошибкой
  const fieldErrors = ref<AuthFormErrors['fieldErrors']>({})

  function showErrors(errors: AuthFormErrors): void {
    formError.value = errors.formError
    fieldErrors.value = { ...errors.fieldErrors }
  }

  function showFormError(message: string): void {
    showErrors({ formError: message, fieldErrors: {} })
  }

  function clearErrors(): void {
    showErrors({ fieldErrors: {} })
  }

  // values — что ввёл учитель (для «Введите почту» у пустых полей), payload — что уйдёт в API
  async function submit<T>(
    schema: InputSchema<T>,
    values: Partial<Record<AuthFieldName, string>>,
    payload: unknown,
    action: (input: T) => Promise<void>,
  ): Promise<void> {
    if (isLoading.value) return

    const empty = emptyFieldErrors(t, values)
    if (Object.keys(empty).length > 0) {
      showErrors({ fieldErrors: empty })
      return
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({ path: issue.path.map(String), message: issue.message }))
      showErrors(issuesToFormErrors(t, context, issues))
      return
    }

    isLoading.value = true
    showErrors({ fieldErrors: {} })
    try {
      await action(parsed.data)
    } catch (error) {
      showErrors(authErrorMessages(t, context, error))
    } finally {
      isLoading.value = false
    }
  }

  return { isLoading, formError, fieldErrors, submit, showFormError, clearErrors }
}
