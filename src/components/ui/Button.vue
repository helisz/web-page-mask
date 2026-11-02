<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { buttonVariants, type ButtonVariants } from './button'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariants['variant']
    size?: ButtonVariants['size']
    type?: 'button' | 'submit' | 'reset'
    block?: boolean
  }>(),
  { variant: 'default', size: 'default', type: 'button', block: false },
)

const attrs = useAttrs()
const rest = computed(() =>
  Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== 'class')),
)
const classes = computed(() =>
  cn(
    buttonVariants({ variant: props.variant, size: props.size }),
    props.block && 'w-full',
    attrs.class as string,
  ),
)
</script>

<template>
  <button :type="type" :class="classes" v-bind="rest">
    <slot />
  </button>
</template>
