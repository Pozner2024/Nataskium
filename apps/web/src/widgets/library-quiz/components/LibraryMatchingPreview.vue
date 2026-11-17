<template>
  <div class="library-matching-preview">
    <section class="library-matching-preview__part" aria-labelledby="library-matching-definitions">
      <h3 id="library-matching-definitions" class="library-matching-preview__title">{{ t('library.matching.definitionsTitle') }}</h3>
      <ol class="library-matching-preview__definitions">
        <li v-for="(definition, position) in definitions" :key="position" class="library-matching-preview__definition">
          <span class="library-matching-preview__number" aria-hidden="true">{{ position + 1 }}</span>
          <span class="library-matching-preview__definition-text">{{ definition }}</span>
        </li>
      </ol>
    </section>

    <section class="library-matching-preview__part" aria-labelledby="library-matching-terms">
      <h3 id="library-matching-terms" class="library-matching-preview__title">{{ t('library.matching.termsTitle') }}</h3>
      <!-- Слова в порядке сервера: он их перемешал, связи с определениями в данных нет (ADR-0013) -->
      <ul class="library-matching-preview__terms">
        <li v-for="(term, position) in terms" :key="position" class="library-matching-preview__term">{{ term }}</li>
      </ul>
      <p class="library-matching-preview__note">{{ t('library.matching.termsNote') }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '#imports'

defineProps<{
  definitions: string[]
  terms: string[]
}>()

const { t } = useI18n()
</script>

<style scoped lang="scss">
.library-matching-preview {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.library-matching-preview__part {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.library-matching-preview__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
}

.library-matching-preview__definitions,
.library-matching-preview__terms {
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-matching-preview__definitions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.library-matching-preview__definition {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border: 2px solid rgb(var(--rgb-blue) / 0.2);
  border-radius: 18px;
  background: var(--color-white);
  box-shadow: 0 6px 16px rgb(var(--rgb-night) / 0.07);
}

.library-matching-preview__number {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgb(var(--rgb-blue) / 0.12);
  color: var(--color-blue-dark);
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
}

.library-matching-preview__definition-text {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: break-word;
}

.library-matching-preview__terms {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.library-matching-preview__term {
  max-width: 100%;
  padding: 8px 14px;
  border: 2px solid rgb(var(--rgb-blue) / 0.45);
  border-bottom-width: 4px;
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: break-word;
}

.library-matching-preview__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 15px;
  line-height: 1.4;
}
</style>
