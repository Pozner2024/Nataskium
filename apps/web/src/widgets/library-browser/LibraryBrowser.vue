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
      <ViewToggle :view="view" @update:view="setView" />

      <ul class="library-browser__list" :class="`library-browser__list--${view}`">
        <li v-for="quiz in quizzes" :key="quiz.number" class="library-browser__card">
          <IntroThemePreview :tone="findTheme(quiz.introTheme).tone">
            <ActivityThumbnail v-if="quiz.thumbnail" :thumbnail="quiz.thumbnail" />
          </IntroThemePreview>
          <div class="library-browser__info">
            <h2 class="library-browser__title">
              <NuxtLink class="library-browser__link" :to="localePath(libraryQuizPath(quiz.number, quiz.title))">{{ quiz.title }}</NuxtLink>
            </h2>
            <p class="library-browser__type">{{ t(`teacher.activityTypes.${quiz.type}.name`) }}</p>
            <p class="library-browser__meta">
              {{ groupName(quiz.groupSlug) }} · {{ countText(quiz.type, quiz.questionCount) }}
            </p>
            <p class="library-browser__grade" :class="{ 'library-browser__grade--none': !quiz.graded }">
              {{ quiz.graded ? t('library.graded') : t('library.notGraded') }}
            </p>
          </div>
          <div class="library-browser__actions">
            <TakeLibraryQuizButton
              compact
              :is-signed-in="auth.isAuthenticated"
              :is-ready="isSessionChecked"
              :take="() => take(quiz.number)"
              @taken="(quizId) => onTaken(quiz, quizId)"
              @login-required="isLoginOpen = true"
            />
          </div>
        </li>
      </ul>

      <p v-if="isMoreFailed" class="library-browser__hint" role="alert">{{ t('library.loadError') }}</p>
      <button v-if="hasNext" class="library-browser__button" type="button" :disabled="isLoadingMore" @click="loadMore">
        {{ isLoadingMore ? t('library.loading') : t('library.more') }}
      </button>
    </template>

    <LibraryLoginDialog :open="isLoginOpen" :login-to="loginTo" :register-to="localePath(AUTH_PATHS.register)" @close="isLoginOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { libraryQuizPath } from '@nataskium/shared/routes'
import { type ActivityKind, LIBRARY_SEARCH_MAX_LENGTH, LIBRARY_SEARCH_MIN_LENGTH } from '@nataskium/shared/schemas'
import { computed, onMounted, ref, toRef } from 'vue'
import { NuxtLink } from '#components'
import { navigateTo, useI18n, useLocalePath, useRoute } from '#imports'
import { ActivityThumbnail } from '@/entities/activity'
import { IntroThemePreview, findTheme } from '@/entities/intro-theme'
import { type LibraryListItem, libraryApi, useLibraryGroups } from '@/entities/library'
import { authorizedRequest, restoreSession, useAuthStore } from '@/features/auth'
import { TakeLibraryQuizButton, type TakenActivity, takenEditPath } from '@/features/take-library-quiz'
import { AUTH_PATHS, ViewToggle } from '@/shared'
import LibraryLoginDialog from './components/LibraryLoginDialog.vue'
import { useLibraryBrowser } from './useLibraryBrowser'
import { useLibraryView } from './useLibraryView'

const props = defineProps<{
  group: string
}>()

const { t } = useI18n()

// У сопоставления в questionCount — число пар, у да/нет — число утверждений
const COUNT_KEYS: Record<ActivityKind, string> = {
  quiz: 'library.questions',
  matching: 'teacher.activities.pairs',
  truefalse: 'library.statements',
}

function countText(type: ActivityKind, count: number): string {
  return t(COUNT_KEYS[type], { count })
}

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
const { view, setView } = useLibraryView()

function groupName(slug: string): string {
  return groups.value.find((item) => item.slug === slug)?.name ?? ''
}

const route = useRoute()
const auth = useAuthStore()
// Пока сессия не проверена, кнопки «Взять себе» выключены: гостя не примут за вошедшего
const isSessionChecked = ref(false)
const isLoginOpen = ref(false)

function take(number: number): Promise<TakenActivity> {
  return authorizedRequest((token) => libraryApi.take(number, token))
}

// Копия того же типа, что и задание в списке: по нему выбирается редактор
function onTaken(quiz: LibraryListItem, quizId: string): void {
  void navigateTo(localePath(takenEditPath({ quizId, type: quiz.type })))
}

// После входа учитель возвращается в тот же раздел и поиск; next проверит safeNextPath на странице входа
const loginTo = computed(() => ({ path: localePath(AUTH_PATHS.login), query: { next: route.fullPath } }))

onMounted(async () => {
  void loadGroups()
  void reload()
  // Статус 'unknown' после сетевой ошибки считаем гостем: кнопка включается и ведёт к окну входа
  try {
    await restoreSession()
  } finally {
    isSessionChecked.value = true
  }
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/breakpoints.module' as *;
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

.library-browser__list--tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @include tablet {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @include desktop {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.library-browser__list--list {
  gap: 10px;
}

.library-browser__card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border-radius: 22px;
  @include card-surface;
}

.library-browser__list--list .library-browser__card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  align-items: center;
}

.library-browser__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 4px 4px;
}

.library-browser__list--list .library-browser__info {
  padding: 0;
}

// Над растянутой ссылкой карточки: позиционированный блок позже в дереве рисуется поверх её ::after
.library-browser__actions {
  position: relative;
  margin-top: auto;
}

.library-browser__list--list .library-browser__actions {
  grid-column: 2;
  justify-self: start;
  width: min(100%, 220px);
  margin-top: 0;
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

.library-browser__type {
  margin: 0;
  color: var(--color-blue-dark);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
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
