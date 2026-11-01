<template>
  <div class="footer-nav">
    <nav v-for="group in GROUPS" :key="group.title" class="footer-nav__group" :aria-labelledby="`footer-nav-${group.id}`">
      <h2 :id="`footer-nav-${group.id}`" class="footer-nav__title">{{ group.title }}</h2>
      <ul class="footer-nav__list">
        <li v-for="item in group.items" :key="item.label" class="footer-nav__item">
          <NuxtLink v-if="item.to" class="footer-nav__link" :to="item.to">{{ item.label }}</NuxtLink>
          <a v-else class="footer-nav__link" :href="item.href">{{ item.label }}</a>
        </li>
      </ul>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { SITE_LINKS } from '@/shared'
import type { SiteLink } from '@/shared'

interface FooterGroup {
  id: string
  title: string
  items: SiteLink[]
}

// Заглушка: заменить на настоящий адрес проекта. Личную почту здесь не публикуем — адрес видят все, включая спам-ботов
const CONTACT_EMAIL = 'hello@nataskium.com'

const GROUPS: FooterGroup[] = [
  {
    id: 'navigation',
    title: 'Навигация',
    items: [
      SITE_LINKS.home,
      SITE_LINKS.login,
      SITE_LINKS.register,
      SITE_LINKS.library,
      SITE_LINKS.pricing,
      SITE_LINKS.language,
    ],
  },
  {
    id: 'about',
    title: 'О проекте',
    items: [
      SITE_LINKS.faq,
      // Заглушка: заменить на настоящий адрес
      { label: 'Создано Натальей Позняк', href: '/author' },
      { label: 'Политика конфиденциальности', href: '/privacy' },
      { label: 'Условия возврата', href: '/refund' },
      { label: `Связаться: ${CONTACT_EMAIL}`, href: `mailto:${CONTACT_EMAIL}` },
      SITE_LINKS.help,
    ],
  },
]
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
  min-height: 44px;
  padding-block: 4px;
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
</style>
