<template>
  <nav class="teacher-tabs" :aria-label="t('teacher.tabs.label')">
    <ul class="teacher-tabs__list">
      <li v-for="tab in TABS" :key="tab.path" class="teacher-tabs__cell">
        <NuxtLink class="teacher-tabs__tab" :class="{ 'teacher-tabs__tab--create': tab.isCreate }" :to="localePath(tab.path)">
          <span class="teacher-tabs__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path :d="tab.icon" /></svg>
          </span>
          <span class="teacher-tabs__label">{{ t(tab.labelKey) }}</span>
        </NuxtLink>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { NuxtLink } from '#components'
import { useI18n, useLocalePath } from '#imports'
import { TEACHER_PATHS } from '@/shared'

// aria-current="page" ставит сам NuxtLink при точном совпадении адреса — по нему же подсвечивается вкладка
const TABS = [
  { path: TEACHER_PATHS.activities, labelKey: 'teacher.tabs.activities', icon: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01' },
  { path: TEACHER_PATHS.create, labelKey: 'teacher.tabs.create', icon: 'M12 6v12M6 12h12', isCreate: true },
  { path: TEACHER_PATHS.library, labelKey: 'teacher.tabs.library', icon: 'M4 19V5h4v14M8 19V5h5v14M13 19l2.5-14 4 .7-2.5 13.3M3 20h18' },
  {
    path: TEACHER_PATHS.settings,
    labelKey: 'teacher.tabs.settings',
    icon: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  },
]

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<style scoped lang="scss">
.teacher-tabs {
  border-bottom: 1px solid rgb(var(--rgb-blue) / 0.13);
  background: var(--color-white);
  box-shadow: 0 8px 20px rgb(var(--rgb-night) / 0.08);
}

.teacher-tabs__list {
  display: flex;
  margin: 0;
  padding: 0 4px;
  list-style: none;
}

// Ширина по содержимому плюс поровну свободного места: длинное «Einstellungen» не переносится на 320px
.teacher-tabs__cell {
  display: flex;
  flex: 1 1 auto;
}

.teacher-tabs__tab {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: var(--tabs-height);
  padding: 6px 4px 8px;
  border-radius: 12px;
  color: var(--color-text-muted);
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    color 0.2s ease,
    background-color 0.2s ease;

  &::after {
    content: '';
    position: absolute;
    right: 12px;
    bottom: 0;
    left: 12px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--color-blue);
    transform: scaleX(0);
    transition: transform 0.2s ease;
  }

  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.08);
      color: var(--color-text);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.14);
  }

  &:focus-visible {
    outline-offset: -3px;
  }

  &[aria-current='page'] {
    color: var(--color-blue-dark);

    &::after {
      transform: scaleX(1);
    }
  }
}

.teacher-tabs__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;

  svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

// Плюс в оранжевой плашке — той же высоты, что иконки соседних вкладок: панель не становится выше
.teacher-tabs__tab--create .teacher-tabs__icon {
  border-radius: 9px;
  background: var(--color-orange);
  box-shadow: 0 4px 10px rgb(var(--rgb-orange) / 0.35);

  svg {
    width: 18px;
    height: 18px;
    stroke: var(--color-white);
    stroke-width: 3;
  }
}

.teacher-tabs__label {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;

  .teacher-tabs__tab[aria-current='page'] & {
    font-weight: 700;
  }
}

@media (prefers-reduced-motion: reduce) {
  .teacher-tabs__tab,
  .teacher-tabs__tab::after {
    transition: none;
  }
}
</style>
