<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from '@lucide/vue'

withDefaults(defineProps<{ title: string; description?: string; class?: string }>(), {
  description: '',
  class: '',
})

const open = defineModel<boolean>('open', { required: true })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=closed]:opacity-0"
      />
      <DialogContent
        :class="[
          'fixed top-1/2 left-1/2 z-50 max-h-[92dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6',
          $props.class,
        ]"
      >
        <div class="mb-4 flex items-start justify-between gap-4">
          <div class="space-y-1">
            <DialogTitle class="text-base font-semibold tracking-tight">
              {{ title }}
            </DialogTitle>
            <DialogDescription v-if="description" class="text-xs text-muted-foreground">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose
            class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X class="size-4" />
          </DialogClose>
        </div>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
