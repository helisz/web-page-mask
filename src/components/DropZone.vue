<script setup lang="ts">
import { FilePlus2, ShieldCheck, Sparkles } from '@lucide/vue'
import Button from './ui/Button.vue'
import { t } from '@/i18n'
import { state } from '@/stores/editor'
import { loadSample, loadErrorMessage, openFromPicker } from '@/composables/useOpenDocument'
</script>

<template>
  <div
    data-testid="drop-zone"
    class="stage-bg flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6"
  >
    <div
      class="w-full max-w-lg rounded-2xl border border-dashed border-border/80 bg-card/80 p-7 text-center shadow-2xl backdrop-blur-sm sm:p-9"
    >
      <div
        class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg"
      >
        <FilePlus2 class="size-6" />
      </div>
      <h2 class="text-lg font-semibold tracking-tight">{{ t('drop.title') }}</h2>
      <p class="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {{ t('drop.desc') }}
      </p>

      <div class="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
        <Button class="w-full sm:w-auto" @click="openFromPicker()">
          <FilePlus2 class="size-4" />
          {{ t('drop.choose') }}
        </Button>
        <Button variant="outline" class="w-full sm:w-auto" @click="loadSample()">
          <Sparkles class="size-4" />
          {{ t('drop.sample') }}
        </Button>
      </div>

      <p class="mt-4 text-[10px] text-muted-foreground">{{ t('drop.hint') }}</p>
      <p class="mt-1 text-[10px] text-muted-foreground/80">{{ t('drop.formats') }}</p>

      <div
        v-if="state.loadErrorKey"
        class="mt-5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-left text-[11px] text-destructive"
      >
        {{ loadErrorMessage() }}
      </div>

      <div
        class="mt-6 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-left text-[10px] leading-relaxed text-muted-foreground"
      >
        <ShieldCheck class="mt-px size-3.5 shrink-0" />
        <span>{{ t('drop.privacy') }}</span>
      </div>
    </div>
  </div>
</template>
