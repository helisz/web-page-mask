<script setup lang="ts">
import { computed } from 'vue'
import {
  Circle,
  Download,
  Droplet,
  Eraser,
  Grid2x2,
  RectangleHorizontal,
  Redo2,
  Square,
  Trash2,
  Undo2,
  X,
} from '@lucide/vue'
import Button from './ui/Button.vue'
import Label from './ui/Label.vue'
import Segmented from './ui/Segmented.vue'
import Slider from './ui/Slider.vue'
import { t } from '@/i18n'
import type { MaskShape, MaskStyle } from '@/types'
import {
  clearAll,
  clearPage,
  deleteSelectedMask,
  historyState,
  masksOf,
  recordChange,
  redo,
  selectMask,
  selectedMask,
  setMaskShape,
  snapshotMasks,
  state,
  undo,
  updateMask,
} from '@/stores/editor'

const pageMasks = computed(() => masksOf(state.page))
const selected = computed(() => selectedMask())
const maskCount = computed(() => pageMasks.value.length)
const totalCount = computed(() => state.masks.length)

const styleOptions = computed(() => [
  { value: 'pixelate' as MaskStyle, label: t('panel.pixelate'), icon: Grid2x2 },
  { value: 'blur' as MaskStyle, label: t('panel.blur'), icon: Droplet },
  { value: 'solid' as MaskStyle, label: t('panel.solid'), icon: Square },
])

const shapeOptions = computed(() => [
  { value: 'rect' as MaskShape, label: t('panel.shapeRect'), icon: RectangleHorizontal },
  { value: 'square' as MaskShape, label: t('panel.shapeSquare'), icon: Square },
  { value: 'circle' as MaskShape, label: t('panel.shapeCircle'), icon: Circle },
])

const shape = computed<MaskShape>({
  get: () => selected.value?.shape ?? state.defaultShape,
  set: (value) => {
    const mask = selected.value
    if (!mask) {
      state.defaultShape = value
      return
    }
    const before = snapshotMasks()
    setMaskShape(mask.id, value)
    recordChange(before, `shape:${mask.id}`)
  },
})

const style = computed<MaskStyle>({
  get: () => selected.value?.style ?? state.defaultStyle,
  set: (value) => {
    const mask = selected.value
    if (!mask) {
      state.defaultStyle = value
      return
    }
    const before = snapshotMasks()
    updateMask(mask.id, { style: value })
    recordChange(before, `style:${mask.id}`)
  },
})

const block = computed<number>({
  get: () => Math.round(selected.value?.block ?? state.defaultBlock),
  set: (value) => {
    const mask = selected.value
    if (!mask) {
      state.defaultBlock = value
      return
    }
    const before = snapshotMasks()
    updateMask(mask.id, { block: value })
    recordChange(before, `block:${mask.id}`)
  },
})

const color = computed<string>({
  get: () => selected.value?.color ?? state.defaultColor,
  set: (value) => {
    const mask = selected.value
    if (!mask) {
      state.defaultColor = value
      return
    }
    const before = snapshotMasks()
    updateMask(mask.id, { color: value })
    recordChange(before, `color:${mask.id}`)
  },
})

const swatches = ['#000000', '#111827', '#1e293b', '#7f1d1d', '#f8fafc']

function styleName(value: MaskStyle) {
  if (value === 'pixelate') return t('panel.pixelate')
  if (value === 'blur') return t('panel.blur')
  return t('panel.solid')
}

function shapeName(value: MaskShape) {
  if (value === 'square') return t('panel.shapeSquare')
  if (value === 'circle') return t('panel.shapeCircle')
  return t('panel.shapeRect')
}

function removeOne(id: string) {
  selectMask(id)
  deleteSelectedMask()
}
</script>

<template>
  <div
    v-if="state.panelOpen"
    class="fixed inset-0 z-30 bg-black/40 md:hidden"
    @click="state.panelOpen = false"
  />

  <aside
    class="absolute inset-y-0 right-0 z-40 flex w-[86vw] max-w-xs flex-col border-l border-border/70 bg-card shadow-2xl transition-transform duration-200 ease-out md:static md:z-0 md:w-72 md:max-w-none md:translate-x-0 md:shadow-none"
    :class="state.panelOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'"
  >
    <div
      class="flex h-10 shrink-0 items-center justify-between border-b border-border/70 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
    >
      <span>{{ t('panel.title') }}</span>
      <div class="flex items-center gap-1">
        <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
          {{ t('panel.maskAll', { n: totalCount }) }}
        </span>
        <button
          type="button"
          class="rounded p-0.5 text-muted-foreground hover:text-foreground md:hidden"
          @click="state.panelOpen = false"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </div>

    <div class="scroll-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
      <section class="space-y-2">
        <Label>{{ t('panel.style') }}</Label>
        <Segmented v-model="style" :options="styleOptions" />
      </section>

      <section class="space-y-1.5">
        <Label>{{ t('panel.shape') }}</Label>
        <Segmented v-model="shape" :options="shapeOptions" />
        <p class="text-[10px] text-muted-foreground">{{ t('panel.shapeHint') }}</p>
      </section>

      <section v-if="style === 'pixelate'" class="space-y-1">
        <div class="flex items-center justify-between">
          <Label>{{ t('panel.block') }}</Label>
          <span class="text-[11px] text-muted-foreground tabular-nums">{{ block }} px</span>
        </div>
        <Slider v-model="block" :min="4" :max="48" :label="t('panel.block')" />
        <p class="text-[10px] text-muted-foreground">{{ t('panel.blockHint') }}</p>
      </section>

      <section v-else-if="style === 'blur'" class="space-y-1">
        <div class="flex items-center justify-between">
          <Label>{{ t('panel.blurAmount') }}</Label>
          <span class="text-[11px] text-muted-foreground tabular-nums">{{ block }} px</span>
        </div>
        <Slider v-model="block" :min="2" :max="48" :label="t('panel.blurAmount')" />
      </section>

      <section v-else class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>{{ t('panel.color') }}</Label>
          <code class="text-[10px] text-muted-foreground">{{ color }}</code>
        </div>
        <div class="flex items-center gap-2">
          <input
            v-model="color"
            type="color"
            class="size-8 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            :aria-label="t('panel.color')"
          />
          <button
            v-for="swatch in swatches"
            :key="swatch"
            type="button"
            class="size-6 rounded-md border border-border/80 shadow-xs transition-transform hover:scale-110"
            :style="{ backgroundColor: swatch }"
            :aria-label="swatch"
            @click="color = swatch"
          />
        </div>
      </section>

      <p class="rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {{ selected ? t('panel.targetSelected') : t('panel.targetDefault') }}
      </p>

      <section class="space-y-1.5">
        <div class="flex items-center justify-between">
          <Label>{{ t('panel.masks') }}</Label>
          <span class="text-[11px] text-muted-foreground tabular-nums">{{ maskCount }}</span>
        </div>

        <p v-if="!maskCount" class="rounded-md border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
          {{ t('panel.noMasks') }}
        </p>

        <ul v-else class="space-y-1">
          <li v-for="(mask, index) in pageMasks" :key="mask.id">
            <div
              class="group flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors"
              :class="
                mask.id === state.selectedId
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-border/70 hover:bg-accent/60'
              "
              @click="selectMask(mask.id)"
            >
              <span class="w-4 text-center font-mono text-[10px] text-muted-foreground">
                {{ index + 1 }}
              </span>
              <span class="flex-1 truncate">
                {{ styleName(mask.style) }}
                <span class="text-muted-foreground">· {{ shapeName(mask.shape) }}</span>
              </span>
              <span class="text-[10px] text-muted-foreground tabular-nums">{{ mask.block }}px</span>
              <button
                type="button"
                class="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                @click.stop="removeOne(mask.id)"
              >
                <X class="size-3" />
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="grid grid-cols-2 gap-1.5">
        <Button
          variant="outline"
          size="sm"
          :disabled="!selected"
          @click="deleteSelectedMask()"
        >
          <Trash2 class="size-3.5" />
          {{ t('panel.delete') }}
        </Button>
        <Button variant="outline" size="sm" :disabled="!maskCount" @click="clearPage(state.page)">
          <Eraser class="size-3.5" />
          {{ t('panel.clearPage') }}
        </Button>
        <Button variant="ghost" size="sm" :disabled="!historyState.canUndo" @click="undo()">
          <Undo2 class="size-3.5" />
          {{ t('panel.undo') }}
        </Button>
        <Button variant="ghost" size="sm" :disabled="!historyState.canRedo" @click="redo()">
          <Redo2 class="size-3.5" />
          {{ t('panel.redo') }}
        </Button>
      </section>

      <Button
        v-if="totalCount"
        variant="ghost"
        size="sm"
        block
        class="text-muted-foreground"
        @click="clearAll()"
      >
        {{ t('panel.clearAll') }}
      </Button>

      <Button block @click="state.exportOpen = true">
        <Download class="size-4" />
        {{ t('panel.export') }}
      </Button>

      <p class="text-[10px] leading-relaxed text-muted-foreground">{{ t('panel.hint') }}</p>
    </div>
  </aside>
</template>
