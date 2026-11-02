<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { exclusiveRender } from '@/lib/pdf'
import { paintMasks } from '@/lib/mosaic'
import { cn } from '@/lib/utils'
import type { SourceDoc } from '@/lib/source'
import type { Mask } from '@/types'

const props = defineProps<{
  doc: SourceDoc | null
  page: number
  masks: Mask[]
  active: boolean
}>()

const emit = defineEmits<{ select: [page: number] }>()

const root = ref<HTMLButtonElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const ready = ref(false)
const failed = ref(false)

let observer: IntersectionObserver | null = null
let base: HTMLCanvasElement | null = null
let pageWidthPt = 1

const THUMB_WIDTH = 132

async function render() {
  if (!props.doc || ready.value || failed.value) return
  try {
    const page = await props.doc.getPage(props.page)
    const size = page.size
    pageWidthPt = size.width
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (THUMB_WIDTH * dpr) / size.width
    const width = Math.max(1, Math.round(size.width * scale))
    const height = Math.max(1, Math.round(size.height * scale))

    const off = document.createElement('canvas')
    off.width = width
    off.height = height
    const ctx = off.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    await exclusiveRender(() => page.render(off, scale))
    base = off
    ready.value = true
    paint()
  } catch (error) {
    failed.value = true
    console.warn('[thumb] render failed', props.page, error)
  }
}

function paint() {
  const element = canvas.value
  if (!element || !base) return
  if (element.width !== base.width || element.height !== base.height) {
    element.width = base.width
    element.height = base.height
  }
  const ctx = element.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, element.width, element.height)
  ctx.drawImage(base, 0, 0)
  if (props.masks.length) {
    paintMasks(ctx, base, props.masks, element.width / pageWidthPt)
  }
}

watch(
  () => props.masks,
  () => paint(),
  { deep: true },
)

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void render()
        observer?.disconnect()
      }
    },
    { rootMargin: '320px 0px' },
  )
  if (root.value) observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  base = null
})
</script>

<template>
  <button
    ref="root"
    type="button"
    :title="doc?.pageLabel(page) ?? undefined"
    :class="
      cn(
        'group relative block w-full overflow-hidden rounded-md border bg-white p-0 text-left transition-all',
        active
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border/60 hover:border-foreground/30',
      )
    "
    @click="emit('select', page)"
  >
    <canvas ref="canvas" class="h-auto w-full" :class="ready ? 'block' : 'hidden'" />
    <span
      v-if="!ready && !failed"
      class="block aspect-[1/1.414] w-full animate-pulse bg-muted"
      aria-hidden="true"
    />
    <span
      class="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums"
    >
      {{ page }}
    </span>
  </button>
</template>
