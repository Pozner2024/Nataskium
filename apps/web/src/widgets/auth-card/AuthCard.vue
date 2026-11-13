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
          <NuxtLink class="auth-card__link" :to="localePath(AUTH_PATHS.login)">{{ t('auth.card.backToLogin') }}</NuxtLink>
        </p>
      </template>

      <template v-else-if="isStatusScreen">
        <div class="auth-card__alert" aria-live="polite">
          <p v-if="formError" class="auth-card__alert-text">
            <span>{{ formError }}</span>
          </p>
        </div>

        <AppButton v-if="mode === 'accountDeleted'" class="auth-card__action" color="blue" :to="localePath('/')">{{ t('auth.card.toHome') }}</AppButton>
        <template v-else-if="mode === 'accountNotDeleted'">
          <AppButton class="auth-card__action" color="blue" :to="localePath(TEACHER_PATHS.settings)">{{ t('auth.card.toSettings') }}</AppButton>
          <p class="auth-card__switch">
            <NuxtLink class="auth-card__link" :to="localePath('/')">{{ t('auth.card.toHome') }}</NuxtLink>
          </p>
        </template>
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
            :label="t('auth.field.name')"
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
            :label="t('auth.field.email')"
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
            :label="mode === 'resetPassword' ? t('auth.field.newPassword') : t('auth.field.password')"
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
          <NuxtLink class="auth-card__link" :to="localePath(AUTH_PATHS.forgotPassword)">{{ t('auth.card.forgotPasswordLink') }}</NuxtLink>
        </p>

        <template v-if="hasGoogle">
          <div class="auth-card__divider" aria-hidden="true">
            <span>{{ t('auth.card.or') }}</span>
          </div>

          <a class="auth-card__google" :href="googleStartUrl(currentLocale)">{{ t('auth.card.googleButton') }}</a>
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
import { useI18n, useLocalePath } from '#imports'
import { googleStartUrl } from '@/features/auth'
import { AppButton, AUTH_PATHS, AuthField, TEACHER_PATHS, useCurrentLocale } from '@/shared'
import type { AuthCardFieldName, AuthCardMode, AuthCardProps, AuthCardSubmitPayload } from './types'

const props = withDefaults(defineProps<AuthCardProps>(), { mode: 'login', isLoading: false, isSent: false, formError: undefined, fieldErrors: () => ({}) })

const emit = defineEmits<{
  submit: [payload: AuthCardSubmitPayload]
}>()

// Куда ведёт ссылка под формой: из входа — в регистрацию, из остальных режимов — ко входу
const SWITCH_PATHS: Partial<Record<AuthCardMode, string>> = { login: AUTH_PATHS.register }
// Режимы, у которых над ссылкой есть подпись («Нет аккаунта?»); остальным ссылка называется «Вернуться ко входу»
const MODES_WITH_SWITCH_TEXT: AuthCardMode[] = ['login', 'register', 'forgotPassword']
// Итоговые экраны режимов, где он свой. Для запроса сброса — одинаковый текст для любой почты: по экрану
// не понять, есть ли аккаунт
const SENT_KEYS_BY_MODE: Partial<Record<AuthCardMode, string>> = {
  forgotPassword: 'auth.card.sentForgotPassword',
  resetPassword: 'auth.card.sentResetPassword',
}
const SENT_KEYS_DEFAULT = 'auth.card.sent'
const STATUS_MODES: AuthCardMode[] = ['googleCallback', 'accountDeleted', 'accountNotDeleted']

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

const { t, te } = useI18n()
const currentLocale = useCurrentLocale()
const localePath = useLocalePath()

// Подписи, которых у режима нет (у экрана ожидания Google нет кнопки), — пустые
function optionalText(key: string): string {
  return te(key) ? t(key) : ''
}

const copy = computed(() => {
  const base = `auth.card.${props.mode}`
  const hasSwitchText = MODES_WITH_SWITCH_TEXT.includes(props.mode)
  return {
    title: t(`${base}.title`),
    subtitle: t(`${base}.subtitle`),
    submit: optionalText(`${base}.submit`),
    submitBusy: optionalText(`${base}.submitBusy`),
    switchText: hasSwitchText ? t(`${base}.switchText`) : '',
    switchLabel: hasSwitchText ? t(`${base}.switchLabel`) : t('auth.card.backToLogin'),
    switchTo: localePath(SWITCH_PATHS[props.mode] ?? AUTH_PATHS.login),
  }
})
// Почта — во входе, регистрации и запросе сброса; в остальных режимах её даёт ссылка. Google — только во входе
// и регистрации
const hasEmail = computed(() => props.mode === 'login' || props.mode === 'register' || props.mode === 'forgotPassword')
const hasPassword = computed(() => props.mode !== 'forgotPassword')
const hasGoogle = computed(() => props.mode === 'login' || props.mode === 'register')
// Экраны без формы: ожидание входа через Google и итог удаления аккаунта
const isStatusScreen = computed(() => STATUS_MODES.includes(props.mode))
const isNewPassword = computed(() => props.mode === 'register' || props.mode === 'resetPassword')
const heading = computed(() => {
  if (!props.isSent) return copy.value
  const base = SENT_KEYS_BY_MODE[props.mode] ?? SENT_KEYS_DEFAULT
  return { title: t(`${base}.title`), subtitle: t(`${base}.subtitle`) }
})

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

.auth-card__panel .auth-card__action {
  width: 100%;
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
