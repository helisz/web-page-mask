<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'reka-ui'

withDefaults(
  defineProps<{
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    label: string
  }>(),
  { min: 0, max: 100, step: 1, disabled: false },
)

const model = defineModel<number>({ required: true })

function onUpdate(value: number[] | undefined) {
  if (!value || !value.length) return
  model.value = value[0]!
}
</script>

<template>
  <SliderRoot
    :model-value="[model]"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :aria-label="label"
    class="relative flex w-full touch-none items-center py-1.5 select-none data-[disabled]:opacity-50"
    @update:model-value="onUpdate"
  >
    <SliderTrack class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-foreground/15">
      <SliderRange class="absolute h-full bg-foreground/70" />
    </SliderTrack>
    <SliderThumb
      class="block size-4 rounded-full border border-foreground/20 bg-background shadow-sm outline-none transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50"
    />
  </SliderRoot>
</template>
