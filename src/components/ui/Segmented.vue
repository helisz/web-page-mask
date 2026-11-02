<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

defineProps<{
  options: { value: T; label: string; icon?: Component; hint?: string }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="inline-flex w-full items-center gap-0.5 rounded-lg bg-muted p-0.5">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :title="option.hint"
      :aria-pressed="model === option.value"
      :class="
        cn(
          'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
          model === option.value
            ? 'bg-background text-foreground shadow-xs'
            : 'text-muted-foreground hover:text-foreground',
        )
      "
      @click="model = option.value"
    >
      <component :is="option.icon" v-if="option.icon" class="size-3.5" />
      {{ option.label }}
    </button>
  </div>
</template>
