<script setup lang="ts">
import { computed } from 'vue'
import ThumbItem from './ThumbItem.vue'
import { t } from '@/i18n'
import { doc, masksOf, setPage, state } from '@/stores/editor'

const pages = computed(() => Array.from({ length: state.pageCount }, (_, index) => index + 1))
</script>

<template>
  <aside class="hidden w-[156px] shrink-0 flex-col border-r border-border/70 bg-card/30 md:flex">
    <div
      class="flex h-10 shrink-0 items-center justify-between border-b border-border/70 px-3 text-[11px] font-medium text-muted-foreground"
    >
      <span>{{ t('thumb.title') }}</span>
      <span class="tabular-nums">{{ state.pageCount }}</span>
    </div>
    <div class="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
      <ThumbItem
        v-for="page in pages"
        :key="page"
        :doc="doc"
        :page="page"
        :masks="masksOf(page)"
        :active="page === state.page"
        @select="setPage(page)"
      />
    </div>
  </aside>
</template>
