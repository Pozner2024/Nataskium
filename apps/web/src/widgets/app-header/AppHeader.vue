<template>
  <header class="app-header" :class="{ 'app-header--menu-open': isMenuOpen, 'app-header--glow': hasGlow }">
    <!-- Затемнение и шторка идут в разметке раньше полосы шапки, чтобы рисоваться под ней -->
    <div class="app-header__dim" aria-hidden="true" @click="closeMenu" />

    <nav id="app-header-menu" ref="menu" class="app-header__menu" aria-label="Меню" :inert="!isMenuOpen">
      <div ref="groups" class="app-header__groups">
        <ul v-for="(group, index) in MENU_GROUPS" :key="index" class="app-header__list">
          <li v-for="item in group" :key="item.label">
            <component :is="item.to ? NuxtLink : 'a'" class="app-header__item" v-bind="linkProps(item)" @click="closeMenu">
              {{ item.label }}
            </component>
          </li>
        </ul>
      </div>

      <div class="app-header__auth">
        <AppButton class="app-header__login" color="blue">Войти</AppButton>
        <component
          :is="REGISTER_LINK.to ? NuxtLink : 'a'"
          class="app-header__register"
          v-bind="linkProps(REGISTER_LINK)"
          @click="closeMenu"
        >
          {{ REGISTER_LINK.label }}
        </component>
      </div>
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
import { NuxtLink } from '#components'
import { useRoute } from '#imports'
import { AppButton, AppLogo, SITE_LINKS } from '@/shared'
import type { SiteLink } from '@/shared'

defineProps<{
  // Голубое пятно боке в правом углу — его продолжает фон первого экрана главной
  hasGlow?: boolean
}>()

const MENU_GROUPS: SiteLink[][] = [
  [SITE_LINKS.home, SITE_LINKS.library, SITE_LINKS.pricing],
  [SITE_LINKS.faq, SITE_LINKS.help, SITE_LINKS.language],
]

const REGISTER_LINK: SiteLink = SITE_LINKS.register

const FOCUSABLE = 'a[href], button:not([disabled])'

const isMenuOpen = ref(false)
const menu = useTemplateRef<HTMLElement>('menu')
const groups = useTemplateRef<HTMLElement>('groups')
const burger = useTemplateRef<HTMLButtonElement>('burger')
const route = useRoute()

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function closeMenu() {
  isMenuOpen.value = false
}

function linkProps({ to, href }: SiteLink) {
  return to ? { to, exactActiveClass: 'app-header__item--active' } : { href }
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
  // Без preventScroll: на низком экране пункт может быть за краем прокрутки панели
  focusable[next]?.focus()
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
    // Иначе после прошлого открытия первый пункт остался бы за краем прокрутки
    if (groups.value) groups.value.scrollTop = 0
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
@use 'sass:math';
@use '@/assets/styles/mixins' as *;

$line-height: 4px;
$line-gap: 6px;
$line-step: $line-height + $line-gap;
$line-width: 28px;
$line-width-green: 18px;
$line-width-orange: 24px;

// Короткая полоска бургера: прижата влево, как раньше при обычной ширине
@function shortened-line($width) {
  @return translateX(($width - $line-width) * 0.5) scaleX(math.div($width, $line-width));
}

$menu-duration: 0.45s;
$menu-easing: cubic-bezier(0.4, 0, 0.2, 1);
$menu-divider: 1px solid rgb(var(--rgb-blue) / 0.13);
$bar-height: 68px;

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
  min-height: $bar-height;
  padding: 12px var(--gutter);
  background: var(--color-white);
}

.app-header--glow .app-header__bar {
  background:
    header-glow(),
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

.app-header__menu {
  position: fixed;
  top: $bar-height;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(320px, 85%);
  overflow: hidden;
  border-radius: 0 0 0 26px;
  background: var(--color-white);
  box-shadow: -18px 0 34px rgb(var(--rgb-night) / 0.22);
  transform: translateX(100%);
  visibility: hidden;
  will-change: transform;
  transition:
    transform $menu-duration $menu-easing,
    visibility 0s $menu-duration;
}

.app-header--menu-open .app-header__menu {
  transform: translateX(0);
  visibility: visible;
  transition: transform $menu-duration $menu-easing;
}

.app-header--glow .app-header__menu {
  background:
    menu-glow(),
    var(--color-white);
}

// Прокручиваются только разделы: «Войти» на низком экране всегда на виду
.app-header__groups {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.app-header__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;

  // Линия на всю ширину панели, как над «Войти»
  & + & {
    margin-inline: -16px;
    padding: 12px 16px 0;
    border-top: $menu-divider;
  }
}

.app-header__item {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 8px 12px;
  border-radius: 14px;
  color: var(--color-text);
  font-weight: 500;
  line-height: 1.25;
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    background: rgb(var(--rgb-blue) / 0.13);
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.2);
  }

  &::before {
    content: '';
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-blue);
  }
}

li:nth-child(3n + 2) > .app-header__item::before {
  background: var(--color-green);
}

li:nth-child(3n + 3) > .app-header__item::before {
  background: var(--color-orange);
}

.app-header__item--active {
  background: rgb(var(--rgb-blue) / 0.13);
  box-shadow: inset 0 0 0 2px var(--color-blue);
}

.app-header__auth {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px 10px;
  border-top: $menu-divider;
}

// Селектор сильнее: ширина самой кнопки задана в AppButton, а порядок scoped-стилей не гарантирован
.app-header__menu .app-header__login {
  width: 100%;
}

.app-header__register {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  border-radius: 14px;
  color: var(--color-blue-dark);
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.2s ease;

  &:hover {
    background: rgb(var(--rgb-blue) / 0.065);
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.13);
  }
}

.app-header__logo {
  display: flex;
  align-items: center;
  // Не меньше 120px: иначе глаза робо-«a» меньше 2px и моргание с улыбкой не читаются
  width: 120px;
  min-height: 44px;
}

.app-header__burger {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: $line-gap;
  width: 44px;
  // Компенсирует padding: полоски заканчиваются в 20px от края экрана, как лого начинается слева
  margin-right: -8px;
  height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 12px;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.2s ease;

  // На телефоне :hover залипает после тапа, и подложка осталась бы после закрытия меню
  @media (hover: hover) {
    &:hover {
      background: rgb(var(--rgb-blue) / 0.1);
    }
  }

  &:active {
    background: rgb(var(--rgb-blue) / 0.2);
  }
}

.app-header__line {
  width: $line-width;
  height: $line-height;
  border-radius: $line-height;
  transition:
    transform 0.25s ease,
    opacity 0.2s ease;
}

.app-header__line--blue {
  background: var(--color-blue);
}

.app-header__line--green {
  background: var(--color-green);
  transform: shortened-line($line-width-green);
}

.app-header__line--orange {
  background: var(--color-orange);
  transform: shortened-line($line-width-orange);
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
  .app-header__item,
  .app-header__register,
  .app-header__burger,
  .app-header__line,
  .app-header__dim,
  .app-header__menu {
    transition: none !important;
  }
}
</style>
