<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { TooltipProvider } from 'reka-ui'
import { Loader2 } from '@lucide/vue'
import AppHeader from './components/AppHeader.vue'
import DropZone from './components/DropZone.vue'
import ExportDialog from './components/ExportDialog.vue'
import HelpDialog from './components/HelpDialog.vue'
import MaskPanel from './components/MaskPanel.vue'
import PdfViewer from './components/PdfViewer.vue'
import Sidebar from './components/Sidebar.vue'
import Toaster from './components/Toaster.vue'
import ViewerToolbar from './components/ViewerToolbar.vue'
import { t } from '@/i18n'
import {
  addMask,
  deleteSelectedMask,
  doc,
  fitTo,
  nextPage,
  prevPage,
  redo,
  selectMask,
  setTool,
  state,
  undo,
  zoomBy,
} from '@/stores/editor'
import { loadSamplePdf, openFiles, openFromPicker } from '@/composables/useOpenPdf'

const dragging = ref(false)
let dragDepth = 0

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable ||
    !!target.closest('[role="dialog"]')
  )
}

function onKeyDown(event: KeyboardEvent) {
  const mod = event.metaKey || event.ctrlKey

  if (mod && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    openFromPicker()
    return
  }

  if (event.key === ' ' && !isEditable(event.target)) {
    event.preventDefault()
    state.spacePan = true
  }

  if (isEditable(event.target)) return
  if (!doc.value) return

  switch (event.key) {
    case 'ArrowRight':
    case 'PageDown':
      event.preventDefault()
      nextPage()
      break
    case 'ArrowLeft':
    case 'PageUp':
      event.preventDefault()
      prevPage()
      break
    case '+':
    case '=':
      event.preventDefault()
      zoomBy(1.25)
      break
    case '-':
    case '_':
      event.preventDefault()
      zoomBy(1 / 1.25)
      break
    case '0':
      event.preventDefault()
      fitTo('width')
      break
    case 'Delete':
    case 'Backspace':
      event.preventDefault()
      deleteSelectedMask()
      break
    case 'Escape':
      selectMask(null)
      state.panelOpen = false
      break
    case 'v':
    case 'V':
      setTool('select')
      break
    case 'h':
    case 'H':
      setTool('pan')
      break
    case 'z':
    case 'Z':
      if (mod) {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      break
    case 'y':
    case 'Y':
      if (mod) {
        event.preventDefault()
        redo()
      }
      break
    default:
      break
  }
}

function onKeyUp(event: KeyboardEvent) {
  if (event.key === ' ') state.spacePan = false
}

function onBlur() {
  state.spacePan = false
}

function onDragEnter(event: DragEvent) {
  if (!event.dataTransfer) return
  if (!Array.from(event.dataTransfer.types).includes('Files')) return
  dragDepth++
  dragging.value = true
}

function onDragOver(event: DragEvent) {
  if (!dragging.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  void openFiles(event.dataTransfer?.files ?? null)
}

function seedDemoMasks() {
  // coordinates line up with the rows of public/sample.pdf
  addMask({ page: 1, x: 0.208, y: 0.2215, w: 0.2, h: 0.021, style: 'pixelate', block: 18 })
  addMask({ page: 1, x: 0.208, y: 0.2748, w: 0.35, h: 0.021, style: 'blur', block: 14 })
  addMask({ page: 1, x: 0.208, y: 0.3282, w: 0.232, h: 0.021, style: 'solid', color: '#111827' })
  selectMask(null)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)

  const params = new URLSearchParams(window.location.search)
  if (params.get('demo') === '1') {
    void loadSamplePdf().then((ok) => {
      if (ok && params.get('seed') === '1') seedDemoMasks()
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('dragenter', onDragEnter)
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppHeader />

      <div class="relative flex min-h-0 flex-1">
        <Sidebar v-if="doc" />
        <main class="flex min-w-0 flex-1 flex-col">
          <ViewerToolbar v-if="doc" />
          <PdfViewer v-if="doc" />
          <DropZone v-else />
        </main>
        <MaskPanel v-if="doc" />
      </div>

      <Toaster />
      <ExportDialog />
      <HelpDialog />

      <div
        v-if="state.loading"
        class="fixed inset-0 z-90 grid place-items-center bg-background/70 backdrop-blur-sm"
      >
        <div class="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-xs shadow-xl">
          <Loader2 class="size-4 animate-spin" />
          {{ t('viewer.loading') }}
        </div>
      </div>

      <div
        v-if="dragging"
        class="pointer-events-none fixed inset-3 z-90 grid place-items-center rounded-2xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]"
      >
        <div class="rounded-xl bg-card px-4 py-2 text-sm font-medium shadow-lg">
          {{ t('drop.title') }}
        </div>
      </div>
    </div>
  </TooltipProvider>
</template>
