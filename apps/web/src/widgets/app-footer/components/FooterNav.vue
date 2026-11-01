<template>
  <div class="footer-nav">
    <nav v-for="group in GROUPS" :key="group.title" class="footer-nav__group" :aria-labelledby="`footer-nav-${group.id}`">
      <h2 :id="`footer-nav-${group.id}`" class="footer-nav__title">{{ group.title }}</h2>
      <ul class="footer-nav__list">
        <li v-for="item in group.items" :key="item.label" class="footer-nav__item">
          <NuxtLink v-if="item.to" class="footer-nav__link" :to="item.to">{{ item.label }}</NuxtLink>
          <a v-else-if="item.href" class="footer-nav__link" :href="item.href">{{ item.label }}</a>
          <span v-else class="footer-nav__text">{{ item.label }}</span>
        </li>
      </ul>
    </nav>
  </div>
</template>

<script setup lang="ts">
interface FooterItem {
  label: string
  // Внутренняя страница, которая уже есть
  to?: string
  // Страница, которой ещё нет, внешняя ссылка или mailto: — обычная ссылка без проверки маршрута
  href?: string
}

interface FooterGroup {
  id: string
  title: string
  items: FooterItem[]
}

// Заглушка: заменить на настоящий адрес проекта. Личную почту здесь не публикуем — адрес видят все, включая спам-ботов
const CONTACT_EMAIL = 'hello@nataskium.com'

// Страниц, кроме главной, пока нет: ссылки на будущие адреса идут через href, иначе роутер ругается
// на несуществующий маршрут. Когда страница появится — заменить href на to
const GROUPS: FooterGroup[] = [
  {
    id: 'navigation',
    title: 'Навигация',
    items: [
      { label: 'Главная', to: '/' },
      { label: 'Войти', href: '/login' },
      { label: 'Зарегистрироваться', href: '/register' },
      { label: 'Библиотека заданий', href: '/library' },
      { label: 'Тарифные планы', href: '/pricing' },
      // Переключатель появится вместе с переводами сайта
      { label: 'Язык: Русский' },
    ],
  },
  {
    id: 'about',
    title: 'О проекте',
    items: [
      { label: 'Вопросы и ответы', href: '/faq' },
      { label: 'Создано Натальей Позняк' },
      { label: 'Политика конфиденциальности', href: '/privacy' },
      { label: 'Условия возврата', href: '/refund' },
      { label: `Связаться: ${CONTACT_EMAIL}`, href: `mailto:${CONTACT_EMAIL}` },
      { label: 'Центр помощи', href: '/help' },
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

.footer-nav__link,
.footer-nav__text {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding-block: 4px;
  color: var(--color-night-text);
  font-size: 14px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.footer-nav__link {
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
