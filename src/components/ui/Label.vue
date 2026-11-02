<script setup lang="ts">
import { cn } from '@/lib/utils'

defineProps<{ for?: string; class?: string }>()
</script>

<template>
  <label
    :for="$props.for"
    :class="cn('flex items-center gap-1.5 text-xs font-medium text-muted-foreground select-none', $props.class)"
  >
    <slot />
  </label>
</template>
