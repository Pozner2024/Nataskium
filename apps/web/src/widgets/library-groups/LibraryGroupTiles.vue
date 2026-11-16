<template>
  <nav class="library-group-tiles" :aria-label="t('library.groupsLabel')">
    <ul class="library-group-tiles__grid">
      <li
        v-for="group in groups"
        :key="group.slug"
        class="library-group-tiles__tile"
        :class="tileModifier(group.slug)"
      >
        <NuxtLink class="library-group-tiles__link" :to="localePath(libraryGroupPath(group.slug))">
          <span class="library-group-tiles__name">{{ group.name }}</span>
        </NuxtLink>
        <!-- Нат — игрушка рядом со ссылкой, а не внутри: кнопка внутри ссылки недопустима, а нажатие должно его оживлять, а не уводить со страницы -->
        <div v-if="NAT_BY_GROUP[group.slug]" class="library-group-tiles__nat">
          <StillNat>
            <component :is="NAT_BY_GROUP[group.slug]" tabindex="-1" aria-hidden="true" />
          </StillNat>
        </div>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import { libraryGroupPath } from '@nataskium/shared/routes'
import { type Component, onMounted } from 'vue'
import { NuxtLink } from '#components'
import { useI18n, useLocalePath } from '#imports'
import { useLibraryGroups } from '@/entities/library'
import { NatBrain, NatGalaxy, NatGeometry, NatLetters } from '@/shared'
import StillNat from './components/StillNat.vue'

type Accent = 'blue' | 'green' | 'orange'

// Нат — на четырёх плитках в шахматном порядке сетки 2 × 4 (ADR-0007). Порядок групп задаёт БД
const NAT_BY_GROUP: Partial<Record<string, Component>> = {
  exact: NatGeometry,
  natural: NatGalaxy,
  humanities: NatLetters,
  other: NatBrain,
}

// Плитки без Ната различаются цветом бренда; соседние по диагонали — разного цвета
const ACCENT_BY_GROUP: Partial<Record<string, Accent>> = {
  creative: 'orange',
  it: 'green',
  vocational: 'blue',
  skills: 'orange',
}

const { t } = useI18n()
const localePath = useLocalePath()
const { groups, load } = useLibraryGroups()

function tileModifier(slug: string): string {
  if (NAT_BY_GROUP[slug]) return 'library-group-tiles__tile--nat'
  return `library-group-tiles__tile--${ACCENT_BY_GROUP[slug] ?? 'blue'}`
}

onMounted(load)
</script>

<style scoped lang="scss">
@use '@/assets/styles/mixins' as *;

$tile-radius: 22px;
$nat-viewbox-width: 710;

.library-group-tiles__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-group-tiles__tile {
  --tile-rgb: var(--rgb-blue);
  --tile-color: var(--color-blue);

  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  grid-template-areas:
    'nat'
    'name';
  min-height: 176px;
  padding: 14px 12px;
  border-radius: $tile-radius;
  overflow: hidden;
  container-type: inline-size;
  border: 1px solid rgb(var(--tile-rgb) / 0.25);
  background: var(--color-white);
  box-shadow: 0 6px 18px rgb(var(--rgb-night) / 0.08);
  color: var(--color-text);
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  // Яркие дорожки платы цвета раздела — плитка без иллюстрации не выглядит пустой. Узор занимает верх до левой
  // рамки и неровным пятном уходит по диагонали в правый угол; к названию гаснет, текст стоит на чистом белом.
  // Пятно — сумма нескольких градиентов, пересечённая с узором
  &::before {
    $pattern: url('@/assets/images/nataskium-pcb-pattern.svg') 100% 0 / 260px auto no-repeat;
    $spot:
      radial-gradient(circle at 100% 0%, #000 0%, #000 30%, transparent 62%),
      radial-gradient(circle at 62% 8%, #000 0%, transparent 34%),
      radial-gradient(circle at 100% 46%, #000 0%, transparent 30%),
      linear-gradient(to bottom left, #000 0%, #000 22%, transparent 52%),
      linear-gradient(to bottom, #000 0%, #000 12%, transparent 30%);

    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--tile-color);
    -webkit-mask: $pattern, $spot;
    -webkit-mask-composite: source-in, source-over, source-over, source-over, source-over;
    mask: $pattern, $spot;
    mask-composite: intersect, add, add, add, add;
  }

  // Цветная «контактная площадка» над названием
  &::after {
    content: '';
    grid-area: nat;
    align-self: end;
    width: 28px;
    height: 6px;
    margin-bottom: 10px;
    border-radius: 3px;
    background: var(--tile-color);
  }

  @media (hover: hover) {
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px rgb(var(--rgb-night) / 0.14);
    }
  }

  &:active {
    transform: scale(0.98);
  }
}

.library-group-tiles__tile--green {
  --tile-rgb: var(--rgb-green);
  --tile-color: var(--color-green);
}

.library-group-tiles__tile--orange {
  --tile-rgb: var(--rgb-orange);
  --tile-color: var(--color-orange);
}

// Плитки с Натом — цвет низа футера, вокруг Ната лёгкое синее свечение
.library-group-tiles__tile--nat {
  background:
    radial-gradient(circle at 50% 38%, rgb(var(--rgb-blue) / 0.45) 0%, rgb(var(--rgb-blue) / 0.12) 45%, transparent 70%),
    var(--color-night);
  border: 0;
  color: var(--color-white);

  &::before,
  &::after {
    content: none;
  }
}

// Растянутая ссылка: её ::after накрывает всю плитку, поэтому нажатие в любом месте ведёт в раздел
.library-group-tiles__link {
  grid-area: name;
  color: inherit;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  // Рамка фокуса — на всей плитке: у плитки overflow: hidden, рамку ссылки она бы обрезала
  &:focus-visible {
    outline: none;
  }
}

.library-group-tiles__tile:has(.library-group-tiles__link:focus-visible) {
  outline: 3px solid var(--focus-color);
  outline-offset: 3px;
}

.library-group-tiles__name {
  display: block;
  font-size: 17px;
  font-weight: 800;
  line-height: 1.2;
  hyphens: auto;
  overflow-wrap: break-word;
}

// Позиционирован и стоит после ссылки — рисуется поверх её ::after, нажатие достаётся Нату
.library-group-tiles__nat {
  --nat-unit: calc(118cqi / #{$nat-viewbox-width});

  position: relative;
  grid-area: nat;
  justify-self: center;
  align-self: center;
  margin: -22px 0 -10px;
}

@media (prefers-reduced-motion: reduce) {
  .library-group-tiles__tile {
    transition: none;

    &:hover,
    &:active {
      transform: none;
    }
  }
}
</style>
