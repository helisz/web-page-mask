<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Hand,
  Maximize2,
  PanelRight,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue'
import Button from './ui/Button.vue'
import Segmented from './ui/Segmented.vue'
import Tip from './ui/Tip.vue'
import { t } from '@/i18n'
import type { Tool } from '@/types'
import { fitTo, nextPage, prevPage, setPage, setTool, state, zoomBy, zoomToActual } from '@/stores/editor'

const pageText = ref(String(state.page))
const percent = ref(Math.round(state.zoom * 100))

watch(
  () => state.page,
  (page) => {
    pageText.value = String(page)
  },
)

watch(
  () => state.zoom,
  (zoom) => {
    percent.value = Math.round(zoom * 100)
  },
)

function commitPage() {
  const value = Number.parseInt(pageText.value, 10)
  if (Number.isFinite(value)) setPage(value)
  pageText.value = String(state.page)
}

const tool = ref<Tool>(state.tool)
watch(tool, (value) => setTool(value))
watch(
  () => state.tool,
  (value) => {
    tool.value = value
  },
)

const toolOptions = computed(() => [
  { value: 'select' as Tool, label: t('toolbar.select'), icon: Crosshair },
  { value: 'pan' as Tool, label: t('toolbar.pan'), icon: Hand },
])
</script>

<template>
  <div class="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 bg-background/70 px-2">
    <div class="flex items-center rounded-md border border-border/80">
      <Button
        variant="ghost"
        size="icon-sm"
        class="rounded-r-none"
        :disabled="state.page <= 1"
        :aria-label="t('toolbar.prev')"
        @click="prevPage()"
      >
        <ChevronLeft class="size-4" />
      </Button>
      <input
        v-model="pageText"
        inputmode="numeric"
        :aria-label="t('toolbar.pageInput')"
        class="h-8 w-10 border-x border-border/80 bg-transparent text-center text-xs tabular-nums outline-none focus:bg-accent/60"
        @change="commitPage"
        @blur="commitPage"
        @keydown.enter.prevent="commitPage"
      />
      <span class="px-2 text-[11px] text-muted-foreground tabular-nums">
        {{ t('common.of', { n: state.pageCount }) }}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        class="rounded-l-none"
        :disabled="state.page >= state.pageCount"
        :aria-label="t('toolbar.next')"
        @click="nextPage()"
      >
        <ChevronRight class="size-4" />
      </Button>
    </div>

    <div class="ml-1 flex items-center rounded-md border border-border/80">
      <Tip :content="t('toolbar.zoomOut')">
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-r-none"
          :aria-label="t('toolbar.zoomOut')"
          @click="zoomBy(1 / 1.2)"
        >
          <ZoomOut class="size-4" />
        </Button>
      </Tip>
      <button
        type="button"
        class="h-8 w-12 border-x border-border/80 text-center text-[11px] tabular-nums transition-colors hover:bg-accent/60"
        :title="t('toolbar.actual')"
        @click="zoomToActual()"
      >
        {{ percent }}%
      </button>
      <Tip :content="t('toolbar.zoomIn')">
        <Button
          variant="ghost"
          size="icon-sm"
          class="rounded-l-none"
          :aria-label="t('toolbar.zoomIn')"
          @click="zoomBy(1.2)"
        >
          <ZoomIn class="size-4" />
        </Button>
      </Tip>
    </div>

    <Tip :content="t('toolbar.fitWidth')">
      <Button
        variant="outline"
        size="sm"
        class="hidden border-border/80 sm:inline-flex"
        :aria-label="t('toolbar.fitWidth')"
        @click="fitTo('width')"
      >
        <Maximize2 class="size-3.5" />
        <span class="hidden lg:inline">{{ t('toolbar.fitWidth') }}</span>
      </Button>
    </Tip>
    <Tip :content="t('toolbar.fitPage')">
      <Button
        variant="outline"
        size="sm"
        class="hidden border-border/80 sm:inline-flex"
        :aria-label="t('toolbar.fitPage')"
        @click="fitTo('page')"
      >
        <Maximize2 class="size-3.5 rotate-45" />
        <span class="hidden lg:inline">{{ t('toolbar.fitPage') }}</span>
      </Button>
    </Tip>

    <div class="ml-auto flex items-center gap-1.5">
      <Segmented v-model="tool" :options="toolOptions" class="w-[124px] sm:w-[150px]" />
      <Button
        variant="ghost"
        size="icon-sm"
        class="md:hidden"
        :aria-label="t('panel.title')"
        @click="state.panelOpen = !state.panelOpen"
      >
        <PanelRight class="size-4" />
      </Button>
    </div>
  </div>
</template>
