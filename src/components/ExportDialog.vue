<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, Download, Loader2 } from '@lucide/vue'
import Modal from './ui/Modal.vue'
import Button from './ui/Button.vue'
import Input from './ui/Input.vue'
import Label from './ui/Label.vue'
import Segmented from './ui/Segmented.vue'
import Slider from './ui/Slider.vue'
import Switch from './ui/Switch.vue'
import { t } from '@/i18n'
import type { ExportFormat, ExportSettings, SizeMode } from '@/types'
import { computeExportSize, exportPages } from '@/lib/export'
import { baseName, formatInt, parsePageRange } from '@/lib/utils'
import { doc, state } from '@/stores/editor'
import { toast } from '@/composables/useToast'

type Scope = 'current' | 'all' | 'range'

const open = computed({
  get: () => state.exportOpen,
  set: (value: boolean) => {
    if (!value && busy.value) return
    state.exportOpen = value
  },
})

const settings = reactive<ExportSettings>({
  format: 'png',
  sizeMode: 'px',
  width: 1240,
  height: 1754,
  lockRatio: true,
  dpi: 144,
  quality: 0.92,
})

const scope = ref<Scope>('current')
const rangeText = ref('')
const fileName = ref('')
const busy = ref(false)
const error = ref('')
const progress = reactive({ done: 0, total: 0 })

const scopeOptions = computed(() => [
  { value: 'current' as Scope, label: t('export.scopeCurrent', { n: state.page }) },
  { value: 'all' as Scope, label: t('export.scopeAll', { n: state.pageCount }) },
  { value: 'range' as Scope, label: t('export.scopeRange') },
])

const formatOptions = computed(() => [
  { value: 'png' as ExportFormat, label: t('export.formatPng') },
  { value: 'jpeg' as ExportFormat, label: t('export.formatJpeg') },
])

const modeOptions = computed(() => [
  { value: 'px' as SizeMode, label: t('export.modePx') },
  { value: 'dpi' as SizeMode, label: t('export.modeDpi') },
])

const pages = computed<number[]>(() => {
  if (scope.value === 'all') {
    return Array.from({ length: state.pageCount }, (_, index) => index + 1)
  }
  if (scope.value === 'range') {
    return parsePageRange(rangeText.value, state.pageCount) ?? []
  }
  return [state.page]
})

const rangeInvalid = computed(() => scope.value === 'range' && pages.value.length === 0)

const size = computed(() => computeExportSize(state.pageSize, settings))

const stretchWarning = computed(
  () =>
    settings.sizeMode === 'px' &&
    !settings.lockRatio &&
    Math.abs(
      settings.height - (settings.width * state.pageSize.height) / state.pageSize.width,
    ) > 2,
)

const canExport = computed(
  () => !busy.value && pages.value.length > 0 && !!doc.value && !rangeInvalid.value,
)

const progressPercent = computed(() =>
  progress.total ? Math.round((progress.done / progress.total) * 100) : 0,
)

watch(
  () => state.exportOpen,
  (value) => {
    if (!value) return
    error.value = ''
    busy.value = false
    progress.done = 0
    progress.total = 0
    scope.value = 'current'
    rangeText.value = ''
    fileName.value = baseName(state.fileName)
    settings.format = 'png'
    settings.sizeMode = 'px'
    settings.lockRatio = true
    settings.quality = 0.92
    settings.dpi = 144
    settings.width = Math.round(state.pageSize.width * 2)
    settings.height = Math.round(state.pageSize.height * 2)
  },
)

watch(
  () => settings.width,
  (width) => {
    if (settings.sizeMode !== 'px' || !settings.lockRatio) return
    settings.height = Math.round((width * state.pageSize.height) / state.pageSize.width)
  },
)

watch(
  () => settings.lockRatio,
  (locked) => {
    if (!locked) return
    settings.height = Math.round((settings.width * state.pageSize.height) / state.pageSize.width)
  },
)

watch(
  () => settings.sizeMode,
  (mode) => {
    if (mode === 'px') {
      settings.width = Math.round((state.pageSize.width * settings.dpi) / 72)
      settings.height = Math.round((state.pageSize.height * settings.dpi) / 72)
    }
  },
)

function applyPreset(dpi: number) {
  settings.dpi = dpi
  settings.width = Math.round((state.pageSize.width * dpi) / 72)
  settings.height = Math.round((state.pageSize.height * dpi) / 72)
}

function toNumber(value: string | number, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

async function runExport() {
  const current = doc.value
  if (!current || !pages.value.length || busy.value) return
  busy.value = true
  error.value = ''
  progress.done = 0
  progress.total = pages.value.length

  try {
    const result = await exportPages({
      doc: current,
      pages: pages.value,
      masks: state.masks,
      settings: { ...settings },
      fileName: fileName.value.trim() || baseName(state.fileName),
      onProgress: (done, total) => {
        progress.done = done
        progress.total = total
      },
    })
    toast(t('export.done', { n: result.count }), 'success')
    if (result.clamped) {
      toast(t('export.clamped', { w: formatInt(size.value.width), h: formatInt(size.value.height) }), 'error', 6000)
    }
    busy.value = false
    state.exportOpen = false
  } catch (cause) {
    busy.value = false
    error.value = cause instanceof Error ? cause.message : String(cause)
    toast(t('export.failed', { msg: error.value }), 'error', 6000)
  }
}

const presets = computed(() => [
  { dpi: 72, label: t('export.presetActual'), recommended: false },
  { dpi: 144, label: t('export.presetHd'), recommended: true },
  { dpi: 288, label: t('export.presetUltra'), recommended: false },
  { dpi: 300, label: t('export.presetPrint'), recommended: false },
])
</script>

<template>
  <Modal
    v-model:open="open"
    :title="t('export.title')"
    :description="t('export.desc')"
    class="max-w-xl"
  >
    <div class="space-y-4">
      <section class="space-y-1.5">
        <Label>{{ t('export.scope') }}</Label>
        <Segmented v-model="scope" :options="scopeOptions" />
        <div v-if="scope === 'range'" class="space-y-1 pt-0.5">
          <Input
            v-model="rangeText"
            :placeholder="t('export.rangePlaceholder')"
            class="h-8 text-xs"
          />
          <p v-if="rangeInvalid" class="text-[10px] text-destructive">
            {{ t('export.rangeInvalid') }}
          </p>
          <p v-else class="text-[10px] text-muted-foreground">
            {{ t('export.scopeCount', { n: pages.length }) }}
          </p>
        </div>
      </section>

      <section class="space-y-1.5">
        <Label>{{ t('export.format') }}</Label>
        <Segmented v-model="settings.format" :options="formatOptions" />
      </section>

      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <Label>{{ t('export.size') }}</Label>
          <Segmented v-model="settings.sizeMode" :options="modeOptions" class="w-[168px]" />
        </div>

        <div v-if="settings.sizeMode === 'px'" class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <Label for="export-width">{{ t('export.width') }}</Label>
            <Input
              id="export-width"
              type="number"
              min="16"
              :model-value="settings.width"
              @update:model-value="(value) => (settings.width = toNumber(value, settings.width))"
            />
          </div>
          <div class="space-y-1">
            <Label for="export-height">{{ t('export.height') }}</Label>
            <Input
              id="export-height"
              type="number"
              min="16"
              :disabled="settings.lockRatio"
              :model-value="settings.height"
              class="disabled:opacity-70"
              @update:model-value="(value) => (settings.height = toNumber(value, settings.height))"
            />
          </div>
        </div>

        <div v-else class="space-y-1">
          <Label for="export-dpi">{{ t('export.dpi') }}</Label>
          <Input
            id="export-dpi"
            type="number"
            min="36"
            max="1200"
            :model-value="settings.dpi"
            @update:model-value="(value) => (settings.dpi = toNumber(value, settings.dpi))"
          />
        </div>

        <div class="flex items-center gap-1.5 pt-0.5">
          <span class="text-[10px] text-muted-foreground">{{ t('export.presets') }}</span>
          <button
            v-for="preset in presets"
            :key="preset.dpi"
            type="button"
            class="rounded-md border px-2 py-0.5 text-[10px] transition-colors hover:bg-accent"
            :class="
              settings.dpi === preset.dpi
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-border/70 text-muted-foreground'
            "
            @click="applyPreset(preset.dpi)"
          >
            {{ preset.label }}
            <span v-if="preset.recommended" class="text-primary">·{{ t('export.recommended') }}</span>
          </button>
        </div>

        <div
          v-if="settings.sizeMode === 'px'"
          class="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1.5"
        >
          <Label>{{ t('export.lock') }}</Label>
          <Switch v-model="settings.lockRatio" />
        </div>

        <div
          class="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs"
        >
          <span class="text-muted-foreground">{{ t('export.output') }}</span>
          <span class="text-right">
            <span class="font-medium tabular-nums">
              {{ t('export.pixels', { w: formatInt(size.width), h: formatInt(size.height) }) }}
            </span>
            <span class="ml-1.5 text-[10px] text-muted-foreground">
              {{ t('export.dpiHint', { dpi: size.dpi }) }}
            </span>
          </span>
        </div>

        <p v-if="stretchWarning" class="flex items-center gap-1 text-[10px] text-amber-500">
          <AlertTriangle class="size-3" />
          {{ t('export.stretch') }}
        </p>
        <p v-if="size.clamped" class="flex items-center gap-1 text-[10px] text-amber-500">
          <AlertTriangle class="size-3" />
          {{ t('export.clamped', { w: formatInt(size.width), h: formatInt(size.height) }) }}
        </p>
      </section>

      <section v-if="settings.format === 'jpeg'" class="space-y-1">
        <div class="flex items-center justify-between">
          <Label>{{ t('export.quality') }}</Label>
          <span class="text-[11px] text-muted-foreground tabular-nums">
            {{ Math.round(settings.quality * 100) }}%
          </span>
        </div>
        <Slider
          v-model="settings.quality"
          :min="0.4"
          :max="1"
          :step="0.01"
          :label="t('export.quality')"
        />
      </section>

      <section class="space-y-1">
        <Label for="export-name">{{ t('export.filename') }}</Label>
        <Input id="export-name" v-model="fileName" class="h-8 text-xs" />
      </section>

      <p v-if="pages.length > 1" class="text-[10px] text-muted-foreground">
        {{ t('export.zipHint') }}
      </p>

      <div v-if="busy" class="space-y-1.5">
        <div class="flex items-center justify-between text-[11px] text-muted-foreground">
          <span class="flex items-center gap-1.5">
            <Loader2 class="size-3 animate-spin" />
            {{ t('export.exporting', { done: progress.done, total: progress.total }) }}
          </span>
          <span class="tabular-nums">{{ progressPercent }}%</span>
        </div>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-all duration-200"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
      </div>

      <p v-if="error" class="text-[11px] text-destructive">{{ t('export.failed', { msg: error }) }}</p>

      <div class="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" :disabled="busy" @click="open = false">
          {{ t('export.cancel') }}
        </Button>
        <Button size="sm" :disabled="!canExport" @click="runExport()">
          <Download class="size-4" />
          {{ busy ? t('export.exporting', { done: progress.done, total: progress.total }) : t('export.start') }}
        </Button>
      </div>
    </div>
  </Modal>
</template>
