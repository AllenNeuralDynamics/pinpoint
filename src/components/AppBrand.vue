<script setup lang="ts">
const BASE_URL = import.meta.env.BASE_URL;
</script>

<template>
  <div class="app-brand">
    <img
      :src="`${BASE_URL}images/logo.svg`"
      class="app-brand__logo"
      :alt="$t('brand.institute')"
      width="26"
      height="32"
    />
    <div class="app-brand__text">
      <span class="app-brand__top">
        {{ $t("brand.institute") }}
        <span class="app-brand__dept">{{ $t("brand.department") }}</span>
      </span>
      <span class="app-brand__app">{{ $t("brand.app") }}</span>
    </div>
  </div>
</template>

<style lang="sass" scoped>
.app-brand
  display: flex
  align-items: center
  gap: 10px

.app-brand__logo
  display: block
  height: 30px
  width: auto
  flex-shrink: 0

// The mark is solid black artwork, so dark mode inverts it rather than shipping
// a second asset.
body.body--dark .app-brand__logo
  filter: invert(1)

.app-brand__text
  display: flex
  flex-direction: column
  line-height: 1.2
  font-family: $headline-font-family
  font-size: 0.8rem
  white-space: nowrap

.app-brand__top
  font-weight: 500
  color: var(--text-muted)

.app-brand__dept
  color: var(--text-secondary)

.app-brand__app
  font-weight: 700
  color: var(--text-primary)
</style>
