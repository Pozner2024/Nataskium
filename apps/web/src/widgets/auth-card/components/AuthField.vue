<template>
  <div class="auth-field" :class="{ 'auth-field--invalid': error }">
    <label class="auth-field__label" :for="id">
      {{ label }}
      <span v-if="optional" class="auth-field__optional">необязательно</span>
    </label>

    <div class="auth-field__control">
      <input
        :id="id"
        ref="input"
        v-model="model"
        class="auth-field__input"
        :class="{ 'auth-field__input--password': type === 'password' }"
        :type="isRevealed ? 'text' : type"
        :autocomplete="autocomplete"
        :autocapitalize="type === 'email' ? 'none' : undefined"
        :spellcheck="type === 'text' ? undefined : 'false'"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? errorId : undefined"
      >

      <button
        v-if="type === 'password'"
        class="auth-field__reveal"
        type="button"
        aria-label="Показать пароль"
        :aria-pressed="isRevealed"
        :aria-controls="id"
        @click="isRevealed = !isRevealed"
      >
        <svg v-if="!isRevealed" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.7A17 17 0 0 0 2 12s3.6 6 10 6a9.6 9.6 0 0 0 5.4-1.6" />
        </svg>
      </button>
    </div>

    <p v-if="error" :id="errorId" class="auth-field__error">
      <svg class="auth-field__error-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" />
        <path d="M12 7v6M12 16.5v.5" />
      </svg>
      <span>{{ error }}</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

type FieldType = 'text' | 'email' | 'password'

const props = withDefaults(defineProps<{
  id: string
  label: string
  type?: FieldType
  autocomplete?: string
  error?: string
  required?: boolean
  optional?: boolean
}>(), { type: 'text', autocomplete: undefined, error: undefined, required: false, optional: false })

const model = defineModel<string>({ default: '' })

const input = useTemplateRef<HTMLInputElement>('input')
const isRevealed = ref(false)

const errorId = computed(() => `${props.id}-error`)

defineExpose({
  focus: () => input.value?.focus(),
})
</script>

<style scoped lang="scss">
.auth-field {
  display: flex;
  flex-direction: column;
}

.auth-field__label {
  margin-bottom: 8px;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.3;
}

.auth-field__optional {
  color: var(--color-text-muted);
  font-size: 14px;
}

.auth-field__control {
  position: relative;
}

.auth-field__input {
  width: 100%;
  min-height: 52px;
  padding: 12px 16px;
  border: 2px solid var(--color-text-muted);
  border-radius: 16px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  // 16px — меньше, и iOS Safari при фокусе увеличивает страницу
  font-size: 16px;
  line-height: 1.25;
  transition: border-color 0.2s ease;

  &:focus {
    border-color: var(--color-blue-dark);
  }

  // Иконка глаза справа: текст не должен под неё заходить
  &--password {
    padding-right: 56px;
  }
}

.auth-field--invalid .auth-field__input {
  border-color: var(--color-orange-dark);
}

// Кнопка 44px — минимум для касания; поле 52px, поэтому отступ 4px сверху и снизу
.auth-field__reveal {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  svg {
    width: 24px;
    height: 24px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  &:hover {
    background: rgb(var(--rgb-blue) / 0.1);
    color: var(--color-text);
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.2);
  }
}

// Текст ошибки чёрный, а не оранжевый: оранжево-тёмный на белом даёт 3.6:1, для текста мало
.auth-field__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 0 0;
  color: var(--color-text);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.4;
}

.auth-field__error-icon {
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
</style>
