<template>
  <div class="auth-card">
    <div class="auth-card__panel">
      <svg v-if="isSent && mode !== 'resetPassword'" class="auth-card__mail" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M4 7l8 6 8-6" />
      </svg>

      <h1 ref="title" class="auth-card__title" tabindex="-1">{{ heading.title }}</h1>
      <p class="auth-card__subtitle">{{ heading.subtitle }}</p>

      <template v-if="isSent">
        <p class="auth-card__switch">
          <NuxtLink class="auth-card__link" :to="AUTH_PATHS.login">Вернуться ко входу</NuxtLink>
        </p>
      </template>

      <template v-else-if="mode === 'googleCallback'">
        <div class="auth-card__alert" aria-live="polite">
          <p v-if="formError" class="auth-card__alert-text">
            <span>{{ formError }}</span>
          </p>
        </div>
      </template>

      <template v-else>
        <form class="auth-card__form" novalidate :aria-busy="isLoading" @submit.prevent="onSubmit">
          <div class="auth-card__alert" aria-live="polite">
            <p v-if="formError" class="auth-card__alert-text">
              <svg class="auth-card__alert-icon" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="11" />
                <path d="M12 7v6M12 16.5v.5" />
              </svg>
              <span>{{ formError }}</span>
            </p>
          </div>

          <AuthField
            v-if="mode === 'register'"
            :id="fieldId('name')"
            ref="nameField"
            v-model="displayName"
            class="auth-card__field"
            label="Имя"
            autocomplete="name"
            optional
            :error="fieldErrors.displayName"
          />
          <AuthField
            v-if="hasEmail"
            :id="fieldId('email')"
            ref="emailField"
            v-model="email"
            class="auth-card__field"
            label="Почта"
            type="email"
            autocomplete="email"
            required
            :error="fieldErrors.email"
          />
          <AuthField
            v-if="hasPassword"
            :id="fieldId('password')"
            ref="passwordField"
            v-model="password"
            class="auth-card__field"
            :label="mode === 'resetPassword' ? 'Новый пароль' : 'Пароль'"
            type="password"
            :autocomplete="isNewPassword ? 'new-password' : 'current-password'"
            required
            :error="fieldErrors.password"
          />

          <AppButton class="auth-card__submit" type="submit" :disabled="isLoading">
            {{ isLoading ? copy.submitBusy : copy.submit }}
          </AppButton>
        </form>

        <p v-if="mode === 'login'" class="auth-card__switch">
          <NuxtLink class="auth-card__link" :to="AUTH_PATHS.forgotPassword">Забыли пароль?</NuxtLink>
        </p>

        <template v-if="hasGoogle">
          <div class="auth-card__divider" aria-hidden="true">
            <span>или</span>
          </div>

          <a class="auth-card__google" href="/api/auth/google/start">Войти через Google</a>
        </template>

        <p class="auth-card__switch">
          {{ copy.switchText }}
          <NuxtLink class="auth-card__link" :to="copy.switchTo">{{ copy.switchLabel }}</NuxtLink>
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { NuxtLink } from '#components'
import { AppButton, AUTH_PATHS } from '@/shared'
import AuthField from './components/AuthField.vue'
import type { AuthCardFieldName, AuthCardMode, AuthCardProps, AuthCardSubmitPayload } from './types'

const props = withDefaults(defineProps<AuthCardProps>(), { mode: 'login', isLoading: false, isSent: false, formError: undefined, fieldErrors: () => ({}) })

const emit = defineEmits<{
  submit: [payload: AuthCardSubmitPayload]
}>()

const COPY = {
  login: {
    title: 'Вход',
    subtitle: 'Войдите в кабинет учителя',
    submit: 'Войти',
    submitBusy: 'Входим…',
    switchText: 'Нет аккаунта?',
    switchLabel: 'Зарегистрироваться',
    switchTo: AUTH_PATHS.register,
  },
  register: {
    title: 'Регистрация',
    subtitle: 'Создайте аккаунт учителя',
    submit: 'Зарегистрироваться',
    submitBusy: 'Регистрируем…',
    switchText: 'Уже есть аккаунт?',
    switchLabel: 'Войти',
    switchTo: AUTH_PATHS.login,
  },
  // Ниже — режимы без макета: тексты и состав формы для проверки дизайнером
  verifyEmail: {
    title: 'Подтверждение почты',
    subtitle: 'Введите пароль, который вы задали при регистрации',
    submit: 'Подтвердить',
    submitBusy: 'Подтверждаем…',
    switchText: '',
    switchLabel: 'Вернуться ко входу',
    switchTo: AUTH_PATHS.login,
  },
  linkGoogle: {
    title: 'Вход через Google',
    subtitle: 'У вас уже есть аккаунт с этой почтой. Введите его пароль, чтобы входить и через Google',
    submit: 'Связать и войти',
    submitBusy: 'Связываем…',
    switchText: '',
    switchLabel: 'Вернуться ко входу',
    switchTo: AUTH_PATHS.login,
  },
  forgotPassword: {
    title: 'Восстановление пароля',
    subtitle: 'Введите почту аккаунта — пришлём ссылку для нового пароля',
    submit: 'Отправить ссылку',
    submitBusy: 'Отправляем…',
    switchText: 'Вспомнили пароль?',
    switchLabel: 'Войти',
    switchTo: AUTH_PATHS.login,
  },
  resetPassword: {
    title: 'Новый пароль',
    subtitle: 'Придумайте новый пароль. Слишком простые пароли не подойдут',
    submit: 'Сохранить пароль',
    submitBusy: 'Сохраняем…',
    switchText: '',
    switchLabel: 'Вернуться ко входу',
    switchTo: AUTH_PATHS.login,
  },
  googleCallback: {
    title: 'Входим через Google',
    subtitle: 'Секунду…',
    submit: '',
    submitBusy: '',
    switchText: '',
    switchLabel: '',
    switchTo: AUTH_PATHS.login,
  },
} as const

const SENT_COPY = {
  title: 'Проверьте почту',
  subtitle: 'Мы отправили письмо со ссылкой. Откройте его и подтвердите почту.',
}
// Итоговые экраны режимов, где он свой. Для запроса сброса — одинаковый текст для любой почты: по экрану
// не понять, есть ли аккаунт
const SENT_COPY_BY_MODE: Partial<Record<AuthCardMode, { title: string; subtitle: string }>> = {
  forgotPassword: {
    title: 'Проверьте почту',
    subtitle: 'Если аккаунт с этой почтой есть, мы отправили письмо со ссылкой для нового пароля.',
  },
  resetPassword: {
    title: 'Пароль изменён',
    subtitle: 'Войдите с новым паролем. На других устройствах нужно будет войти заново.',
  },
}

// Порядок фокуса совпадает с порядком полей на экране
const FIELD_FOCUS_ORDER: AuthCardFieldName[] = ['displayName', 'email', 'password']

const uid = useId()
const displayName = ref('')
const email = ref('')
const password = ref('')

const title = useTemplateRef<HTMLHeadingElement>('title')
const nameField = useTemplateRef<InstanceType<typeof AuthField>>('nameField')
const emailField = useTemplateRef<InstanceType<typeof AuthField>>('emailField')
const passwordField = useTemplateRef<InstanceType<typeof AuthField>>('passwordField')
const fieldRefs = { displayName: nameField, email: emailField, password: passwordField }

const copy = computed(() => COPY[props.mode])
// Почта — во входе, регистрации и запросе сброса; в остальных режимах её даёт ссылка. Google — только во входе
// и регистрации
const hasEmail = computed(() => props.mode === 'login' || props.mode === 'register' || props.mode === 'forgotPassword')
const hasPassword = computed(() => props.mode !== 'forgotPassword')
const hasGoogle = computed(() => props.mode === 'login' || props.mode === 'register')
const isNewPassword = computed(() => props.mode === 'register' || props.mode === 'resetPassword')
const heading = computed(() => (props.isSent ? (SENT_COPY_BY_MODE[props.mode] ?? SENT_COPY) : copy.value))

function fieldId(name: string) {
  return `${uid}-${name}`
}

function onSubmit() {
  if (props.mode === 'forgotPassword') {
    emit('submit', { email: email.value })
    return
  }
  if (!hasEmail.value) {
    emit('submit', { password: password.value })
    return
  }
  emit('submit', props.mode === 'register'
    ? { email: email.value, password: password.value, displayName: displayName.value }
    : { email: email.value, password: password.value })
}

// Новый объект ошибок — сигнал к фокусу; если поле уже с ошибкой и её перезаписали, объект меняется снова
watch(() => props.fieldErrors, (errors) => {
  const firstInvalid = FIELD_FOCUS_ORDER.find((name) => errors[name])
  if (firstInvalid) fieldRefs[firstInvalid].value?.focus()
})

// Экран «Проверьте почту» заменяет форму, с которой был фокус: переводим его на заголовок
watch(() => props.isSent, async (isSent) => {
  if (!isSent) return
  await nextTick()
  title.value?.focus()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.auth-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 420px;
  margin-top: 24px;
}

.auth-card__panel {
  width: 100%;
  padding: 24px 24px 20px;
  border-radius: 28px;
  background: var(--color-white);
  box-shadow: 0 18px 40px rgb(var(--rgb-night) / 0.14);
}

.auth-card__mail {
  display: block;
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  fill: none;
  stroke: var(--color-green-dark);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.auth-card__title {
  @include section-title;

  margin-bottom: 8px;
}

.auth-card__subtitle {
  @include body-text;

  margin-bottom: 20px;
  color: var(--color-text-muted);
}

.auth-card__form {
  display: flex;
  flex-direction: column;
}

.auth-card__alert:not(:empty) {
  margin-bottom: 16px;
}

.auth-card__alert-text {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgb(var(--rgb-orange) / 0.14);
  color: var(--color-text);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
}

.auth-card__alert-icon {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 1px;
  fill: var(--color-orange-dark);

  path {
    fill: none;
    stroke: var(--color-white);
    stroke-width: 2.4;
    stroke-linecap: round;
  }
}

.auth-card__field + .auth-card__field {
  margin-top: 16px;
}

.auth-card__form .auth-card__submit {
  width: 100%;
  margin-top: 20px;
}

.auth-card__divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0;
  color: var(--color-text-muted);
  font-size: 14px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgb(var(--rgb-blue) / 0.18);
  }
}

// Обычная ссылка на вход через Google: полный переход, без fetch
.auth-card__google {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 12px 16px;
  box-sizing: border-box;
  border: 2px solid var(--color-text-muted);
  border-radius: 999px;
  color: var(--color-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    background: rgb(var(--rgb-blue) / 0.1);
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.2);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.auth-card__switch {
  margin: 16px 0 0;
  color: var(--color-text-muted);
  font-size: 15px;
  text-align: center;
}

.auth-card__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 6px;
  border-radius: 10px;
  color: var(--color-blue-dark);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    background: rgb(var(--rgb-blue) / 0.1);
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.2);
  }
}
</style>
