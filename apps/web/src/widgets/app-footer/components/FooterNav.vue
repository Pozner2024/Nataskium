<template>
  <div class="footer-nav">
    <nav v-for="group in GROUPS" :key="group.title" class="footer-nav__group" :aria-labelledby="`footer-nav-${group.id}`">
      <h2 :id="`footer-nav-${group.id}`" class="footer-nav__title">{{ group.title }}</h2>
      <ul class="footer-nav__list">
        <li v-for="item in group.items" :key="item.label" class="footer-nav__item">
          <NuxtLink v-if="item.to" class="footer-nav__link" :to="item.to">{{ item.label }}</NuxtLink>
          <a v-else class="footer-nav__link" :href="item.href">{{ item.label }}</a>
        </li>
        <li v-if="group.id === 'navigation'" class="footer-nav__item footer-nav__item--language">
          <LanguageSwitcher />
        </li>
      </ul>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '#imports'
import { LanguageSwitcher } from '@/features/language-switcher'
import { SITE_LINKS, useSiteLink, useUnroutedPath } from '@/shared'
import type { ResolvedSiteLink } from '@/shared'

interface FooterGroup {
  id: string
  title: string
  items: ResolvedSiteLink[]
}

// Заглушка: заменить на настоящий адрес проекта. Личную почту здесь не публикуем — адрес видят все, включая спам-ботов
const CONTACT_EMAIL = 'hello@nataskium.com'

const { t } = useI18n()
const unroutedPath = useUnroutedPath()
const resolveLink = useSiteLink()

const GROUPS = computed<FooterGroup[]>(() => [
  {
    id: 'navigation',
    title: t('footer.navigation'),
    items: [SITE_LINKS.home, SITE_LINKS.login, SITE_LINKS.register, SITE_LINKS.library, SITE_LINKS.pricing].map(resolveLink),
  },
  {
    id: 'about',
    title: t('footer.about'),
    items: [
      resolveLink(SITE_LINKS.faq),
      // Заглушки: заменить на настоящие адреса
      { label: t('footer.author'), href: unroutedPath('/author') },
      { label: t('footer.privacy'), href: unroutedPath('/privacy') },
      { label: t('footer.refund'), href: unroutedPath('/refund') },
      { label: t('footer.contact', { email: CONTACT_EMAIL }), href: `mailto:${CONTACT_EMAIL}` },
      resolveLink(SITE_LINKS.help),
    ],
  },
])
</script>

<style scoped lang="scss">
.footer-nav {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.footer-nav__title {
  margin: 0 0 8px;
  color: var(--color-white);
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
}

.footer-nav__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.footer-nav__link {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding-block: 0;
  color: var(--color-night-text);
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
  border-radius: 4px;
  text-decoration: none;

  &:hover {
    color: var(--color-white);
  }

  &:active {
    color: var(--color-blue-light);
  }
}

// Переключатель остаётся частью навигационной колонки и выглядит как остальные ссылки футера.
.footer-nav__item--language :deep(.language-switcher) {
  width: 100%;
  color: var(--color-night-text);
}

.footer-nav__item--language :deep(.language-switcher__trigger) {
  min-height: 32px;
  padding: 0;
  border-radius: 4px;
  font-size: 14px;

  &:hover,
  &:focus-visible {
    background: none;
    color: var(--color-white);
  }
}
</style>
