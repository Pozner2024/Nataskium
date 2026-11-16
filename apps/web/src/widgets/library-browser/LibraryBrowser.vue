<template>
  <div class="library-browser">
    <form class="library-browser__search" role="search" @submit.prevent="applySearch">
      <label class="library-browser__search-label" for="library-search">{{ t('library.searchLabel') }}</label>
      <div class="library-browser__search-row">
        <input
          id="library-search"
          v-model="search"
          class="library-browser__search-input"
          type="search"
          :maxlength="LIBRARY_SEARCH_MAX_LENGTH"
          :placeholder="t('library.searchPlaceholder')"
          :aria-invalid="isSearchTooShort"
          :aria-describedby="isSearchTooShort ? 'library-search-hint' : undefined"
        >
        <button class="library-browser__search-button" type="submit">{{ t('library.search') }}</button>
      </div>
      <p v-if="isSearchTooShort" id="library-search-hint" class="library-browser__hint" role="alert">
        {{ t('library.searchTooShort', { min: LIBRARY_SEARCH_MIN_LENGTH }) }}
      </p>
    </form>

    <p v-if="status === 'loading'" class="library-browser__loading" role="status">{{ t('library.loading') }}</p>

    <div v-else-if="status === 'error'" class="library-browser__error">
      <p role="alert">{{ t('library.loadError') }}</p>
      <button class="library-browser__button" type="button" @click="reload">{{ t('library.retry') }}</button>
    </div>

    <p v-else-if="quizzes.length === 0" class="library-browser__empty" role="status">
      {{ appliedSearch === null ? t('library.empty') : t('library.nothingFound') }}
    </p>

    <template v-else>
      <ul class="library-browser__list">
        <li v-for="quiz in quizzes" :key="quiz.number" class="library-browser__card">
          <h2 class="library-browser__title">
            <NuxtLink class="library-browser__link" :to="localePath(libraryQuizPath(quiz.number, quiz.title))">{{ quiz.title }}</NuxtLink>
          </h2>
          <p class="library-browser__meta">
            {{ groupName(quiz.groupSlug) }} · {{ t('library.questions', { count: quiz.questionCount }) }}
          </p>
          <p class="library-browser__grade" :class="{ 'library-browser__grade--none': !quiz.graded }">
            {{ quiz.graded ? t('library.graded') : t('library.notGraded') }}
          </p>
        </li>
      </ul>

      <p v-if="isMoreFailed" class="library-browser__hint" role="alert">{{ t('library.loadError') }}</p>
      <button v-if="hasNext" class="library-browser__button" type="button" :disabled="isLoadingMore" @click="loadMore">
        {{ isLoadingMore ? t('library.loading') : t('library.more') }}
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { libraryQuizPath } from '@nataskium/shared/routes'
import { LIBRARY_SEARCH_MAX_LENGTH, LIBRARY_SEARCH_MIN_LENGTH } from '@nataskium/shared/schemas'
import { onMounted, toRef } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useLocalePath } from '#imports'
import { useLibraryGroups } from '@/entities/library'
import { useLibraryBrowser } from './useLibraryBrowser'

const props = defineProps<{
  group: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { groups, load: loadGroups } = useLibraryGroups()
const {
  search,
  appliedSearch,
  quizzes,
  hasNext,
  status,
  isLoadingMore,
  isMoreFailed,
  isSearchTooShort,
  reload,
  loadMore,
  applySearch,
} = useLibraryBrowser(toRef(props, 'group'))

function groupName(slug: string): string {
  return groups.value.find((item) => item.slug === slug)?.name ?? ''
}

onMounted(() => {
  void loadGroups()
  void reload()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

.library-browser {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.library-browser__search {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.library-browser__search-label {
  font-size: 15px;
  font-weight: 500;
}

.library-browser__search-row {
  display: flex;
  gap: 8px;
}

.library-browser__search-input {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 10px 14px;
  border: 2px solid var(--color-text-muted);
  border-radius: 14px;
  background: var(--color-white);
  color: var(--color-text);
  font: inherit;
  // 16px — меньше, и iOS Safari при фокусе увеличивает страницу
  font-size: 16px;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-blue-dark);
  }

  &[aria-invalid='true'] {
    border-color: var(--color-orange-dark);
  }
}

%soft-button {
  min-height: 48px;
  padding: 0 18px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-blue-dark);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  @media (hover: hover) {
    &:hover:not(:disabled) {
      background: rgb(var(--rgb-blue) / 0.16);
    }
  }

  &:active:not(:disabled) {
    background: rgb(var(--rgb-blue) / 0.24);
  }

  &:disabled {
    cursor: progress;
    opacity: 0.6;
  }
}

.library-browser__search-button {
  @extend %soft-button;

  flex: none;
}

.library-browser__button {
  @extend %soft-button;

  align-self: center;
}

.library-browser__hint {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
}

.library-browser__loading,
.library-browser__empty {
  margin: 24px 0 0;
  color: var(--color-text-muted);
  font-weight: 500;
  text-align: center;
}

.library-browser__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  text-align: center;

  p {
    margin: 0;
    font-weight: 500;
  }
}

.library-browser__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-browser__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px;
  border-radius: 22px;
  @include card-surface;
}

.library-browser__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.library-browser__link {
  color: inherit;
  text-decoration: none;

  // Вся плитка кликабельна: ссылка растянута на карточку, она же даёт зону касания ≥ 44px
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }

  &:focus-visible {
    outline: none;

    &::after {
      outline: 3px solid var(--color-blue-dark);
      outline-offset: 2px;
    }
  }

  @media (hover: hover) {
    &:hover {
      text-decoration: underline;
    }
  }
}

.library-browser__meta {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.library-browser__grade {
  align-self: flex-start;
  margin: 4px 0 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgb(var(--rgb-green) / 0.16);
  font-size: 13px;
  font-weight: 500;
}

.library-browser__grade--none {
  background: rgb(var(--rgb-blue) / 0.1);
  color: var(--color-text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .library-browser__search-button,
  .library-browser__button {
    transition: none;
  }
}
</style>
