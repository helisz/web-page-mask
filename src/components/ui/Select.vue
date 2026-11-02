<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

withDefaults(defineProps<{ options: { value: string; label: string }[]; ariaLabel?: string }>(), {
  ariaLabel: '',
})

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="relative">
    <select
      v-model="model"
      :aria-label="ariaLabel"
      class="h-9 w-full cursor-pointer appearance-none truncate rounded-md border border-input bg-transparent pr-8 pl-3 text-sm shadow-xs outline-none transition-[color,box-shadow,border-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/20"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <ChevronDown
      class="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
    />
  </div>
</template>
