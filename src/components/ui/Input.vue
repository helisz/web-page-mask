<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const model = defineModel<string | number>({ default: '' })
const attrs = useAttrs()
const rest = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class')),
)
const classes = computed(() =>
  cn(
    'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20',
    attrs.class as string,
  ),
)
</script>

<template>
  <input v-model="model" :class="classes" v-bind="rest" />
</template>
