<script setup lang="ts">
import { computed } from 'vue'
import Modal from './ui/Modal.vue'
import { t } from '@/i18n'
import { state } from '@/stores/editor'

const open = computed({
  get: () => state.helpOpen,
  set: (value: boolean) => {
    state.helpOpen = value
  },
})

const rows = computed(() => [
  { keys: ['←', '→'], label: t('shortcuts.next') },
  { keys: ['+', '−'], label: t('shortcuts.zoom') },
  { keys: ['0'], label: t('shortcuts.fit') },
  { keys: ['Del'], label: t('shortcuts.delete') },
  { keys: ['⌘/Ctrl', 'Z'], label: t('shortcuts.undo') },
  { keys: ['Esc'], label: t('shortcuts.cancel') },
  { keys: ['Space'], label: t('shortcuts.pan') },
  { keys: ['V', 'H'], label: t('shortcuts.tools') },
  { keys: ['⌘/Ctrl', 'O'], label: t('shortcuts.open') },
])
</script>

<template>
  <Modal v-model:open="open" :title="t('shortcuts.title')">
    <ul class="divide-y divide-border/60 text-xs">
      <li
        v-for="row in rows"
        :key="row.label"
        class="flex items-center justify-between gap-4 py-2"
      >
        <span class="text-muted-foreground">{{ row.label }}</span>
        <span class="flex items-center gap-1">
          <kbd
            v-for="key in row.keys"
            :key="key"
            class="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] text-foreground shadow-xs"
          >
            {{ key }}
          </kbd>
        </span>
      </li>
    </ul>
  </Modal>
</template>
