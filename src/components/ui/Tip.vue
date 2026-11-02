<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

withDefaults(defineProps<{ content: string; side?: 'top' | 'bottom' | 'left' | 'right' }>(), {
  side: 'bottom',
})
</script>

<template>
  <TooltipRoot :delay-duration="350">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :side-offset="6"
        class="z-100 max-w-64 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-md"
      >
        {{ content }}
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
