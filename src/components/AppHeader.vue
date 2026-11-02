<script setup lang="ts">
import { computed } from 'vue'
import {
  Download,
  FilePlus2,
  FileText,
  Keyboard,
  Moon,
  ScanLine,
  Sun,
} from '@lucide/vue'
import Button from './ui/Button.vue'
import Select from './ui/Select.vue'
import Tip from './ui/Tip.vue'
import { t } from '@/i18n'
import { localeNames } from '@/i18n/messages'
import type { Locale } from '@/types'
import { doc, openHelp, setLocale, setTheme, state } from '@/stores/editor'
import { pickPdfFile } from '@/composables/useFilePicker'
import { openFiles } from '@/composables/useOpenPdf'

const localeOptions = (Object.keys(localeNames) as Locale[]).map((value) => ({
  value,
  label: localeNames[value],
}))

const locale = computed({
  get: () => state.locale as string,
  set: (value: string) => setLocale(value as Locale),
})

function pickFile() {
  pickPdfFile((file) => {
    void openFiles([file])
  })
}

function toggleTheme() {
  setTheme(state.theme === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <header
    class="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-card/50 px-2.5 backdrop-blur-sm sm:gap-3 sm:px-4"
  >
    <div class="flex items-center gap-2.5">
      <div
        class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm"
      >
        <ScanLine class="size-4" />
      </div>
      <div class="leading-tight">
        <div class="text-sm font-semibold tracking-tight">{{ t('app.name') }}</div>
        <div class="hidden text-[10px] text-muted-foreground sm:block">{{ t('app.tagline') }}</div>
      </div>
    </div>

    <div
      v-if="state.fileName && doc"
      class="hidden min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground lg:flex"
    >
      <FileText class="size-3.5 shrink-0" />
      <span class="max-w-[240px] truncate text-foreground/85">{{ state.fileName }}</span>
      <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
        {{ state.pageCount }} {{ t('common.page') }}
      </span>
    </div>

    <div class="ml-auto flex items-center gap-1 sm:gap-1.5">
      <Tip :content="t('header.shortcuts')">
        <Button variant="ghost" size="icon-sm" :aria-label="t('header.shortcuts')" @click="openHelp()">
          <Keyboard class="size-4" />
        </Button>
      </Tip>
      <Tip :content="t('header.theme')">
        <Button variant="ghost" size="icon-sm" :aria-label="t('header.theme')" @click="toggleTheme">
          <Sun v-if="state.theme === 'dark'" class="size-4" />
          <Moon v-else class="size-4" />
        </Button>
      </Tip>
      <div class="w-[104px] shrink-0">
        <Select v-model="locale" :options="localeOptions" :aria-label="t('header.language')" />
      </div>
      <Button variant="outline" size="sm" class="hidden sm:inline-flex" @click="pickFile">
        <FilePlus2 class="size-4" />
        <span class="hidden md:inline">{{ state.fileName ? t('header.change') : t('header.open') }}</span>
      </Button>
      <Button v-if="doc" size="sm" @click="state.exportOpen = true">
        <Download class="size-4" />
        <span class="hidden sm:inline">{{ t('header.export') }}</span>
      </Button>
    </div>
  </header>
</template>
