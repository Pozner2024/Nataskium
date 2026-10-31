<template>
  <header class="app-header" :class="{ 'app-header--menu-open': isMenuOpen, 'app-header--glow': hasGlow }">
    <!-- Затемнение и шторка идут в разметке раньше полосы шапки, чтобы рисоваться под ней -->
    <div class="app-header__dim" aria-hidden="true" @click="closeMenu" />

    <nav id="app-header-menu" ref="menu" class="app-header__menu" aria-label="Меню" :inert="!isMenuOpen">
      <ul class="app-header__list">
        <li v-for="item in MENU_ITEMS" :key="item.to">
          <NuxtLink class="app-header__item" exact-active-class="app-header__item--active" :to="item.to" @click="closeMenu">
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
      <button class="app-header__login" type="button">Войти</button>
    </nav>

    <div class="app-header__bar">
      <NuxtLink class="app-header__logo" to="/" @click="closeMenu">
        <AppLogo />
      </NuxtLink>

      <button
        ref="burger"
        class="app-header__burger"
        :class="{ 'app-header__burger--open': isMenuOpen }"
        type="button"
        :aria-label="isMenuOpen ? 'Закрыть меню' : 'Открыть меню'"
        :aria-expanded="isMenuOpen"
        aria-controls="app-header-menu"
        @click="toggleMenu"
      >
        <span class="app-header__line app-header__line--blue" />
        <span class="app-header__line app-header__line--green" />
        <span class="app-header__line app-header__line--orange" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from '#imports'
import { AppLogo } from '@/shared'

defineProps<{
  // Голубое пятно боке в правом углу — его продолжает фон первого экрана главной
  hasGlow?: boolean
}>()

interface MenuItem {
  label: string
  to: string
}

// Пункты добавятся вместе со страницами
const MENU_ITEMS: MenuItem[] = [{ label: 'Главная', to: '/' }]

const FOCUSABLE = 'a[href], button:not([disabled])'

const isMenuOpen = ref(false)
const menu = useTemplateRef<HTMLElement>('menu')
const burger = useTemplateRef<HTMLButtonElement>('burger')
const route = useRoute()

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function closeMenu() {
  isMenuOpen.value = false
}

function lockPageScroll(isLocked: boolean) {
  document.documentElement.style.overflow = isLocked ? 'hidden' : ''
}

// Пока шторка открыта, Tab ходит по кругу: бургер-крестик и элементы шторки.
// Переводим фокус сами: в разметке бургер стоит после шторки, и браузер увёл бы фокус на страницу
function trapFocus(event: KeyboardEvent) {
  if (!menu.value || !burger.value) return
  event.preventDefault()
  const focusable = [burger.value, ...menu.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const current = focusable.indexOf(document.activeElement as HTMLElement)
  const step = event.shiftKey ? -1 : 1
  const next = (current + step + focusable.length) % focusable.length
  focusable[next]?.focus({ preventScroll: true })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu()
    return
  }
  if (event.key === 'Tab') trapFocus(event)
}

// Слушаем document: клик по пустому месту шторки уводит фокус на body, и до шапки клавиши бы не дошли
function listenKeydown(isListening: boolean) {
  if (isListening) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
}

watch(isMenuOpen, async (isOpen) => {
  lockPageScroll(isOpen)
  listenKeydown(isOpen)
  await nextTick()
  if (isOpen) {
    // Без прокрутки: шапка липкая, а шторка в этот момент ещё выезжает — браузер прокрутил бы страницу к ней
    menu.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
    return
  }
  burger.value?.focus({ preventScroll: true })
})

watch(() => route.fullPath, closeMenu)

onBeforeUnmount(() => {
  lockPageScroll(false)
  listenKeydown(false)
})
</script>

<style scoped lang="scss">
$line-height: 4px;
$line-gap: 6px;
$line-step: $line-height + $line-gap;

$menu-duration: 0.3s;

// Шапка прилипает к верху экрана при прокрутке; шторка меню выезжает из-под неё в любом месте страницы
.app-header {
  position: sticky;
  top: 0;
  z-index: var(--z-header);
}

.app-header__bar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  background: var(--color-white);
}

// Центр пятна на 18px выше низа шапки — так же, как в HomeHero (at 112% -18px от его верха): шва нет
.app-header--glow .app-header__bar {
  background:
    radial-gradient(circle 200px at 112% calc(100% - 18px), rgb(var(--rgb-blue) / 0.38), rgb(var(--rgb-blue) / 0.16) 60%, transparent),
    var(--color-white);
}

.app-header__dim {
  position: fixed;
  inset: 0;
  background: rgb(var(--rgb-night) / 0.45);
  opacity: 0;
  visibility: hidden;
  transition:
    opacity $menu-duration ease,
    visibility 0s $menu-duration;
}

.app-header--menu-open .app-header__dim {
  opacity: 1;
  visibility: visible;
  transition: opacity $menu-duration ease;
}

// Шторка выезжает из-под полосы шапки
.app-header__menu {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 16px 22px;
  border-radius: 0 0 26px 26px;
  background: var(--color-white);
  box-shadow: 0 18px 34px rgb(var(--rgb-night) / 0.22);
  transform: translateY(-105%);
  visibility: hidden;
  transition:
    transform $menu-duration cubic-bezier(0.2, 0.8, 0.2, 1),
    visibility 0s $menu-duration;
}

.app-header--menu-open .app-header__menu {
  transform: translateY(0);
  visibility: visible;
  transition: transform $menu-duration cubic-bezier(0.2, 0.8, 0.2, 1);
}

.app-header__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-header__item {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 52px;
  padding: 0 16px;
  border-radius: 14px;
  color: var(--color-text);
  font-weight: 500;
  text-decoration: none;
  background: #f3f6fe;

  // Цветная точка: синий → зелёный → оранжевый по кругу, как полоски бургера
  &::before {
    content: '';
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-blue);
  }

  &:focus-visible {
    outline: 3px solid var(--color-text);
    outline-offset: 2px;
  }
}

li:nth-child(3n + 2) > .app-header__item::before {
  background: var(--color-green);
}

li:nth-child(3n + 3) > .app-header__item::before {
  background: var(--color-orange);
}

.app-header__item--active {
  background: #e6edfe;
  box-shadow: inset 0 0 0 2px var(--color-blue);
}

.app-header__login {
  min-height: 50px;
  border: 0;
  border-radius: 999px;
  color: var(--color-white);
  font: inherit;
  font-weight: 600;
  background: var(--color-blue-dark);
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid var(--color-text);
    outline-offset: 3px;
  }
}

.app-header__logo {
  display: flex;
  align-items: center;
  // Не меньше 120px: иначе глаза робо-«a» меньше 2px и моргание с улыбкой не читаются
  width: 120px;
  // Лого всего ~23px в высоту — зону нажатия добираем до 44px
  min-height: 44px;
}

// Полоски разной длины, выровнены по левому краю — цвета бренда
.app-header__burger {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: $line-gap;
  width: 44px;
  // Полоски прижаты влево внутри кнопки с отступом 8px — сдвигаем кнопку, чтобы полоски
  // заканчивались в 20px от края экрана, как лого начинается в 20px слева
  margin-right: -8px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 3px solid var(--color-text);
    outline-offset: 2px;
  }
}

.app-header__line {
  height: $line-height;
  border-radius: $line-height;
  transition:
    width 0.25s ease,
    transform 0.25s ease,
    opacity 0.2s ease;
}

.app-header__line--blue {
  width: 28px;
  background: var(--color-blue);
}

.app-header__line--green {
  width: 18px;
  background: var(--color-green);
}

.app-header__line--orange {
  width: 24px;
  background: var(--color-orange);
}

// Открыто: синяя и оранжевая сходятся в крестик через место зелёной, зелёная исчезает
.app-header__burger--open .app-header__line {
  width: 28px;
}

.app-header__burger--open .app-header__line--blue {
  transform: translateY($line-step) rotate(45deg);
}

.app-header__burger--open .app-header__line--green {
  opacity: 0;
}

.app-header__burger--open .app-header__line--orange {
  transform: translateY(-$line-step) rotate(-45deg);
}

@media (prefers-reduced-motion: reduce) {
  .app-header__line,
  .app-header__dim,
  .app-header__menu {
    transition: none !important;
  }
}
</style>
