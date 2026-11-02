<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui'

const model = defineModel<boolean>({ default: false })
</script>

<template>
  <SwitchRoot
    v-model="model"
    class="inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-foreground/25 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary"
  >
    <SwitchThumb
      class="block size-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5"
    />
  </SwitchRoot>
</template>
