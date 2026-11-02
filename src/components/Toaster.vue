<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, X } from '@lucide/vue'
import { dismissToast, toasts } from '@/composables/useToast'
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-0 bottom-4 z-100 flex flex-col items-center gap-2 px-4 sm:right-5 sm:left-auto sm:items-end"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border bg-card px-3 py-2 text-xs shadow-xl"
      >
        <CheckCircle2 v-if="item.tone === 'success'" class="mt-px size-3.5 shrink-0 text-emerald-500" />
        <AlertCircle v-else-if="item.tone === 'error'" class="mt-px size-3.5 shrink-0 text-destructive" />
        <Info v-else class="mt-px size-3.5 shrink-0 text-muted-foreground" />
        <span class="leading-relaxed break-words">{{ item.message }}</span>
        <button
          type="button"
          class="ml-auto rounded p-0.5 text-muted-foreground hover:text-foreground"
          @click="dismissToast(item.id)"
        >
          <X class="size-3" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
