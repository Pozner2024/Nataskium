<template>
  <ol class="library-true-false-preview">
    <li v-for="(statement, position) in statements" :key="position" class="library-true-false-preview__statement">
      <span class="library-true-false-preview__number" aria-hidden="true">{{ position + 1 }}</span>
      <span class="library-true-false-preview__text">{{ statement }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
defineProps<{ statements: string[] }>()
</script>

<style scoped lang="scss">
.library-true-false-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-true-false-preview__statement {
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

.library-true-false-preview__number {
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

.library-true-false-preview__text {
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: break-word;
}
</style>
